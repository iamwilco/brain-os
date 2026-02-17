/**
 * Tests for Memory Flush Flow
 */

import { describe, it, expect } from 'vitest';
import {
  createFlushState,
  shouldTriggerFlush,
  buildFlushMessage,
  parseFlushResponse,
  updateFlushState,
  resetFlushCycle,
  shouldSuppressResponse,
  formatFlushResult,
  FLUSH_SYSTEM_MESSAGE,
  FLUSH_REMINDER_MESSAGE,
  type FlushRequest,
  type FlushState,
} from './memory-flush.js';

describe('Memory Flush Flow', () => {
  describe('createFlushState', () => {
    it('should create initial state', () => {
      const state = createFlushState();
      
      expect(state.inProgress).toBe(false);
      expect(state.flushedThisCycle).toBe(false);
      expect(state.lastFlushAt).toBeNull();
      expect(state.flushCount).toBe(0);
    });
  });

  describe('shouldTriggerFlush', () => {
    const baseRequest: FlushRequest = {
      reason: 'threshold',
      currentMemory: null,
      recentMessages: [],
      tokenEstimate: 70000,
      preCompaction: false,
    };

    it('should not trigger when in progress', () => {
      const state: FlushState = {
        inProgress: true,
        flushedThisCycle: false,
        lastFlushAt: null,
        flushCount: 0,
      };

      expect(shouldTriggerFlush(state, baseRequest)).toBe(false);
    });

    it('should not trigger twice in compaction cycle', () => {
      const state: FlushState = {
        inProgress: false,
        flushedThisCycle: true,
        lastFlushAt: new Date(),
        flushCount: 1,
      };

      const request = { ...baseRequest, preCompaction: true };
      expect(shouldTriggerFlush(state, request)).toBe(false);
    });

    it('should trigger on manual request', () => {
      const state = createFlushState();
      const request = { ...baseRequest, reason: 'manual' as const };
      
      expect(shouldTriggerFlush(state, request)).toBe(true);
    });

    it('should trigger on session end', () => {
      const state = createFlushState();
      const request = { ...baseRequest, reason: 'session_end' as const };
      
      expect(shouldTriggerFlush(state, request)).toBe(true);
    });

    it('should trigger on threshold', () => {
      const state = createFlushState();
      expect(shouldTriggerFlush(state, baseRequest)).toBe(true);
    });
  });

  describe('buildFlushMessage', () => {
    it('should build pre-compaction message', () => {
      const request: FlushRequest = {
        reason: 'compaction_pending',
        currentMemory: null,
        recentMessages: [],
        tokenEstimate: 85000,
        preCompaction: true,
      };

      const message = buildFlushMessage(request);
      
      expect(message.role).toBe('system');
      expect(message.content).toBe(FLUSH_SYSTEM_MESSAGE);
      expect(message.metadata?.type).toBe('memory_flush');
      expect(message.metadata?.preCompaction).toBe(true);
    });

    it('should build reminder message for non-compaction', () => {
      const request: FlushRequest = {
        reason: 'threshold',
        currentMemory: null,
        recentMessages: [],
        tokenEstimate: 70000,
        preCompaction: false,
      };

      const message = buildFlushMessage(request);
      
      expect(message.content).toBe(FLUSH_REMINDER_MESSAGE);
    });
  });

  describe('parseFlushResponse', () => {
    it('should parse NO_REPLY response', () => {
      const result = parseFlushResponse('[NO_REPLY]');
      
      expect(result.triggered).toBe(true);
      expect(result.noReply).toBe(true);
      expect(result.updates).toHaveLength(0);
    });

    it('should parse empty response as no-reply', () => {
      const result = parseFlushResponse('');
      
      expect(result.noReply).toBe(true);
    });

    it('should parse memory block with section', () => {
      const response = `
Here are my updates:
\`\`\`memory
## User Preferences
User prefers dark mode.
Timezone is UTC+1.
\`\`\`
`;

      const result = parseFlushResponse(response);
      
      expect(result.noReply).toBe(false);
      expect(result.updates).toHaveLength(1);
      expect(result.updates[0].section).toBe('User Preferences');
      expect(result.updates[0].content).toContain('dark mode');
    });

    it('should parse multiple memory blocks', () => {
      const response = `
\`\`\`memory
## Context
Working on project X.
\`\`\`

\`\`\`memory
## Tasks
- Complete feature A
- Review PR #123
\`\`\`
`;

      const result = parseFlushResponse(response);
      
      expect(result.updates).toHaveLength(2);
      expect(result.updates[0].section).toBe('Context');
      expect(result.updates[1].section).toBe('Tasks');
    });

    it('should use default section when header missing', () => {
      const response = `
\`\`\`memory
Just some content without a header.
\`\`\`
`;

      const result = parseFlushResponse(response);
      
      expect(result.updates).toHaveLength(1);
      expect(result.updates[0].section).toBe('Working Context');
    });
  });

  describe('updateFlushState', () => {
    it('should update state after flush', () => {
      const state = createFlushState();
      const result = { triggered: true, updates: [], noReply: false };
      
      const newState = updateFlushState(state, result, true);
      
      expect(newState.inProgress).toBe(false);
      expect(newState.flushedThisCycle).toBe(true);
      expect(newState.lastFlushAt).not.toBeNull();
      expect(newState.flushCount).toBe(1);
    });

    it('should not mark flushed if not pre-compaction', () => {
      const state = createFlushState();
      const result = { triggered: true, updates: [], noReply: false };
      
      const newState = updateFlushState(state, result, false);
      
      expect(newState.flushedThisCycle).toBe(false);
    });
  });

  describe('resetFlushCycle', () => {
    it('should reset flushedThisCycle', () => {
      const state: FlushState = {
        inProgress: false,
        flushedThisCycle: true,
        lastFlushAt: new Date(),
        flushCount: 3,
      };

      const newState = resetFlushCycle(state);
      
      expect(newState.flushedThisCycle).toBe(false);
      expect(newState.flushCount).toBe(3); // Preserved
    });
  });

  describe('shouldSuppressResponse', () => {
    it('should suppress NO_REPLY', () => {
      expect(shouldSuppressResponse('[NO_REPLY]')).toBe(true);
    });

    it('should suppress empty response', () => {
      expect(shouldSuppressResponse('')).toBe(true);
      expect(shouldSuppressResponse('  ')).toBe(true);
    });

    it('should suppress "no reply" text', () => {
      expect(shouldSuppressResponse('No Reply')).toBe(true);
    });

    it('should not suppress regular response', () => {
      expect(shouldSuppressResponse('Here are my updates...')).toBe(false);
    });
  });

  describe('formatFlushResult', () => {
    it('should format error result', () => {
      const result = { triggered: true, updates: [], noReply: false, error: 'Failed' };
      expect(formatFlushResult(result)).toContain('failed');
    });

    it('should format no-reply result', () => {
      const result = { triggered: true, updates: [], noReply: true };
      expect(formatFlushResult(result)).toContain('No updates');
    });

    it('should format updates result', () => {
      const result = {
        triggered: true,
        updates: [
          { section: 'Context', content: 'test' },
          { section: 'Tasks', content: 'test' },
        ],
        noReply: false,
      };
      
      const formatted = formatFlushResult(result);
      expect(formatted).toContain('2 update(s)');
      expect(formatted).toContain('Context');
      expect(formatted).toContain('Tasks');
    });
  });
});
