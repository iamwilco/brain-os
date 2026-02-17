/**
 * CONTEXT Stage - Agent Loop Stage 2
 * 
 * Assembles everything the model needs to respond.
 * 
 * Required Outputs:
 * - systemPrompt: string - Complete system prompt
 * - history: Message[] - Conversation history
 * - tools: ToolDef[] - Available tools
 * - tokenEstimate: number - Estimated context tokens
 * - memoryContext: string - Loaded memory content
 */

import type { AgentDefinition } from '../parser.js';
import type { TranscriptMessage } from '../session.js';
import { readTranscript } from '../session.js';
import { loadMemory, type AgentMemory } from '../memory.js';
import { buildSystemPrompt } from '../chat.js';
import type { IntakeOutput } from './intake.js';

/**
 * Tool definition for agent
 */
export interface ToolDef {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/**
 * CONTEXT stage input
 */
export interface ContextInput {
  /** Output from INTAKE stage */
  intake: IntakeOutput;
  /** User message */
  message: string;
  /** Model context window size (tokens) */
  contextWindow?: number;
  /** Reserve tokens for response */
  reserveTokens?: number;
  /** Threshold for memory flush (percentage of context window) */
  flushThreshold?: number;
}

/**
 * CONTEXT stage output
 */
export interface ContextOutput {
  /** Complete system prompt */
  systemPrompt: string;
  /** Conversation history */
  history: TranscriptMessage[];
  /** Available tools */
  tools: ToolDef[];
  /** Estimated token count */
  tokenEstimate: number;
  /** Loaded memory content */
  memoryContext: string;
  /** Memory object (for later updates) */
  memory: AgentMemory | null;
  /** Whether context needs compaction */
  needsCompaction: boolean;
  /** Whether memory flush should happen */
  needsFlush: boolean;
}

/**
 * CONTEXT stage configuration
 */
export interface ContextConfig {
  /** Model context window size in tokens */
  contextWindow: number;
  /** Reserve tokens for response generation */
  reserveTokens: number;
  /** Flush threshold as percentage of context window (0-1) */
  flushThreshold: number;
  /** Compaction threshold as percentage of context window (0-1) */
  compactionThreshold: number;
  /** Maximum history messages to load */
  maxHistoryMessages: number;
  /** Number of recent tool results to keep */
  keepRecentToolResults: number;
}

const DEFAULT_CONFIG: ContextConfig = {
  contextWindow: 100_000,      // Claude default
  reserveTokens: 4_000,        // Reserve for response
  flushThreshold: 0.7,         // 70% triggers flush warning
  compactionThreshold: 0.85,   // 85% triggers compaction
  maxHistoryMessages: 100,     // Max messages to load
  keepRecentToolResults: 5,    // Keep last 5 tool results
};

/**
 * Estimate tokens for a string (rough approximation)
 * Uses ~4 chars per token as a conservative estimate
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for message array
 */
export function estimateHistoryTokens(messages: TranscriptMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    // Role overhead + content
    total += 4 + estimateTokens(msg.content);
  }
  return total;
}

/**
 * Build enhanced system prompt with scope and context
 */
function buildEnhancedSystemPrompt(
  agent: AgentDefinition,
  memoryContext: string,
  currentDate: Date = new Date()
): string {
  const parts: string[] = [];

  // Base system prompt from agent definition
  const basePrompt = buildSystemPrompt(agent);
  parts.push(basePrompt);

  // Add scope constraints
  if (agent.frontmatter.scope) {
    parts.push('## Scope');
    parts.push(`You are scoped to: ${agent.frontmatter.scope}`);
    parts.push('Do not access or modify files outside this scope.');
    parts.push('');
  }

  // Add current date/time
  parts.push('## Current Context');
  parts.push(`Current date: ${currentDate.toISOString().split('T')[0]}`);
  parts.push(`Current time: ${currentDate.toTimeString().split(' ')[0]}`);
  parts.push('');

  // Add memory context if available
  if (memoryContext) {
    parts.push('## Working Memory');
    parts.push('The following is your persistent working memory from previous sessions:');
    parts.push('');
    parts.push(memoryContext);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Get available tools for agent
 * Currently returns empty array - tools will be added in later tasks
 */
function getAgentTools(_agent: AgentDefinition): ToolDef[] {
  // TODO: Parse tools from agent definition or registry
  return [];
}

/**
 * Tool result pruning options
 */
export interface PruneOptions {
  /** Number of recent tool results to keep with full content */
  keepRecentResults: number;
  /** Whether to keep tool call messages (always recommended) */
  keepToolCalls: boolean;
  /** Replacement text for pruned results */
  prunedPlaceholder: string;
}

const DEFAULT_PRUNE_OPTIONS: PruneOptions = {
  keepRecentResults: 5,
  keepToolCalls: true,
  prunedPlaceholder: '[Tool result pruned for context efficiency]',
};

/**
 * Check if a message is a tool result
 */
export function isToolResultMessage(msg: TranscriptMessage): boolean {
  return !!(msg.metadata?.toolResult || msg.metadata?.type === 'tool_result');
}

/**
 * Check if a message is a tool call
 */
export function isToolCallMessage(msg: TranscriptMessage): boolean {
  return !!(msg.metadata?.toolCalls && Array.isArray(msg.metadata.toolCalls));
}

/**
 * Prune old tool results from history
 * 
 * Keeps tool calls intact for context, but replaces old tool result
 * content with a placeholder to save tokens. Recent results are kept
 * in full for immediate context.
 * 
 * Note: This modifies the in-memory representation only.
 * The original transcript on disk is never modified.
 * 
 * @param messages - Conversation history
 * @param options - Pruning options
 * @returns Pruned messages (new array, original unchanged)
 */
export function pruneToolResults(
  messages: TranscriptMessage[],
  options: Partial<PruneOptions> = {}
): TranscriptMessage[] {
  const opts = { ...DEFAULT_PRUNE_OPTIONS, ...options };
  
  if (opts.keepRecentResults < 0) {
    return messages;
  }
  
  // Find all tool result message indices
  const toolResultIndices: number[] = [];
  
  for (let i = 0; i < messages.length; i++) {
    if (isToolResultMessage(messages[i])) {
      toolResultIndices.push(i);
    }
  }
  
  // If we have fewer results than the keep limit, return unchanged
  if (toolResultIndices.length <= opts.keepRecentResults) {
    return messages;
  }

  // Determine which indices to prune (all except the most recent N)
  const toPrune = new Set(
    toolResultIndices.slice(0, toolResultIndices.length - opts.keepRecentResults)
  );

  // Create new array with pruned content
  return messages.map((msg, i) => {
    if (toPrune.has(i)) {
      // Replace content but preserve metadata for context
      return {
        ...msg,
        content: opts.prunedPlaceholder,
        metadata: {
          ...msg.metadata,
          pruned: true,
          originalLength: msg.content.length,
        },
      };
    }
    return msg;
  });
}

/**
 * Get statistics about tool results in history
 */
export function getToolResultStats(messages: TranscriptMessage[]): {
  totalResults: number;
  totalCalls: number;
  prunedResults: number;
  estimatedSavedTokens: number;
} {
  let totalResults = 0;
  let totalCalls = 0;
  let prunedResults = 0;
  let estimatedSavedTokens = 0;
  
  for (const msg of messages) {
    if (isToolResultMessage(msg)) {
      totalResults++;
      if (msg.metadata?.pruned) {
        prunedResults++;
        const originalLength = (msg.metadata?.originalLength as number) || 0;
        estimatedSavedTokens += Math.ceil(originalLength / 4);
      }
    }
    if (isToolCallMessage(msg)) {
      totalCalls++;
    }
  }
  
  return {
    totalResults,
    totalCalls,
    prunedResults,
    estimatedSavedTokens,
  };
}

/**
 * Execute CONTEXT stage
 * 
 * Loads memory, builds system prompt, estimates tokens.
 * 
 * @param input - Stage input
 * @param config - Optional configuration overrides
 * @returns Stage output with prompt, history, tools, and token estimate
 */
export async function context(
  input: ContextInput,
  config: Partial<ContextConfig> = {}
): Promise<ContextOutput> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { intake, message } = input;

  // Step 1: Load transcript (conversation history)
  let history: TranscriptMessage[] = [];
  try {
    history = await readTranscript(intake.agentPath, intake.sessionId);
    // Limit history size
    if (history.length > cfg.maxHistoryMessages) {
      history = history.slice(-cfg.maxHistoryMessages);
    }
  } catch {
    // Transcript not found or corrupted, start fresh
    history = [];
  }

  // Step 2: Load memory
  let memory: AgentMemory | null = null;
  let memoryContext = '';
  try {
    memory = await loadMemory(intake.agentPath);
    if (memory) {
      memoryContext = memory.raw;
    }
  } catch {
    // Memory not available, continue without
  }

  // Step 3: Build system prompt
  const systemPrompt = buildEnhancedSystemPrompt(
    intake.agentDef,
    memoryContext
  );

  // Step 4: Get available tools
  const tools = getAgentTools(intake.agentDef);

  // Step 5: Prune old tool results (in-memory only, transcript unchanged)
  const prunedHistory = pruneToolResults(history, {
    keepRecentResults: cfg.keepRecentToolResults,
  });

  // Step 6: Estimate tokens
  const systemTokens = estimateTokens(systemPrompt);
  const historyTokens = estimateHistoryTokens(prunedHistory);
  const messageTokens = estimateTokens(message);
  const toolsTokens = estimateTokens(JSON.stringify(tools));
  
  const tokenEstimate = systemTokens + historyTokens + messageTokens + toolsTokens;

  // Step 7: Check thresholds
  const usableWindow = cfg.contextWindow - cfg.reserveTokens;
  const usageRatio = tokenEstimate / usableWindow;

  const needsFlush = usageRatio >= cfg.flushThreshold;
  const needsCompaction = usageRatio >= cfg.compactionThreshold;

  return {
    systemPrompt,
    history: prunedHistory,
    tools,
    tokenEstimate,
    memoryContext,
    memory,
    needsCompaction,
    needsFlush,
  };
}

/**
 * Check if context output requires intervention
 */
export function contextRequiresAction(output: ContextOutput): {
  action: 'none' | 'flush' | 'compact';
  reason?: string;
} {
  if (output.needsCompaction) {
    return {
      action: 'compact',
      reason: 'Token estimate exceeds compaction threshold',
    };
  }
  if (output.needsFlush) {
    return {
      action: 'flush',
      reason: 'Token estimate exceeds flush threshold',
    };
  }
  return { action: 'none' };
}
