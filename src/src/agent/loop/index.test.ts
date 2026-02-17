/**
 * Tests for Agent Loop
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runAgentLoop,
  type AgentLoopInput,
  type LLMHandler,
} from './index.js';

// Mock all stage modules
vi.mock('./intake.js', () => ({
  intake: vi.fn().mockResolvedValue({
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
    lock: { sessionId: 'session-456', runId: 'run-123' },
  }),
  releaseIntake: vi.fn().mockReturnValue(true),
  IntakeError: class IntakeError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  isIntakeError: vi.fn().mockReturnValue(false),
  intakeErrorToHttpStatus: vi.fn().mockReturnValue(400),
}));

vi.mock('./context.js', () => ({
  context: vi.fn().mockResolvedValue({
    systemPrompt: 'You are a helpful assistant.',
    history: [],
    tools: [],
    tokenEstimate: 100,
    memoryContext: '',
    memory: null,
    needsCompaction: false,
    needsFlush: false,
  }),
  contextRequiresAction: vi.fn().mockReturnValue({ action: 'none' }),
}));

vi.mock('./execute.js', () => ({
  execute: vi.fn().mockResolvedValue({
    response: 'Hello! How can I help you?',
    toolCalls: [],
    toolResults: [],
    usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
    aborted: false,
  }),
  isResponseComplete: vi.fn().mockReturnValue(true),
  placeholderLLMHandler: { chat: vi.fn() },
  placeholderToolExecutor: { execute: vi.fn(), hasTools: vi.fn() },
}));

vi.mock('./persist.js', () => ({
  persist: vi.fn().mockResolvedValue({
    transcriptUpdated: true,
    sessionUpdated: true,
    memoryUpdated: false,
    lockReleased: true,
    errors: [],
  }),
  isPersistSuccess: vi.fn().mockReturnValue(true),
  hasCriticalFailures: vi.fn().mockReturnValue(false),
}));

describe('Agent Loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runAgentLoop', () => {
    it('should execute all stages successfully', async () => {
      const input: AgentLoopInput = {
        message: 'Hello',
        vaultPath: '/test/vault',
        agentPath: '/test/agent',
      };

      const result = await runAgentLoop(input);

      expect(result.success).toBe(true);
      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.sessionId).toBe('session-456');
      expect(result.runId).toBe('run-123');
      expect(result.usage.totalTokens).toBe(80);
    });

    it('should return stage outputs when configured', async () => {
      const input: AgentLoopInput = {
        message: 'Hello',
        vaultPath: '/test/vault',
        agentPath: '/test/agent',
      };

      const result = await runAgentLoop(input, { includeStageOutputs: true });

      expect(result.stages).toBeDefined();
      expect(result.stages?.intake).toBeDefined();
      expect(result.stages?.context).toBeDefined();
      expect(result.stages?.execute).toBeDefined();
      expect(result.stages?.persist).toBeDefined();
    });

    it('should handle intake errors', async () => {
      const { intake, isIntakeError, intakeErrorToHttpStatus } = await import('./intake.js');
      const IntakeError = (await import('./intake.js')).IntakeError;
      
      const error = new IntakeError('VALIDATION_ERROR', 'Message is empty');
      vi.mocked(intake).mockRejectedValueOnce(error);
      vi.mocked(isIntakeError).mockReturnValueOnce(true);
      vi.mocked(intakeErrorToHttpStatus).mockReturnValueOnce(400);

      const input: AgentLoopInput = {
        message: '',
        vaultPath: '/test/vault',
        agentPath: '/test/agent',
      };

      const result = await runAgentLoop(input);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.httpStatus).toBe(400);
    });

    it('should handle aborted execution', async () => {
      const { execute } = await import('./execute.js');
      vi.mocked(execute).mockResolvedValueOnce({
        response: '[Aborted]',
        toolCalls: [],
        toolResults: [],
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
        aborted: true,
      });

      const input: AgentLoopInput = {
        message: 'Hello',
        vaultPath: '/test/vault',
        agentPath: '/test/agent',
      };

      const result = await runAgentLoop(input);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ABORTED');
    });

    it('should handle persist failures', async () => {
      const { hasCriticalFailures, persist } = await import('./persist.js');
      vi.mocked(hasCriticalFailures).mockReturnValueOnce(true);
      vi.mocked(persist).mockResolvedValueOnce({
        transcriptUpdated: false,
        sessionUpdated: false,
        memoryUpdated: false,
        lockReleased: false,
        errors: ['Write failed'],
      });

      const input: AgentLoopInput = {
        message: 'Hello',
        vaultPath: '/test/vault',
        agentPath: '/test/agent',
      };

      const result = await runAgentLoop(input);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PERSIST_FAILED');
    });

    it('should release lock on unexpected errors', async () => {
      const { context } = await import('./context.js');
      const { releaseIntake } = await import('./intake.js');
      
      vi.mocked(context).mockRejectedValueOnce(new Error('Unexpected error'));

      const input: AgentLoopInput = {
        message: 'Hello',
        vaultPath: '/test/vault',
        agentPath: '/test/agent',
      };

      const result = await runAgentLoop(input);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INTERNAL_ERROR');
      expect(releaseIntake).toHaveBeenCalled();
    });

    it('should pass custom LLM handler', async () => {
      const { execute } = await import('./execute.js');
      
      const customHandler: LLMHandler = {
        async chat() {
          return { content: 'Custom response', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
        },
      };

      const input: AgentLoopInput = {
        message: 'Hello',
        vaultPath: '/test/vault',
        agentPath: '/test/agent',
      };

      await runAgentLoop(input, { llmHandler: customHandler });

      expect(execute).toHaveBeenCalledWith(
        expect.anything(),
        customHandler,
        expect.anything()
      );
    });
  });
});
