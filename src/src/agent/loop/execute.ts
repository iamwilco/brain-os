/**
 * EXECUTE Stage - Agent Loop Stage 3
 * 
 * Sends context to LLM, executes tools, streams response.
 * 
 * Required Outputs:
 * - response: string - Final assistant response
 * - toolCalls: ToolCall[] - Tools invoked
 * - toolResults: ToolResult[] - Tool outputs
 * - usage: TokenUsage - Input/output tokens
 */

import type { TranscriptMessage } from '../session.js';
import type { ToolDef, ContextOutput } from './context.js';

/**
 * Tool call from LLM
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
  duration: number;
}

/**
 * Token usage from LLM
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * EXECUTE stage input
 */
export interface ExecuteInput {
  /** Output from CONTEXT stage */
  context: ContextOutput;
  /** User message */
  message: string;
  /** Agent scope for tool validation */
  scope?: string;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * EXECUTE stage output
 */
export interface ExecuteOutput {
  /** Final assistant response */
  response: string;
  /** Tool calls made */
  toolCalls: ToolCall[];
  /** Tool results */
  toolResults: ToolResult[];
  /** Token usage */
  usage: TokenUsage;
  /** Whether execution was aborted */
  aborted: boolean;
  /** Error if execution failed */
  error?: string;
}

/**
 * EXECUTE stage configuration
 */
export interface ExecuteConfig {
  /** Maximum tool iterations */
  maxToolIterations: number;
  /** Execution timeout in ms */
  executionTimeout: number;
  /** Tool execution timeout in ms */
  toolTimeout: number;
  /** LLM API retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  retryBaseDelay: number;
}

const DEFAULT_CONFIG: ExecuteConfig = {
  maxToolIterations: 10,
  executionTimeout: 600_000,  // 10 minutes
  toolTimeout: 30_000,        // 30 seconds per tool
  maxRetries: 3,
  retryBaseDelay: 1000,
};

/**
 * Message handler interface for LLM calls
 * This allows different LLM backends to be plugged in
 */
export interface LLMHandler {
  /**
   * Send messages to LLM and get response
   */
  chat(params: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
    tools?: ToolDef[];
  }): Promise<{
    content: string;
    toolCalls?: ToolCall[];
    usage?: TokenUsage;
  }>;
}

/**
 * Tool executor interface
 */
export interface ToolExecutor {
  /**
   * Execute a tool call
   */
  execute(
    toolCall: ToolCall,
    scope?: string,
    timeout?: number
  ): Promise<ToolResult>;
  
  /**
   * Check if tool exists
   */
  hasTools(name: string): boolean;
}

/**
 * Default placeholder LLM handler
 * Returns a placeholder response when no real LLM is configured
 */
export const placeholderLLMHandler: LLMHandler = {
  async chat({ messages }) {
    const lastMessage = messages[messages.length - 1];
    return {
      content: `[LLM Integration Pending] Received: "${lastMessage?.content?.slice(0, 50)}..."`,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  },
};

/**
 * Default placeholder tool executor
 * Returns error for any tool call when no tools are registered
 */
export const placeholderToolExecutor: ToolExecutor = {
  async execute(toolCall) {
    return {
      toolCallId: toolCall.id,
      name: toolCall.name,
      result: null,
      error: `Tool "${toolCall.name}" not implemented`,
      duration: 0,
    };
  },
  hasTools() {
    return false;
  },
};

/**
 * Convert transcript messages to LLM format
 */
function toMessages(
  history: TranscriptMessage[],
  userMessage: string
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  
  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }
  
  messages.push({
    role: 'user',
    content: userMessage,
  });
  
  return messages;
}

/**
 * Sleep for specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute with retry and exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelay: number,
  abortSignal?: AbortSignal
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (abortSignal?.aborted) {
      throw new Error('Aborted');
    }
    
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on abort
      if (abortSignal?.aborted) {
        throw error;
      }
      
      // Exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Execute EXECUTE stage
 * 
 * Sends to LLM, handles tool calls, returns final response.
 * 
 * @param input - Stage input
 * @param llmHandler - LLM handler implementation
 * @param toolExecutor - Tool executor implementation
 * @param config - Optional configuration overrides
 * @returns Stage output with response, tool calls, and usage
 */
export async function execute(
  input: ExecuteInput,
  llmHandler: LLMHandler = placeholderLLMHandler,
  toolExecutor: ToolExecutor = placeholderToolExecutor,
  config: Partial<ExecuteConfig> = {}
): Promise<ExecuteOutput> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { context, message, scope, abortSignal } = input;
  
  const allToolCalls: ToolCall[] = [];
  const allToolResults: ToolResult[] = [];
  const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  
  // Build initial messages
  const messages = toMessages(context.history, message);
  
  // Set execution timeout
  const executionStart = Date.now();
  const checkTimeout = () => {
    if (Date.now() - executionStart > cfg.executionTimeout) {
      throw new Error('Execution timeout exceeded');
    }
  };
  
  let iteration = 0;
  let finalResponse = '';
  
  try {
    while (iteration < cfg.maxToolIterations) {
      checkTimeout();
      
      if (abortSignal?.aborted) {
        return {
          response: finalResponse || '[Aborted]',
          toolCalls: allToolCalls,
          toolResults: allToolResults,
          usage: totalUsage,
          aborted: true,
        };
      }
      
      // Call LLM with retry
      const llmResponse = await withRetry(
        () => llmHandler.chat({
          systemPrompt: context.systemPrompt,
          messages,
          tools: context.tools.length > 0 ? context.tools : undefined,
        }),
        cfg.maxRetries,
        cfg.retryBaseDelay,
        abortSignal
      );
      
      // Update usage
      if (llmResponse.usage) {
        totalUsage.inputTokens += llmResponse.usage.inputTokens;
        totalUsage.outputTokens += llmResponse.usage.outputTokens;
        totalUsage.totalTokens += llmResponse.usage.totalTokens;
      }
      
      // Check for tool calls
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        allToolCalls.push(...llmResponse.toolCalls);
        
        // Execute each tool
        const results: ToolResult[] = [];
        for (const toolCall of llmResponse.toolCalls) {
          checkTimeout();
          
          if (abortSignal?.aborted) {
            break;
          }
          
          const result = await toolExecutor.execute(
            toolCall,
            scope,
            cfg.toolTimeout
          );
          results.push(result);
          allToolResults.push(result);
        }
        
        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: llmResponse.content || '',
        });
        
        // Add tool results as messages
        for (const result of results) {
          messages.push({
            role: 'tool',
            content: result.error 
              ? `Error: ${result.error}`
              : JSON.stringify(result.result),
          });
        }
        
        iteration++;
      } else {
        // No tool calls, we have final response
        finalResponse = llmResponse.content;
        break;
      }
    }
    
    // Check if we hit max iterations
    if (iteration >= cfg.maxToolIterations && !finalResponse) {
      finalResponse = '[Max tool iterations reached]';
    }
    
    return {
      response: finalResponse,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      usage: totalUsage,
      aborted: false,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return {
      response: finalResponse || `[Error: ${errorMessage}]`,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      usage: totalUsage,
      aborted: abortSignal?.aborted ?? false,
      error: errorMessage,
    };
  }
}

/**
 * Check if response indicates completion
 */
export function isResponseComplete(response: ExecuteOutput): boolean {
  return !response.aborted && !response.error && response.response.length > 0;
}
