/**
 * LLM Provider tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  mergeOptions,
  estimateTokens,
  buildMessages,
  ProviderError,
  DEFAULT_OPTIONS,
} from './provider.js';

describe('validateConfig', () => {
  it('should pass for valid config', () => {
    expect(() => validateConfig({ apiKey: 'sk-ant-api03-valid-key' })).not.toThrow();
  });

  it('should throw for missing API key', () => {
    expect(() => validateConfig({ apiKey: '' })).toThrow('API key is required');
  });

  it('should throw for short API key', () => {
    expect(() => validateConfig({ apiKey: 'short' })).toThrow('Invalid API key format');
  });
});

describe('mergeOptions', () => {
  it('should use defaults when no options provided', () => {
    const result = mergeOptions();
    
    expect(result.model).toBe(DEFAULT_OPTIONS.model);
    expect(result.maxTokens).toBe(DEFAULT_OPTIONS.maxTokens);
    expect(result.temperature).toBe(DEFAULT_OPTIONS.temperature);
  });

  it('should override defaults with provided options', () => {
    const result = mergeOptions({
      model: 'custom-model',
      maxTokens: 1000,
    });
    
    expect(result.model).toBe('custom-model');
    expect(result.maxTokens).toBe(1000);
    expect(result.temperature).toBe(DEFAULT_OPTIONS.temperature);
  });

  it('should include optional fields when provided', () => {
    const result = mergeOptions({
      systemPrompt: 'You are a helpful assistant',
      stopSequences: ['STOP'],
    });
    
    expect(result.systemPrompt).toBe('You are a helpful assistant');
    expect(result.stopSequences).toEqual(['STOP']);
  });

  it('should use custom defaults', () => {
    const result = mergeOptions(undefined, {
      model: 'default-model',
      maxTokens: 2000,
    });
    
    expect(result.model).toBe('default-model');
    expect(result.maxTokens).toBe(2000);
  });
});

describe('estimateTokens', () => {
  it('should estimate tokens from text', () => {
    const text = 'Hello, world!';
    const tokens = estimateTokens(text);
    
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(text.length);
  });

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should return reasonable estimate for longer text', () => {
    const text = 'This is a longer piece of text that contains multiple words and sentences.';
    const tokens = estimateTokens(text);
    
    // Roughly 4 chars per token
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(30);
  });
});

describe('buildMessages', () => {
  it('should build messages with user prompt only', () => {
    const messages = buildMessages('Hello');
    
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should include system prompt when provided', () => {
    const messages = buildMessages('Hello', 'You are a helpful assistant');
    
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ 
      role: 'system', 
      content: 'You are a helpful assistant' 
    });
    expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
  });
});

describe('ProviderError', () => {
  it('should create error with all properties', () => {
    const error = new ProviderError(
      'Rate limit exceeded',
      'rate_limit',
      'claude',
      429,
      true
    );
    
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.type).toBe('rate_limit');
    expect(error.provider).toBe('claude');
    expect(error.statusCode).toBe(429);
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('ProviderError');
  });

  it('should default retryable to false', () => {
    const error = new ProviderError('Auth failed', 'auth_error', 'claude', 401);
    
    expect(error.retryable).toBe(false);
  });

  it('should be instanceof Error', () => {
    const error = new ProviderError('Test', 'unknown', 'test');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ProviderError);
  });
});
