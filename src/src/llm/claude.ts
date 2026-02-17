/**
 * Claude (Anthropic) LLM Provider
 * Implementation of LLMProvider for Claude models
 */

import type {
  LLMProvider,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ProviderConfig,
} from './provider.js';
import {
  ProviderError,
  validateConfig,
  mergeOptions,
} from './provider.js';

/**
 * Claude API message format
 */
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Claude API request
 */
interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  stop_sequences?: string[];
}

/**
 * Claude API response
 */
interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Claude API error response
 */
interface ClaudeErrorResponse {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

/**
 * Default Claude configuration
 */
const CLAUDE_DEFAULTS = {
  baseUrl: 'https://api.anthropic.com',
  defaultModel: 'claude-sonnet-4-20250514',
  defaultMaxTokens: 4096,
  timeout: 60000,
  apiVersion: '2023-06-01',
};

/**
 * Claude Provider implementation
 */
export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  private readonly config: Required<ProviderConfig>;

  constructor(config: ProviderConfig) {
    validateConfig(config);
    
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? CLAUDE_DEFAULTS.baseUrl,
      defaultModel: config.defaultModel ?? CLAUDE_DEFAULTS.defaultModel,
      defaultMaxTokens: config.defaultMaxTokens ?? CLAUDE_DEFAULTS.defaultMaxTokens,
      timeout: config.timeout ?? CLAUDE_DEFAULTS.timeout,
    };
  }

  /**
   * Complete a single prompt
   */
  async complete(prompt: string, options?: CompletionOptions): Promise<CompletionResult> {
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
    return this.chat(messages, options);
  }

  /**
   * Complete a chat conversation
   */
  async chat(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult> {
    const opts = mergeOptions(options, {
      model: this.config.defaultModel,
      maxTokens: this.config.defaultMaxTokens,
    });

    // Convert messages to Claude format
    const { claudeMessages, systemPrompt } = this.convertMessages(messages, opts.systemPrompt);

    const request: ClaudeRequest = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: claudeMessages,
      temperature: opts.temperature,
    };

    if (systemPrompt) {
      request.system = systemPrompt;
    }

    if (opts.stopSequences && opts.stopSequences.length > 0) {
      request.stop_sequences = opts.stopSequences;
    }

    const response = await this.makeRequest<ClaudeResponse>('/v1/messages', request);

    // Extract text content
    const content = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      content,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
    };
  }

  /**
   * Stream a completion (async generator)
   */
  async *stream(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncIterable<StreamChunk> {
    const opts = mergeOptions(options, {
      model: this.config.defaultModel,
      maxTokens: this.config.defaultMaxTokens,
    });

    const { claudeMessages, systemPrompt } = this.convertMessages(messages, opts.systemPrompt);

    const request: ClaudeRequest & { stream: boolean } = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: claudeMessages,
      temperature: opts.temperature,
      stream: true,
    };

    if (systemPrompt) {
      request.system = systemPrompt;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        const error = await response.json() as ClaudeErrorResponse;
        throw this.handleApiError(error, response.status);
      }

      if (!response.body) {
        throw new ProviderError('No response body', 'network_error', this.name);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          yield { type: 'done' };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              yield { type: 'done' };
              return;
            }

            try {
              const event = JSON.parse(data);
              if (event.type === 'content_block_delta' && event.delta?.text) {
                yield { type: 'content', content: event.delta.text };
              }
            } catch {
              // Ignore parse errors for partial data
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof ProviderError) {
        yield { type: 'error', error: error.message };
      } else if (error instanceof Error) {
        yield { type: 'error', error: error.message };
      } else {
        yield { type: 'error', error: 'Unknown streaming error' };
      }
    }
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Make a minimal request to check availability
      const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.config.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        signal: AbortSignal.timeout(10000),
      });

      // 401 means auth failed but API is available
      // 200 means working
      // Other errors might mean unavailable
      return response.status === 200 || response.status === 401;
    } catch {
      return false;
    }
  }

  /**
   * Get available models
   */
  async listModels(): Promise<string[]> {
    // Anthropic doesn't have a models endpoint, return known models
    return [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  /**
   * Convert ChatMessage[] to Claude format
   */
  private convertMessages(
    messages: ChatMessage[],
    systemPrompt?: string
  ): { claudeMessages: ClaudeMessage[]; systemPrompt?: string } {
    const claudeMessages: ClaudeMessage[] = [];
    let finalSystemPrompt = systemPrompt;

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Combine system messages
        finalSystemPrompt = finalSystemPrompt
          ? `${finalSystemPrompt}\n\n${msg.content}`
          : msg.content;
      } else {
        claudeMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    return { claudeMessages, systemPrompt: finalSystemPrompt };
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': CLAUDE_DEFAULTS.apiVersion,
    };
  }

  /**
   * Make API request
   */
  private async makeRequest<T>(endpoint: string, body: unknown): Promise<T> {
    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      const data = await response.json();

      if (!response.ok) {
        throw this.handleApiError(data as ClaudeErrorResponse, response.status);
      }

      return data as T;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          throw new ProviderError(
            'Request timed out',
            'timeout',
            this.name,
            undefined,
            true
          );
        }

        throw new ProviderError(
          error.message,
          'network_error',
          this.name,
          undefined,
          true
        );
      }

      throw new ProviderError(
        'Unknown error',
        'unknown',
        this.name
      );
    }
  }

  /**
   * Handle API error response
   */
  private handleApiError(error: ClaudeErrorResponse, statusCode: number): ProviderError {
    const message = error.error?.message || 'Unknown API error';
    const errorType = error.error?.type || 'unknown';

    switch (statusCode) {
      case 401:
        return new ProviderError(message, 'auth_error', this.name, statusCode);
      case 429:
        return new ProviderError(message, 'rate_limit', this.name, statusCode, true);
      case 400:
        if (errorType.includes('context_length')) {
          return new ProviderError(message, 'context_length', this.name, statusCode);
        }
        return new ProviderError(message, 'invalid_request', this.name, statusCode);
      case 404:
        return new ProviderError(message, 'model_not_found', this.name, statusCode);
      default:
        return new ProviderError(message, 'unknown', this.name, statusCode, statusCode >= 500);
    }
  }
}

/**
 * Create Claude provider from environment
 */
export function createClaudeProvider(apiKey?: string): ClaudeProvider {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }
  
  return new ClaudeProvider({ apiKey: key });
}
