/**
 * Tests for Agent Loop Events
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getEventEmitter,
  emitLoopStart,
  emitLoopContext,
  emitLoopExecute,
  emitLoopPersist,
  emitLoopEnd,
  emitLoopError,
  emitToolStart,
  emitToolEnd,
  emitMemoryRead,
  emitMemoryWrite,
  emitMemoryFlush,
  emitMemoryCompact,
  type LoopStartEvent,
  type LoopContextEvent,
  type LoopErrorEvent,
  type ToolStartEvent,
  type ToolEndEvent,
  type MemoryReadEvent,
  type MemoryWriteEvent,
  type MemoryFlushEvent,
  type MemoryCompactEvent,
} from './events.js';
import type { IntakeOutput } from './intake.js';
import type { ContextOutput } from './context.js';
import type { ExecuteOutput } from './execute.js';
import type { PersistOutput } from './persist.js';

// Mock intake output
const mockIntake: IntakeOutput = {
  runId: 'run-123',
  sessionId: 'session-456',
  session: {
    id: 'session-456',
    agentId: 'test-agent',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
  },
  agentDef: {
    frontmatter: {
      id: 'test-agent',
      name: 'Test Agent',
      type: 'admin',
      scope: '/test',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    },
    instructions: 'Test',
    sections: { other: {} },
    path: '/test/AGENT.md',
  },
  agentPath: '/test/agent',
  lock: {
    sessionId: 'session-456',
    runId: 'run-123',
    acquiredAt: new Date(),
    expiresAt: new Date(Date.now() + 900000),
  },
};

describe('Agent Loop Events', () => {
  beforeEach(() => {
    getEventEmitter().reset();
  });

  describe('getEventEmitter', () => {
    it('should return singleton instance', () => {
      const emitter1 = getEventEmitter();
      const emitter2 = getEventEmitter();
      expect(emitter1).toBe(emitter2);
    });
  });

  describe('emitLoopStart', () => {
    it('should emit loop:start event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('loop:start', handler);

      emitLoopStart(mockIntake, 'Hello');

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as LoopStartEvent;
      expect(event.type).toBe('loop:start');
      expect(event.runId).toBe('run-123');
      expect(event.sessionId).toBe('session-456');
      expect(event.agentId).toBe('test-agent');
      expect(event.message).toBe('Hello');
    });
  });

  describe('emitLoopContext', () => {
    it('should emit loop:context event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('loop:context', handler);

      const mockContext: ContextOutput = {
        systemPrompt: 'test',
        history: [{ id: '1', role: 'user', content: 'hi', timestamp: '' }],
        tools: [],
        tokenEstimate: 500,
        memoryContext: '',
        memory: null,
        needsCompaction: false,
        needsFlush: true,
      };

      emitLoopContext(mockIntake, mockContext);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as LoopContextEvent;
      expect(event.type).toBe('loop:context');
      expect(event.tokenEstimate).toBe(500);
      expect(event.historyLength).toBe(1);
      expect(event.needsCompaction).toBe(false);
      expect(event.needsFlush).toBe(true);
    });
  });

  describe('emitLoopExecute', () => {
    it('should emit loop:execute event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('loop:execute', handler);

      const mockExecute: ExecuteOutput = {
        response: 'Hello!',
        toolCalls: [{ id: 'tc1', name: 'test', arguments: {} }],
        toolResults: [],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        aborted: false,
      };

      emitLoopExecute(mockIntake, mockExecute);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0];
      expect(event.type).toBe('loop:execute');
      expect(event.toolCallCount).toBe(1);
      expect(event.usage.totalTokens).toBe(30);
    });
  });

  describe('emitLoopPersist', () => {
    it('should emit loop:persist event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('loop:persist', handler);

      const mockPersist: PersistOutput = {
        transcriptUpdated: true,
        sessionUpdated: true,
        memoryUpdated: false,
        lockReleased: true,
        errors: [],
      };

      emitLoopPersist(mockIntake, mockPersist);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0];
      expect(event.type).toBe('loop:persist');
      expect(event.transcriptUpdated).toBe(true);
      expect(event.lockReleased).toBe(true);
    });
  });

  describe('emitLoopEnd', () => {
    it('should emit loop:end event with duration', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('loop:end', handler);

      const startTime = Date.now() - 100;
      emitLoopEnd(mockIntake, true, startTime, { inputTokens: 10, outputTokens: 20, totalTokens: 30 });

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0];
      expect(event.type).toBe('loop:end');
      expect(event.success).toBe(true);
      expect(event.duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('emitLoopError', () => {
    it('should emit loop:error event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('loop:error', handler);

      emitLoopError('run-123', 'session-456', 'test-agent', 'execute', 'Something failed', 'ERR_001');

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as LoopErrorEvent;
      expect(event.type).toBe('loop:error');
      expect(event.stage).toBe('execute');
      expect(event.error).toBe('Something failed');
      expect(event.code).toBe('ERR_001');
    });

    it('should handle Error objects', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('loop:error', handler);

      emitLoopError('run-123', 'session-456', 'test-agent', 'intake', new Error('Test error'));

      const event = handler.mock.calls[0][0] as LoopErrorEvent;
      expect(event.error).toBe('Test error');
    });
  });

  describe('emitToolStart', () => {
    it('should emit tool:start event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('tool:start', handler);

      emitToolStart(mockIntake, { id: 'tc1', name: 'read_file', arguments: { path: '/test.txt' } });

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as ToolStartEvent;
      expect(event.type).toBe('tool:start');
      expect(event.toolCallId).toBe('tc1');
      expect(event.toolName).toBe('read_file');
      expect(event.arguments.path).toBe('/test.txt');
    });
  });

  describe('emitToolEnd', () => {
    it('should emit tool:end event for success', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('tool:end', handler);

      emitToolEnd(mockIntake, {
        toolCallId: 'tc1',
        name: 'read_file',
        result: 'file contents',
        duration: 50,
      });

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as ToolEndEvent;
      expect(event.type).toBe('tool:end');
      expect(event.success).toBe(true);
      expect(event.duration).toBe(50);
    });

    it('should emit tool:end event for failure', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('tool:end', handler);

      emitToolEnd(mockIntake, {
        toolCallId: 'tc1',
        name: 'read_file',
        result: null,
        error: 'File not found',
        duration: 10,
      });

      const event = handler.mock.calls[0][0] as ToolEndEvent;
      expect(event.success).toBe(false);
      expect(event.error).toBe('File not found');
    });
  });

  describe('wildcard subscription', () => {
    it('should receive all events with wildcard', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('*', handler);

      emitLoopStart(mockIntake, 'Hello');
      emitLoopError('run-123', 'session-456', 'test-agent', 'intake', 'Error');

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('unsubscribe', () => {
    it('should allow unsubscribing from events', () => {
      const handler = vi.fn();
      const unsubscribe = getEventEmitter().onEvent('loop:start', handler);

      emitLoopStart(mockIntake, 'First');
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      emitLoopStart(mockIntake, 'Second');
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });

  describe('emitMemoryRead', () => {
    it('should emit memory:read event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('memory:read', handler);

      emitMemoryRead('run-123', 'session-456', 'test-agent', '/path/MEMORY.md', 5, 1000, true);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as MemoryReadEvent;
      expect(event.type).toBe('memory:read');
      expect(event.memoryPath).toBe('/path/MEMORY.md');
      expect(event.sectionCount).toBe(5);
      expect(event.totalSize).toBe(1000);
      expect(event.success).toBe(true);
    });
  });

  describe('emitMemoryWrite', () => {
    it('should emit memory:write event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('memory:write', handler);

      emitMemoryWrite('run-123', 'session-456', 'test-agent', '/path/MEMORY.md', 'Current State', 2000, 50000, false, true);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as MemoryWriteEvent;
      expect(event.type).toBe('memory:write');
      expect(event.section).toBe('Current State');
      expect(event.sizeUsed).toBe(2000);
      expect(event.sizeLimit).toBe(50000);
      expect(event.truncated).toBe(false);
      expect(event.success).toBe(true);
    });
  });

  describe('emitMemoryFlush', () => {
    it('should emit memory:flush event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('memory:flush', handler);

      emitMemoryFlush('run-123', 'session-456', 'test-agent', 'compaction_pending', 3, false);

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as MemoryFlushEvent;
      expect(event.type).toBe('memory:flush');
      expect(event.reason).toBe('compaction_pending');
      expect(event.updatesCount).toBe(3);
      expect(event.noReply).toBe(false);
    });
  });

  describe('emitMemoryCompact', () => {
    it('should emit memory:compact event', () => {
      const handler = vi.fn();
      getEventEmitter().onEvent('memory:compact', handler);

      emitMemoryCompact('run-123', 'session-456', 'test-agent', 100, 10, 500, 'llm');

      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0] as MemoryCompactEvent;
      expect(event.type).toBe('memory:compact');
      expect(event.originalCount).toBe(100);
      expect(event.compactedCount).toBe(10);
      expect(event.tokensUsed).toBe(500);
      expect(event.method).toBe('llm');
    });
  });
});
