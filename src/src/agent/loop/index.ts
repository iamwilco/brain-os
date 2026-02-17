/**
 * Agent Loop - Main Entry Point
 * 
 * Integrates all stages: INTAKE → CONTEXT → EXECUTE → PERSIST
 * 
 * This is the single entry point for agent execution, used by the chat endpoint.
 */

import { intake, releaseIntake, isIntakeError, intakeErrorToHttpStatus, type IntakeInput, type IntakeOutput } from './intake.js';
import { context, contextRequiresAction, type ContextInput, type ContextOutput } from './context.js';
import { execute, type ExecuteInput, type ExecuteOutput, type LLMHandler, type ToolExecutor, placeholderToolExecutor } from './execute.js';
import { createDefaultLLMHandler } from '../../llm/handler.js';
import { persist, hasCriticalFailures, type PersistInput, type PersistOutput } from './persist.js';

/**
 * Agent loop input
 */
export interface AgentLoopInput {
  /** User message */
  message: string;
  /** Vault path */
  vaultPath: string;
  /** Agent path (optional - will resolve from other params) */
  agentPath?: string;
  /** Agent ID (optional - alternative to agentPath) */
  agentId?: string;
  /** Project root path (optional - for project agents) */
  projectRootPath?: string;
  /** Session ID (optional - resumes existing session) */
  sessionId?: string;
  /** Force new session */
  newSession?: boolean;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Agent loop output
 */
export interface AgentLoopOutput {
  /** Whether the loop completed successfully */
  success: boolean;
  /** Final response from agent */
  response: string;
  /** Session ID (for continuation) */
  sessionId: string;
  /** Run ID for this execution */
  runId: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Error if failed */
  error?: {
    code: string;
    message: string;
    httpStatus: number;
  };
  /** Stage outputs for debugging */
  stages?: {
    intake?: IntakeOutput;
    context?: ContextOutput;
    execute?: ExecuteOutput;
    persist?: PersistOutput;
  };
}

/**
 * Agent loop configuration
 */
export interface AgentLoopConfig {
  /** LLM handler implementation */
  llmHandler?: LLMHandler;
  /** Tool executor implementation */
  toolExecutor?: ToolExecutor;
  /** Include stage outputs in result (for debugging) */
  includeStageOutputs?: boolean;
  /** Context window size */
  contextWindow?: number;
  /** Reserved tokens for response */
  reserveTokens?: number;
}

const DEFAULT_CONFIG: AgentLoopConfig = {
  llmHandler: createDefaultLLMHandler(),
  toolExecutor: placeholderToolExecutor,
  includeStageOutputs: false,
  contextWindow: 100_000,
  reserveTokens: 4_000,
};

/**
 * Execute the complete agent loop
 * 
 * INTAKE → CONTEXT → EXECUTE → PERSIST
 * 
 * @param input - Loop input parameters
 * @param config - Optional configuration
 * @returns Loop output with response and metadata
 */
export async function runAgentLoop(
  input: AgentLoopInput,
  config: AgentLoopConfig = {}
): Promise<AgentLoopOutput> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  let intakeOutput: IntakeOutput | undefined;
  let contextOutput: ContextOutput | undefined;
  let executeOutput: ExecuteOutput | undefined;
  let persistOutput: PersistOutput | undefined;
  
  try {
    // ═══════════════════════════════════════════════════════════════════
    // STAGE 1: INTAKE
    // Validate input, resolve agent, acquire lock
    // ═══════════════════════════════════════════════════════════════════
    
    const intakeInput: IntakeInput = {
      message: input.message,
      vaultPath: input.vaultPath,
      agentPath: input.agentPath,
      agentId: input.agentId,
      projectRootPath: input.projectRootPath,
      sessionId: input.sessionId,
      newSession: input.newSession,
    };
    
    intakeOutput = await intake(intakeInput);
    
    // ═══════════════════════════════════════════════════════════════════
    // STAGE 2: CONTEXT
    // Load memory, build system prompt, estimate tokens
    // ═══════════════════════════════════════════════════════════════════
    
    const contextInput: ContextInput = {
      intake: intakeOutput,
      message: input.message,
      contextWindow: cfg.contextWindow,
      reserveTokens: cfg.reserveTokens,
    };
    
    contextOutput = await context(contextInput);
    
    // Check if context needs intervention
    const contextAction = contextRequiresAction(contextOutput);
    if (contextAction.action === 'compact') {
      // TODO: Implement compaction in future task
      // For now, continue with warning
      console.warn('Context compaction needed but not implemented:', contextAction.reason);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // STAGE 3: EXECUTE
    // Send to LLM, handle tools, get response
    // ═══════════════════════════════════════════════════════════════════
    
    const executeInput: ExecuteInput = {
      context: contextOutput,
      message: input.message,
      scope: intakeOutput.agentDef.frontmatter.scope,
      abortSignal: input.abortSignal,
    };
    
    executeOutput = await execute(
      executeInput,
      cfg.llmHandler,
      cfg.toolExecutor
    );
    
    // Check for abort
    if (executeOutput.aborted) {
      return {
        success: false,
        response: executeOutput.response,
        sessionId: intakeOutput.sessionId,
        runId: intakeOutput.runId,
        usage: executeOutput.usage,
        error: {
          code: 'ABORTED',
          message: 'Execution was aborted',
          httpStatus: 499,
        },
        stages: cfg.includeStageOutputs ? { intake: intakeOutput, context: contextOutput, execute: executeOutput } : undefined,
      };
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // STAGE 4: PERSIST
    // Write transcript, update session, release lock
    // ═══════════════════════════════════════════════════════════════════
    
    const persistInput: PersistInput = {
      intake: intakeOutput,
      message: input.message,
      execute: executeOutput,
      flushMemory: contextOutput.needsFlush,
      memoryUpdates: [], // TODO: Extract memory updates from response
    };
    
    persistOutput = await persist(persistInput);
    
    // Check for critical failures
    if (hasCriticalFailures(persistOutput)) {
      return {
        success: false,
        response: executeOutput.response,
        sessionId: intakeOutput.sessionId,
        runId: intakeOutput.runId,
        usage: executeOutput.usage,
        error: {
          code: 'PERSIST_FAILED',
          message: `Persist stage failed: ${persistOutput.errors.join(', ')}`,
          httpStatus: 500,
        },
        stages: cfg.includeStageOutputs ? { intake: intakeOutput, context: contextOutput, execute: executeOutput, persist: persistOutput } : undefined,
      };
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // SUCCESS
    // ═══════════════════════════════════════════════════════════════════
    
    return {
      success: true,
      response: executeOutput.response,
      sessionId: intakeOutput.sessionId,
      runId: intakeOutput.runId,
      usage: executeOutput.usage,
      stages: cfg.includeStageOutputs ? { intake: intakeOutput, context: contextOutput, execute: executeOutput, persist: persistOutput } : undefined,
    };
    
  } catch (error) {
    // Handle intake errors specially (they have HTTP status codes)
    if (isIntakeError(error)) {
      return {
        success: false,
        response: '',
        sessionId: input.sessionId || '',
        runId: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        error: {
          code: error.code,
          message: error.message,
          httpStatus: intakeErrorToHttpStatus(error.code),
        },
      };
    }
    
    // Generic error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Ensure lock is released if we have intake output
    if (intakeOutput) {
      try {
        releaseIntake(intakeOutput);
      } catch {
        // Ignore release errors during error handling
      }
    }
    
    return {
      success: false,
      response: '',
      sessionId: intakeOutput?.sessionId || input.sessionId || '',
      runId: intakeOutput?.runId || '',
      usage: executeOutput?.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      error: {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
        httpStatus: 500,
      },
      stages: cfg.includeStageOutputs ? { intake: intakeOutput, context: contextOutput, execute: executeOutput, persist: persistOutput } : undefined,
    };
  }
}

// Re-export types and utilities for convenience
export {
  IntakeError,
  isIntakeError,
  intakeErrorToHttpStatus,
  type IntakeInput,
  type IntakeOutput,
} from './intake.js';

export {
  type ContextOutput,
  type ToolDef,
} from './context.js';

export {
  type ExecuteOutput,
  type ToolCall,
  type ToolResult,
  type TokenUsage,
  type LLMHandler,
  type ToolExecutor,
  placeholderLLMHandler,
  placeholderToolExecutor,
} from './execute.js';

export {
  type PersistOutput,
} from './persist.js';
