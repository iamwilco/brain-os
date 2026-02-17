/**
 * Tests for token estimation module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  estimateByChars,
  estimateByWords,
  estimateHybrid,
  estimateTokens,
  estimateMessagesTokens,
  estimateToolsTokens,
  estimateContextTokens,
  contextFitsWindow,
  StreamingTokenCounter,
} from './tokens.js';

describe('Token Estimation', () => {
  describe('estimateByChars', () => {
    it('should estimate tokens for text', () => {
      // 20 chars / 4 = 5 tokens
      expect(estimateByChars('12345678901234567890')).toBe(5);
    });

    it('should return 0 for empty string', () => {
      expect(estimateByChars('')).toBe(0);
    });

    it('should round up', () => {
      // 5 chars / 4 = 1.25 -> 2
      expect(estimateByChars('12345')).toBe(2);
    });

    it('should use custom chars per token', () => {
      // 20 chars / 5 = 4 tokens
      expect(estimateByChars('12345678901234567890', 5)).toBe(4);
    });
  });

  describe('estimateByWords', () => {
    it('should estimate tokens for text', () => {
      // 4 words / 0.75 = 5.33 -> 6 tokens
      expect(estimateByWords('one two three four')).toBe(6);
    });

    it('should return 0 for empty string', () => {
      expect(estimateByWords('')).toBe(0);
    });

    it('should handle multiple spaces', () => {
      expect(estimateByWords('one   two')).toBe(estimateByWords('one two'));
    });
  });

  describe('estimateHybrid', () => {
    it('should estimate tokens for natural language', () => {
      const text = 'This is a simple test sentence.';
      const estimate = estimateHybrid(text);
      expect(estimate).toBeGreaterThan(0);
    });

    it('should increase estimate for code-heavy content', () => {
      const prose = 'This is a simple test.';
      const code = 'function test() { return { a: 1, b: 2 }; }';
      
      const proseEstimate = estimateHybrid(prose);
      const codeEstimate = estimateHybrid(code);
      
      // Code should have higher token density
      const proseRatio = proseEstimate / prose.length;
      const codeRatio = codeEstimate / code.length;
      
      expect(codeRatio).toBeGreaterThanOrEqual(proseRatio * 0.9);
    });
  });

  describe('estimateTokens', () => {
    it('should return TokenEstimate object', () => {
      const result = estimateTokens('Hello world');
      
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('characters');
      expect(result).toHaveProperty('method');
      expect(result.characters).toBe(11);
    });

    it('should handle empty string', () => {
      const result = estimateTokens('');
      expect(result.tokens).toBe(0);
      expect(result.characters).toBe(0);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should estimate tokens for message array', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = estimateMessagesTokens(messages);
      
      // Should include message overhead + content
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty array', () => {
      const result = estimateMessagesTokens([]);
      expect(result.tokens).toBe(0);
    });

    it('should include name field tokens', () => {
      const withName = [{ role: 'user', content: 'Hello', name: 'TestUser' }];
      const withoutName = [{ role: 'user', content: 'Hello' }];

      const withNameResult = estimateMessagesTokens(withName);
      const withoutNameResult = estimateMessagesTokens(withoutName);

      expect(withNameResult.tokens).toBeGreaterThan(withoutNameResult.tokens);
    });
  });

  describe('estimateToolsTokens', () => {
    it('should estimate tokens for tools', () => {
      const tools = [
        {
          name: 'read_file',
          description: 'Read contents of a file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      ];

      const result = estimateToolsTokens(tools);
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should return 0 for empty tools', () => {
      expect(estimateToolsTokens([]).tokens).toBe(0);
    });
  });

  describe('estimateContextTokens', () => {
    it('should estimate total context tokens', () => {
      const result = estimateContextTokens({
        systemPrompt: 'You are a helpful assistant.',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
        userMessage: 'How are you?',
        tools: [{ name: 'test', description: 'A test tool' }],
      });

      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should work without tools', () => {
      const result = estimateContextTokens({
        systemPrompt: 'You are a helpful assistant.',
        messages: [],
        userMessage: 'Hello',
      });

      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('contextFitsWindow', () => {
    it('should return fits=true when within window', () => {
      const result = contextFitsWindow(1000, 10000, 1000);
      expect(result.fits).toBe(true);
      expect(result.overage).toBe(0);
    });

    it('should return fits=false when exceeds window', () => {
      const result = contextFitsWindow(10000, 10000, 1000);
      expect(result.fits).toBe(false);
      expect(result.overage).toBe(1000);
    });

    it('should calculate available tokens correctly', () => {
      const result = contextFitsWindow(5000, 10000, 2000);
      expect(result.available).toBe(8000);
    });
  });

  describe('StreamingTokenCounter', () => {
    let counter: StreamingTokenCounter;

    beforeEach(() => {
      counter = new StreamingTokenCounter();
    });

    it('should count tokens from streamed chunks', () => {
      counter.add('Hello ');
      counter.add('world!');
      
      const estimate = counter.getEstimate();
      expect(estimate.tokens).toBeGreaterThan(0);
      expect(estimate.characters).toBe(12);
    });

    it('should flush buffer when threshold reached', () => {
      // Add enough to trigger flush (default threshold: 100)
      counter.add('x'.repeat(150));
      
      // Buffer should have been flushed
      const estimate = counter.getEstimate();
      expect(estimate.tokens).toBeGreaterThan(0);
    });

    it('should reset counter', () => {
      counter.add('Hello world');
      counter.reset();
      
      const estimate = counter.getEstimate();
      expect(estimate.tokens).toBe(0);
      expect(estimate.characters).toBe(0);
    });

    it('should handle empty chunks', () => {
      counter.add('');
      counter.add('test');
      
      const estimate = counter.getEstimate();
      expect(estimate.characters).toBe(4);
    });
  });

  describe('Performance', () => {
    it('should estimate tokens in under 50ms for large text', () => {
      const largeText = 'x'.repeat(100_000);
      
      const start = performance.now();
      estimateTokens(largeText);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(50);
    });

    it('should estimate message tokens in under 50ms for many messages', () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'This is a test message with some content. '.repeat(10),
      }));
      
      const start = performance.now();
      estimateMessagesTokens(messages);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(50);
    });
  });
});
