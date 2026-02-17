/**
 * Default LLM handler wiring for agent loop
 */

import type { LLMHandler } from '../agent/loop/execute.js';
import { getConfig, hasProvider } from '../config/index.js';
import { createClaudeProvider } from './claude.js';
import type { CompletionOptions } from './provider.js';

interface ChatParams {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
}

function toChatMessages(params: ChatParams): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  if (params.systemPrompt) {
    messages.push({ role: 'system', content: params.systemPrompt });
  }

  for (const message of params.messages) {
    if (message.role === 'system') {
      messages.push({ role: 'system', content: message.content });
      continue;
    }
    if (message.role === 'assistant' || message.role === 'user') {
      messages.push({ role: message.role, content: message.content });
    }
  }

  return messages;
}

/**
 * Create an LLM handler using configured providers.
 */
export function createDefaultLLMHandler(): LLMHandler {
  if (!hasProvider('anthropic')) {
    return {
      async chat({ messages }) {
        const lastMessage = messages[messages.length - 1];
        return {
          content: `LLM not configured. Set ANTHROPIC_API_KEY to enable Claude. Received: "${lastMessage?.content?.slice(0, 120)}"`,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        };
      },
    };
  }

  const config = getConfig();
  const provider = createClaudeProvider(config.anthropicApiKey);

  return {
    async chat(params: ChatParams) {
      const options: CompletionOptions = {
        model: config.model,
        maxTokens: config.maxTokens,
        systemPrompt: params.systemPrompt,
      };

      const messages = toChatMessages(params);
      const result = await provider.chat(messages, options);

      return {
        content: result.content,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.inputTokens + result.outputTokens,
        },
      };
    },
  };
}
