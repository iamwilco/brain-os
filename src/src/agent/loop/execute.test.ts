/**
 * Tests for EXECUTE stage
 */

import { describe, it, expect, vi } from 'vitest';
import {
  execute,
  isResponseComplete,
  placeholderLLMHandler,
  placeholderToolExecutor,
  type ExecuteInput,
  type LLMHandler,
  type ToolExecutor,
  type ToolCall,
  type ContextOutput,
} from './execute.js';

// Mock context output
function createMockContext(overrides: Partial<ContextOutput> = {}): ContextOutput {
  return {
    systemPrompt: 'You are a helpful assistant.',
    history: [],
    tools: [],
    tokenEstimate: 100,
    memoryContext: '',
    memory: null,
    needsCompaction: false,
    needsFlush: false,
    ...overrides,
  };
}

// Mock LLM handler that returns a simple response
function createMockLLMHandler(response: string, toolCalls?: ToolCall[]): LLMHandler {
  return {
    async chat() {
      return {
        content: response,
        toolCalls,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      };
    },
  };
}

describe('EXECUTE Stage', () => {
  describe('execute', () => {
    it('should return response from LLM', async () => {
      const input: ExecuteInput = {
        context: createMockContext(),
        message: 'Hello',
      };

      const mockHandler = createMockLLMHandler('Hello! How can I help you?');
      const result = await execute(input, mockHandler);

      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.aborted).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should track token usage', async () => {
      const input: ExecuteInput = {
        context: createMockContext(),
        message: 'Hello',
      };

      const mockHandler = createMockLLMHandler('Hi!');
      const result = await execute(input, mockHandler);

      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
    });

    it('should handle tool calls', async () => {
      const toolCalls: ToolCall[] = [
        { id: 'call_1', name: 'read_file', arguments: { path: '/test.txt' } },
      ];

      let callCount = 0;
      const mockHandler: LLMHandler = {
        async chat() {
          callCount++;
          if (callCount === 1) {
            return {
              content: '',
              toolCalls,
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
            };
          }
          return {
            content: 'File contents: test',
            usage: { inputTokens: 15, outputTokens: 10, totalTokens: 25 },
          };
        },
      };

      const mockExecutor: ToolExecutor = {
        async execute(toolCall) {
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: 'test content',
            duration: 10,
          };
        },
        hasTools: () => true,
      };

      const input: ExecuteInput = {
        context: createMockContext({ tools: [{ name: 'read_file', description: 'Read a file' }] }),
        message: 'Read test.txt',
      };

      const result = await execute(input, mockHandler, mockExecutor);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('read_file');
      expect(result.toolResults).toHaveLength(1);
      expect(result.response).toBe('File contents: test');
    });

    it('should enforce max tool iterations', async () => {
      const toolCalls: ToolCall[] = [
        { id: 'call_1', name: 'loop_tool', arguments: {} },
      ];

      // Handler always returns tool calls (infinite loop)
      const mockHandler: LLMHandler = {
        async chat() {
          return {
            content: '',
            toolCalls,
            usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
          };
        },
      };

      const mockExecutor: ToolExecutor = {
        async execute(toolCall) {
          return {
            toolCallId: toolCall.id,
            name: toolCall.name,
            result: 'ok',
            duration: 1,
          };
        },
        hasTools: () => true,
      };

      const input: ExecuteInput = {
        context: createMockContext({ tools: [{ name: 'loop_tool', description: 'Loop' }] }),
        message: 'Loop forever',
      };

      const result = await execute(input, mockHandler, mockExecutor, { maxToolIterations: 3 });

      expect(result.toolCalls.length).toBe(3);
      expect(result.response).toBe('[Max tool iterations reached]');
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      
      const mockHandler: LLMHandler = {
        async chat({ }, ) {
          // Check abort before doing work
          if (controller.signal.aborted) {
            throw new Error('Aborted');
          }
          // Simulate slow response that checks abort
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 100);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Aborted'));
            });
          });
          return { content: 'Done', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
        },
      };

      const input: ExecuteInput = {
        context: createMockContext(),
        message: 'Hello',
        abortSignal: controller.signal,
      };

      // Abort immediately
      controller.abort();

      const result = await execute(input, mockHandler);

      expect(result.aborted).toBe(true);
    });

    it('should handle LLM errors with retry', async () => {
      let attempts = 0;
      const mockHandler: LLMHandler = {
        async chat() {
          attempts++;
          if (attempts < 3) {
            throw new Error('API Error');
          }
          return { content: 'Success', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
        },
      };

      const input: ExecuteInput = {
        context: createMockContext(),
        message: 'Hello',
      };

      const result = await execute(input, mockHandler, placeholderToolExecutor, {
        maxRetries: 3,
        retryBaseDelay: 10,
      });

      expect(result.response).toBe('Success');
      expect(attempts).toBe(3);
    });

    it('should return error after max retries', async () => {
      const mockHandler: LLMHandler = {
        async chat() {
          throw new Error('Persistent API Error');
        },
      };

      const input: ExecuteInput = {
        context: createMockContext(),
        message: 'Hello',
      };

      const result = await execute(input, mockHandler, placeholderToolExecutor, {
        maxRetries: 2,
        retryBaseDelay: 10,
      });

      expect(result.error).toBe('Persistent API Error');
    });
  });

  describe('placeholderLLMHandler', () => {
    it('should return placeholder response', async () => {
      const result = await placeholderLLMHandler.chat({
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'Hello world' }],
      });

      expect(result.content).toContain('LLM Integration Pending');
      expect(result.content).toContain('Hello world');
    });
  });

  describe('placeholderToolExecutor', () => {
    it('should return error for any tool', async () => {
      const result = await placeholderToolExecutor.execute({
        id: 'test',
        name: 'unknown_tool',
        arguments: {},
      });

      expect(result.error).toContain('not implemented');
    });

    it('should report no tools available', () => {
      expect(placeholderToolExecutor.hasTools('any')).toBe(false);
    });
  });

  describe('isResponseComplete', () => {
    it('should return true for successful response', () => {
      expect(isResponseComplete({
        response: 'Hello!',
        toolCalls: [],
        toolResults: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        aborted: false,
      })).toBe(true);
    });

    it('should return false for aborted response', () => {
      expect(isResponseComplete({
        response: 'Partial',
        toolCalls: [],
        toolResults: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        aborted: true,
      })).toBe(false);
    });

    it('should return false for error response', () => {
      expect(isResponseComplete({
        response: '',
        toolCalls: [],
        toolResults: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        aborted: false,
        error: 'Something went wrong',
      })).toBe(false);
    });

    it('should return false for empty response', () => {
      expect(isResponseComplete({
        response: '',
        toolCalls: [],
        toolResults: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        aborted: false,
      })).toBe(false);
    });
  });
});
