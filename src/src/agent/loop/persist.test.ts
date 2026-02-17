/**
 * Tests for PERSIST stage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  persist,
  isPersistSuccess,
  hasCriticalFailures,
  type PersistInput,
  type PersistOutput,
} from './persist.js';
import type { IntakeOutput } from './intake.js';
import type { ExecuteOutput } from './execute.js';
import type { SessionLock } from '../session-lock.js';

// Mock the dependencies
vi.mock('../session.js', () => ({
  appendToTranscript: vi.fn().mockResolvedValue({ id: 'msg-1' }),
  updateSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../memory.js', () => ({
  applyMemoryUpdates: vi.fn().mockResolvedValue(null),
}));

vi.mock('../session-lock.js', () => ({
  releaseSessionLock: vi.fn().mockReturnValue(true),
}));

// Helper to create mock intake output
function createMockIntake(overrides: Partial<IntakeOutput> = {}): IntakeOutput {
  return {
    runId: 'run-123',
    sessionId: 'session-456',
    session: {
      id: 'session-456',
      agentId: 'test-agent',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 5,
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
      instructions: 'Test instructions',
      sections: { other: {} },
      path: '/test/agent/AGENT.md',
    },
    agentPath: '/test/agent',
    lock: {
      sessionId: 'session-456',
      runId: 'run-123',
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + 900000),
    } as SessionLock,
    ...overrides,
  };
}

// Helper to create mock execute output
function createMockExecute(overrides: Partial<ExecuteOutput> = {}): ExecuteOutput {
  return {
    response: 'Hello! How can I help you?',
    toolCalls: [],
    toolResults: [],
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    aborted: false,
    ...overrides,
  };
}

describe('PERSIST Stage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('persist', () => {
    it('should persist transcript and update session', async () => {
      const input: PersistInput = {
        intake: createMockIntake(),
        message: 'Hello',
        execute: createMockExecute(),
      };

      const result = await persist(input);

      expect(result.transcriptUpdated).toBe(true);
      expect(result.sessionUpdated).toBe(true);
      expect(result.lockReleased).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle tool calls in transcript', async () => {
      const input: PersistInput = {
        intake: createMockIntake(),
        message: 'Read file test.txt',
        execute: createMockExecute({
          toolCalls: [
            { id: 'call-1', name: 'read_file', arguments: { path: 'test.txt' } },
          ],
          toolResults: [
            { toolCallId: 'call-1', name: 'read_file', result: 'file contents', duration: 50 },
          ],
        }),
      };

      const result = await persist(input);

      expect(result.transcriptUpdated).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle memory updates when flush is triggered', async () => {
      const input: PersistInput = {
        intake: createMockIntake(),
        message: 'Hello',
        execute: createMockExecute(),
        flushMemory: true,
        memoryUpdates: [
          { section: 'Context', content: 'Updated context' },
        ],
      };

      const result = await persist(input);

      expect(result.memoryUpdated).toBe(true);
    });

    it('should not update memory when no flush triggered', async () => {
      const input: PersistInput = {
        intake: createMockIntake(),
        message: 'Hello',
        execute: createMockExecute(),
        flushMemory: false,
      };

      const result = await persist(input);

      expect(result.memoryUpdated).toBe(false);
    });

    it('should always release lock even on errors', async () => {
      // Mock appendToTranscript to fail all retries
      const { appendToTranscript } = await import('../session.js');
      vi.mocked(appendToTranscript).mockRejectedValue(new Error('Write failed'));

      const input: PersistInput = {
        intake: createMockIntake(),
        message: 'Hello',
        execute: createMockExecute(),
      };

      const result = await persist(input, { maxWriteRetries: 1, retryDelay: 1 });

      expect(result.lockReleased).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Reset mock for other tests
      vi.mocked(appendToTranscript).mockResolvedValue({ id: 'msg-1' } as any);
    });
  });

  describe('isPersistSuccess', () => {
    it('should return true for fully successful persist', () => {
      const output: PersistOutput = {
        transcriptUpdated: true,
        sessionUpdated: true,
        memoryUpdated: false,
        lockReleased: true,
        errors: [],
      };

      expect(isPersistSuccess(output)).toBe(true);
    });

    it('should return false if transcript not updated', () => {
      const output: PersistOutput = {
        transcriptUpdated: false,
        sessionUpdated: true,
        memoryUpdated: false,
        lockReleased: true,
        errors: ['Write failed'],
      };

      expect(isPersistSuccess(output)).toBe(false);
    });

    it('should return false if lock not released', () => {
      const output: PersistOutput = {
        transcriptUpdated: true,
        sessionUpdated: true,
        memoryUpdated: false,
        lockReleased: false,
        errors: ['Lock release failed'],
      };

      expect(isPersistSuccess(output)).toBe(false);
    });

    it('should return false if there are errors', () => {
      const output: PersistOutput = {
        transcriptUpdated: true,
        sessionUpdated: true,
        memoryUpdated: false,
        lockReleased: true,
        errors: ['Some warning'],
      };

      expect(isPersistSuccess(output)).toBe(false);
    });
  });

  describe('hasCriticalFailures', () => {
    it('should return false for successful persist', () => {
      const output: PersistOutput = {
        transcriptUpdated: true,
        sessionUpdated: true,
        memoryUpdated: false,
        lockReleased: true,
        errors: [],
      };

      expect(hasCriticalFailures(output)).toBe(false);
    });

    it('should return true if lock not released', () => {
      const output: PersistOutput = {
        transcriptUpdated: true,
        sessionUpdated: true,
        memoryUpdated: false,
        lockReleased: false,
        errors: [],
      };

      expect(hasCriticalFailures(output)).toBe(true);
    });

    it('should return true if transcript not updated', () => {
      const output: PersistOutput = {
        transcriptUpdated: false,
        sessionUpdated: true,
        memoryUpdated: false,
        lockReleased: true,
        errors: [],
      };

      expect(hasCriticalFailures(output)).toBe(true);
    });

    it('should return false for non-critical failures', () => {
      const output: PersistOutput = {
        transcriptUpdated: true,
        sessionUpdated: false,  // Session update failure is non-critical
        memoryUpdated: false,
        lockReleased: true,
        errors: ['Session update failed'],
      };

      expect(hasCriticalFailures(output)).toBe(false);
    });
  });
});
