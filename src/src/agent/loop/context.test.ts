/**
 * Tests for CONTEXT stage
 */

import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateHistoryTokens,
  contextRequiresAction,
  pruneToolResults,
  isToolResultMessage,
  isToolCallMessage,
  getToolResultStats,
  type ContextOutput,
} from './context.js';
import type { TranscriptMessage } from '../session.js';

describe('CONTEXT Stage', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens for short text', () => {
      const text = 'Hello world';
      const estimate = estimateTokens(text);
      // ~4 chars per token, so 11 chars = ~3 tokens
      expect(estimate).toBeGreaterThanOrEqual(2);
      expect(estimate).toBeLessThanOrEqual(4);
    });

    it('should estimate tokens for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should estimate tokens for long text', () => {
      const text = 'a'.repeat(1000);
      const estimate = estimateTokens(text);
      // 1000 chars / 4 = 250 tokens
      expect(estimate).toBe(250);
    });
  });

  describe('estimateHistoryTokens', () => {
    it('should estimate tokens for message array', () => {
      const messages: TranscriptMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
        },
        {
          id: '2',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: new Date().toISOString(),
        },
      ];

      const estimate = estimateHistoryTokens(messages);
      // Each message has role overhead (4) + content tokens
      expect(estimate).toBeGreaterThan(0);
    });

    it('should return 0 for empty array', () => {
      expect(estimateHistoryTokens([])).toBe(0);
    });
  });

  describe('contextRequiresAction', () => {
    it('should return none when no thresholds exceeded', () => {
      const output: ContextOutput = {
        systemPrompt: 'test',
        history: [],
        tools: [],
        tokenEstimate: 1000,
        memoryContext: '',
        memory: null,
        needsCompaction: false,
        needsFlush: false,
      };

      const result = contextRequiresAction(output);
      expect(result.action).toBe('none');
    });

    it('should return flush when flush threshold exceeded', () => {
      const output: ContextOutput = {
        systemPrompt: 'test',
        history: [],
        tools: [],
        tokenEstimate: 70000,
        memoryContext: '',
        memory: null,
        needsCompaction: false,
        needsFlush: true,
      };

      const result = contextRequiresAction(output);
      expect(result.action).toBe('flush');
      expect(result.reason).toContain('flush');
    });

    it('should return compact when compaction threshold exceeded', () => {
      const output: ContextOutput = {
        systemPrompt: 'test',
        history: [],
        tools: [],
        tokenEstimate: 90000,
        memoryContext: '',
        memory: null,
        needsCompaction: true,
        needsFlush: true,
      };

      const result = contextRequiresAction(output);
      // Compaction takes priority over flush
      expect(result.action).toBe('compact');
      expect(result.reason).toContain('compaction');
    });
  });

  describe('isToolResultMessage', () => {
    it('should return true for tool result messages', () => {
      const msg: TranscriptMessage = {
        id: '1',
        role: 'system',
        content: 'result',
        timestamp: '',
        metadata: { toolResult: true },
      };
      expect(isToolResultMessage(msg)).toBe(true);
    });

    it('should return true for type: tool_result', () => {
      const msg: TranscriptMessage = {
        id: '1',
        role: 'system',
        content: 'result',
        timestamp: '',
        metadata: { type: 'tool_result' },
      };
      expect(isToolResultMessage(msg)).toBe(true);
    });

    it('should return false for regular messages', () => {
      const msg: TranscriptMessage = {
        id: '1',
        role: 'user',
        content: 'hello',
        timestamp: '',
      };
      expect(isToolResultMessage(msg)).toBe(false);
    });
  });

  describe('isToolCallMessage', () => {
    it('should return true for messages with toolCalls', () => {
      const msg: TranscriptMessage = {
        id: '1',
        role: 'assistant',
        content: '',
        timestamp: '',
        metadata: { toolCalls: [{ id: 'tc1', name: 'test', arguments: {} }] },
      };
      expect(isToolCallMessage(msg)).toBe(true);
    });

    it('should return false for regular messages', () => {
      const msg: TranscriptMessage = {
        id: '1',
        role: 'assistant',
        content: 'hello',
        timestamp: '',
      };
      expect(isToolCallMessage(msg)).toBe(false);
    });
  });

  describe('pruneToolResults', () => {
    const createToolResult = (id: string, content: string): TranscriptMessage => ({
      id,
      role: 'system',
      content,
      timestamp: '',
      metadata: { toolResult: true },
    });

    const createToolCall = (id: string): TranscriptMessage => ({
      id,
      role: 'assistant',
      content: '',
      timestamp: '',
      metadata: { toolCalls: [{ id: `tc-${id}`, name: 'test', arguments: {} }] },
    });

    const createUserMessage = (id: string, content: string): TranscriptMessage => ({
      id,
      role: 'user',
      content,
      timestamp: '',
    });

    it('should keep all results when under limit', () => {
      const messages = [
        createUserMessage('1', 'hello'),
        createToolResult('2', 'result 1'),
        createToolResult('3', 'result 2'),
      ];

      const result = pruneToolResults(messages, { keepRecentResults: 5 });
      
      expect(result[1].content).toBe('result 1');
      expect(result[2].content).toBe('result 2');
    });

    it('should prune old tool results when over limit', () => {
      const messages = [
        createToolResult('1', 'old result 1'),
        createToolResult('2', 'old result 2'),
        createToolResult('3', 'recent result 1'),
        createToolResult('4', 'recent result 2'),
      ];

      const result = pruneToolResults(messages, { keepRecentResults: 2 });
      
      // First two should be pruned
      expect(result[0].content).toContain('pruned');
      expect(result[1].content).toContain('pruned');
      // Last two should be kept
      expect(result[2].content).toBe('recent result 1');
      expect(result[3].content).toBe('recent result 2');
    });

    it('should preserve tool call messages', () => {
      const messages = [
        createToolCall('1'),
        createToolResult('2', 'result'),
        createToolCall('3'),
        createToolResult('4', 'result 2'),
      ];

      const result = pruneToolResults(messages, { keepRecentResults: 1 });
      
      // Tool calls should be unchanged
      expect(result[0].metadata?.toolCalls).toBeDefined();
      expect(result[2].metadata?.toolCalls).toBeDefined();
    });

    it('should not modify original array', () => {
      const messages = [
        createToolResult('1', 'original content'),
        createToolResult('2', 'recent'),
      ];

      pruneToolResults(messages, { keepRecentResults: 1 });
      
      expect(messages[0].content).toBe('original content');
    });

    it('should mark pruned messages with metadata', () => {
      const messages = [
        createToolResult('1', 'some long content here'),
        createToolResult('2', 'recent'),
      ];

      const result = pruneToolResults(messages, { keepRecentResults: 1 });
      
      expect(result[0].metadata?.pruned).toBe(true);
      expect(result[0].metadata?.originalLength).toBe(22);
    });

    it('should use custom placeholder text', () => {
      const messages = [
        createToolResult('1', 'old'),
        createToolResult('2', 'recent'),
      ];

      const result = pruneToolResults(messages, {
        keepRecentResults: 1,
        prunedPlaceholder: '[REMOVED]',
      });
      
      expect(result[0].content).toBe('[REMOVED]');
    });
  });

  describe('getToolResultStats', () => {
    it('should count tool results and calls', () => {
      const messages: TranscriptMessage[] = [
        { id: '1', role: 'assistant', content: '', timestamp: '', metadata: { toolCalls: [] } },
        { id: '2', role: 'system', content: 'r1', timestamp: '', metadata: { toolResult: true } },
        { id: '3', role: 'assistant', content: '', timestamp: '', metadata: { toolCalls: [] } },
        { id: '4', role: 'system', content: 'r2', timestamp: '', metadata: { toolResult: true } },
      ];

      const stats = getToolResultStats(messages);
      
      expect(stats.totalResults).toBe(2);
      expect(stats.totalCalls).toBe(2);
      expect(stats.prunedResults).toBe(0);
    });

    it('should count pruned results', () => {
      const messages: TranscriptMessage[] = [
        { id: '1', role: 'system', content: '[pruned]', timestamp: '', metadata: { toolResult: true, pruned: true, originalLength: 100 } },
        { id: '2', role: 'system', content: 'kept', timestamp: '', metadata: { toolResult: true } },
      ];

      const stats = getToolResultStats(messages);
      
      expect(stats.prunedResults).toBe(1);
      expect(stats.estimatedSavedTokens).toBe(25); // 100 / 4
    });
  });
});
