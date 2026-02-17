/**
 * Claude Provider tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeProvider, createClaudeProvider } from './claude.js';
import { ProviderError } from './provider.js';

describe('ClaudeProvider', () => {
  describe('constructor', () => {
    it('should create provider with valid config', () => {
      const provider = new ClaudeProvider({ apiKey: 'sk-ant-valid-key-here' });
      
      expect(provider.name).toBe('claude');
    });

    it('should throw for invalid API key', () => {
      expect(() => new ClaudeProvider({ apiKey: '' })).toThrow();
    });

    it('should use custom base URL', () => {
      const provider = new ClaudeProvider({
        apiKey: 'sk-ant-valid-key-here',
        baseUrl: 'https://custom.api.com',
      });
      
      expect(provider.name).toBe('claude');
    });
  });

  describe('listModels', () => {
    it('should return list of known models', async () => {
      const provider = new ClaudeProvider({ apiKey: 'sk-ant-valid-key-here' });
      const models = await provider.listModels();
      
      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('claude-sonnet-4-20250514');
    });
  });
});

describe('createClaudeProvider', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalEnv) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('should create provider with provided API key', () => {
    const provider = createClaudeProvider('sk-ant-provided-key');
    expect(provider.name).toBe('claude');
  });

  it('should use environment variable when no key provided', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-key-value';
    const provider = createClaudeProvider();
    expect(provider.name).toBe('claude');
  });

  it('should throw when no API key available', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createClaudeProvider()).toThrow('ANTHROPIC_API_KEY');
  });
});

describe('ClaudeProvider API (mocked)', () => {
  let provider: ClaudeProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new ClaudeProvider({ apiKey: 'sk-ant-test-key-value' });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('complete', () => {
    it('should make API request and return result', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const result = await provider.complete('Hi there');

      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.inputTokens).toBe(10);
      expect(result.outputTokens).toBe(5);
      expect(result.stopReason).toBe('end_turn');
    });

    it('should handle API errors', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          type: 'error',
          error: { type: 'auth_error', message: 'Invalid API key' },
        }),
      });

      await expect(provider.complete('Hi')).rejects.toThrow(ProviderError);
    });

    it('should handle rate limits', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          type: 'error',
          error: { type: 'rate_limit', message: 'Rate limit exceeded' },
        }),
      });

      try {
        await provider.complete('Hi');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).type).toBe('rate_limit');
        expect((error as ProviderError).retryable).toBe(true);
      }
    });
  });

  describe('chat', () => {
    it('should send messages in correct format', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
      });

      const result = await provider.chat([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
      ]);

      expect(result.content).toBe('Response');
      
      // Verify request format
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.messages).toHaveLength(3);
    });

    it('should extract system prompt from messages', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
      });

      await provider.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ]);

      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.system).toBe('You are helpful');
      expect(requestBody.messages).toHaveLength(1);
    });
  });

  describe('isAvailable', () => {
    it('should return true when API responds', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('should return true for auth error (API is up)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });
});
