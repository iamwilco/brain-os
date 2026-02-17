/**
 * LLM Provider abstraction
 * Defines interface for language model providers
 */

/**
 * Message role in conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Chat message
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * Completion options
 */
export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  systemPrompt?: string;
}

/**
 * Completion result
 */
export interface CompletionResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'error';
  finishReason?: string;
}

/**
 * Streaming chunk
 */
export interface StreamChunk {
  type: 'content' | 'done' | 'error';
  content?: string;
  error?: string;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  defaultMaxTokens?: number;
  timeout?: number;
}

/**
 * LLM Provider interface
 */
export interface LLMProvider {
  name: string;
  
  /**
   * Complete a single prompt
   */
  complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult>;
  
  /**
   * Complete a chat conversation
   */
  chat(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  
  /**
   * Stream a completion
   */
  stream?(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk>;
  
  /**
   * Check if provider is available
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get available models
   */
  listModels?(): Promise<string[]>;
}

/**
 * Provider error types
 */
export type ProviderErrorType = 
  | 'auth_error'
  | 'rate_limit'
  | 'invalid_request'
  | 'model_not_found'
  | 'context_length'
  | 'network_error'
  | 'timeout'
  | 'unknown';

/**
 * Provider error
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly type: ProviderErrorType,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * Default completion options
 */
export const DEFAULT_OPTIONS: Required<Omit<CompletionOptions, 'systemPrompt' | 'stopSequences'>> = {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.7,
};

/**
 * Validate provider config
 */
export function validateConfig(config: ProviderConfig): void {
  if (!config.apiKey) {
    throw new Error('API key is required');
  }
  
  if (config.apiKey.length < 10) {
    throw new Error('Invalid API key format');
  }
}

/**
 * Merge options with defaults
 */
export function mergeOptions(
  options?: CompletionOptions,
  defaults: Partial<CompletionOptions> = {}
): Required<Omit<CompletionOptions, 'systemPrompt' | 'stopSequences'>> & 
   Pick<CompletionOptions, 'systemPrompt' | 'stopSequences'> {
  return {
    model: options?.model ?? defaults.model ?? DEFAULT_OPTIONS.model,
    maxTokens: options?.maxTokens ?? defaults.maxTokens ?? DEFAULT_OPTIONS.maxTokens,
    temperature: options?.temperature ?? defaults.temperature ?? DEFAULT_OPTIONS.temperature,
    systemPrompt: options?.systemPrompt ?? defaults.systemPrompt,
    stopSequences: options?.stopSequences ?? defaults.stopSequences,
  };
}

/**
 * Count approximate tokens (rough estimate)
 * For accurate counting, use a proper tokenizer
 */
export function estimateTokens(text: string): number {
  // Rough approximation: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Build messages array with optional system prompt
 */
export function buildMessages(
  prompt: string,
  systemPrompt?: string
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  
  messages.push({ role: 'user', content: prompt });
  
  return messages;
}
