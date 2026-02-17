/**
 * Tests for Self-Correction and Retry Logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBackoffDelay,
  isRetryableError,
  RetryManager,
  createRetryManager,
  withRetry,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
  type ErrorContext,
} from './retry.js';

describe('Self-Correction and Retry', () => {
  describe('calculateBackoffDelay', () => {
    const config: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      jitter: false, // Disable jitter for predictable tests
    };

    it('should calculate exponential backoff', () => {
      expect(calculateBackoffDelay(1, config)).toBe(1000);
      expect(calculateBackoffDelay(2, config)).toBe(2000);
      expect(calculateBackoffDelay(3, config)).toBe(4000);
    });

    it('should respect max delay', () => {
      const limitedConfig = { ...config, maxDelayMs: 3000 };
      expect(calculateBackoffDelay(5, limitedConfig)).toBe(3000);
    });

    it('should add jitter when enabled', () => {
      const jitterConfig = { ...config, jitter: true };
      const delay1 = calculateBackoffDelay(1, jitterConfig);
      const delay2 = calculateBackoffDelay(1, jitterConfig);
      
      // With jitter, delays should be >= base delay
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1250); // Max 25% jitter
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      expect(isRetryableError(new Error('Network timeout'), DEFAULT_RETRY_CONFIG)).toBe(true);
      expect(isRetryableError('Connection failed', DEFAULT_RETRY_CONFIG)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError(new Error('SCOPE_VIOLATION: Access denied'), DEFAULT_RETRY_CONFIG)).toBe(false);
      expect(isRetryableError(new Error('AUTHENTICATION_FAILED'), DEFAULT_RETRY_CONFIG)).toBe(false);
      expect(isRetryableError(new Error('INVALID_INPUT: Bad request'), DEFAULT_RETRY_CONFIG)).toBe(false);
    });

    it('should check error codes', () => {
      const error = new Error('Access denied') as Error & { code: string };
      error.code = 'SCOPE_VIOLATION';
      expect(isRetryableError(error, DEFAULT_RETRY_CONFIG)).toBe(false);
    });
  });

  describe('RetryManager', () => {
    let manager: RetryManager;

    beforeEach(() => {
      manager = createRetryManager({
        maxRetries: 3,
        initialDelayMs: 10, // Short delays for tests
        jitter: false,
      });
    });

    describe('executeWithRetry', () => {
      it('should succeed on first attempt', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const { success, result, state } = await manager.executeWithRetry(
          'op-1',
          'test-operation',
          fn
        );

        expect(success).toBe(true);
        expect(result).toBe('success');
        expect(state.attempt).toBe(1);
        expect(state.errors).toHaveLength(0);
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should retry on failure and succeed', async () => {
        const fn = vi.fn()
          .mockRejectedValueOnce(new Error('First failure'))
          .mockRejectedValueOnce(new Error('Second failure'))
          .mockResolvedValue('success');

        const { success, result, state } = await manager.executeWithRetry(
          'op-2',
          'test-operation',
          fn
        );

        expect(success).toBe(true);
        expect(result).toBe('success');
        expect(state.attempt).toBe(3);
        expect(state.errors).toHaveLength(2);
        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should escalate after max retries', async () => {
        const escalationHandler = vi.fn();
        const customManager = createRetryManager(
          { maxRetries: 2, initialDelayMs: 10, jitter: false },
          escalationHandler
        );

        const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

        const { success, state } = await customManager.executeWithRetry(
          'op-3',
          'failing-operation',
          fn
        );

        expect(success).toBe(false);
        expect(state.escalated).toBe(true);
        expect(state.errors).toHaveLength(2);
        expect(escalationHandler).toHaveBeenCalledTimes(1);
        expect(escalationHandler).toHaveBeenCalledWith(
          'op-3',
          'failing-operation',
          expect.any(Array),
          undefined
        );
      });

      it('should not retry non-retryable errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('SCOPE_VIOLATION: Access denied'));

        const { success, state } = await manager.executeWithRetry(
          'op-4',
          'test-operation',
          fn
        );

        expect(success).toBe(false);
        expect(state.attempt).toBe(1);
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should emit events', async () => {
        const startHandler = vi.fn();
        const successHandler = vi.fn();
        const attemptHandler = vi.fn();

        manager.on('operation:start', startHandler);
        manager.on('operation:success', successHandler);
        manager.on('attempt:start', attemptHandler);

        const fn = vi.fn().mockResolvedValue('success');
        await manager.executeWithRetry('op-5', 'test', fn);

        expect(startHandler).toHaveBeenCalledTimes(1);
        expect(successHandler).toHaveBeenCalledTimes(1);
        expect(attemptHandler).toHaveBeenCalledTimes(1);
      });

      it('should preserve error context', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('Test error'));

        const { state } = await manager.executeWithRetry(
          'op-6',
          'test-operation',
          fn,
          { customData: 'test' }
        );

        expect(state.errors).toHaveLength(3);
        const error = state.errors[0];
        expect(error.message).toBe('Test error');
        expect(error.operation).toBe('test-operation');
        expect(error.attempt).toBe(1);
        expect(error.timestamp).toBeDefined();
        expect(error.metadata).toEqual({ customData: 'test' });
      });
    });

    describe('getStats', () => {
      it('should return correct statistics', async () => {
        const fn1 = vi.fn().mockResolvedValue('success');
        const fn2 = vi.fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');
        const fn3 = vi.fn().mockRejectedValue(new Error('always fails'));

        await manager.executeWithRetry('op-1', 'test', fn1);
        await manager.executeWithRetry('op-2', 'test', fn2);
        await manager.executeWithRetry('op-3', 'test', fn3);

        const stats = manager.getStats();

        expect(stats.completedOperations).toBe(3);
        expect(stats.successfulOperations).toBe(2);
        expect(stats.failedOperations).toBe(1);
        expect(stats.escalatedOperations).toBe(1);
        expect(stats.totalRetries).toBeGreaterThan(0);
      });
    });

    describe('getOperationState', () => {
      it('should return operation state', async () => {
        const fn = vi.fn().mockResolvedValue('success');
        await manager.executeWithRetry('op-test', 'test', fn);

        const state = manager.getOperationState('op-test');
        expect(state).toBeDefined();
        expect(state?.succeeded).toBe(true);
      });
    });

    describe('configuration', () => {
      it('should update configuration', () => {
        manager.updateConfig({ maxRetries: 5 });
        const config = manager.getConfig();
        expect(config.maxRetries).toBe(5);
      });

      it('should set escalation handler', async () => {
        const newHandler = vi.fn();
        manager.setEscalationHandler(newHandler);

        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        await manager.executeWithRetry('op', 'test', fn);

        expect(newHandler).toHaveBeenCalled();
      });
    });
  });

  describe('withRetry', () => {
    it('should retry and return result', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'success';
      };

      const result = await withRetry(fn, { initialDelayMs: 10, jitter: false });
      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should throw after max retries', async () => {
      const fn = async () => {
        throw new Error('always fails');
      };

      await expect(withRetry(fn, { maxRetries: 2, initialDelayMs: 10, jitter: false }))
        .rejects.toThrow('always fails');
    });
  });
});
