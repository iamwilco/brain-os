/**
 * Tests for Context Window Guard
 */

import { describe, it, expect } from 'vitest';
import {
  checkContextThresholds,
  guardContext,
  getTokenBudget,
  getCompactionTarget,
  canAccommodate,
  formatGuardResult,
  DEFAULT_GUARD_CONFIG,
} from './context-guard.js';
import type { ContextOutput } from './loop/context.js';

describe('Context Window Guard', () => {
  // Default usable window: 100,000 - 4,000 = 96,000 tokens
  const usableWindow = DEFAULT_GUARD_CONFIG.contextWindow - DEFAULT_GUARD_CONFIG.reserveTokens;

  describe('checkContextThresholds', () => {
    it('should return none when under flush threshold', () => {
      // 50% usage = 48,000 tokens
      const result = checkContextThresholds(48_000);
      
      expect(result.action).toBe('none');
      expect(result.usageRatio).toBeCloseTo(0.5, 1);
      expect(result.reason).toBeUndefined();
    });

    it('should return flush when at flush threshold', () => {
      // 70% usage = 67,200 tokens
      const result = checkContextThresholds(67_200);
      
      expect(result.action).toBe('flush');
      expect(result.reason).toContain('flush');
    });

    it('should return compact when at compaction threshold', () => {
      // 85% usage = 81,600 tokens
      const result = checkContextThresholds(81_600);
      
      expect(result.action).toBe('compact');
      expect(result.reason).toContain('compaction');
    });

    it('should return reject when at critical threshold', () => {
      // 95% usage = 91,200 tokens
      const result = checkContextThresholds(91_200);
      
      expect(result.action).toBe('reject');
      expect(result.reason).toContain('critical');
    });

    it('should calculate tokens until next threshold', () => {
      // At 50% usage, next threshold is flush at 70%
      const result = checkContextThresholds(48_000);
      
      // 70% of 96,000 = 67,200, minus 48,000 = 19,200
      expect(result.tokensUntilThreshold).toBe(19_200);
    });

    it('should use custom config', () => {
      const result = checkContextThresholds(50_000, {
        contextWindow: 60_000,
        reserveTokens: 2_000,
        thresholds: {
          flushThreshold: 0.8,
          compactionThreshold: 0.9,
          criticalThreshold: 0.95,
        },
      });
      
      // Usable: 58,000. 50,000/58,000 = 86.2% - above 80% flush
      expect(result.action).toBe('flush');
    });
  });

  describe('guardContext', () => {
    it('should check context output token estimate', () => {
      const contextOutput = {
        tokenEstimate: 50_000,
        systemPrompt: '',
        history: [],
        tools: [],
        memoryContext: '',
        memory: null,
        needsCompaction: false,
        needsFlush: false,
      } as ContextOutput;

      const result = guardContext(contextOutput);
      
      expect(result.tokenEstimate).toBe(50_000);
      expect(result.action).toBe('none');
    });
  });

  describe('getTokenBudget', () => {
    it('should return tokens available before flush threshold', () => {
      // At 0 tokens, budget is 70% of 96,000 = 67,200
      const budget = getTokenBudget(0);
      expect(budget).toBe(67_200);
    });

    it('should return remaining budget when partially used', () => {
      // At 40,000 tokens, budget is 67,200 - 40,000 = 27,200
      const budget = getTokenBudget(40_000);
      expect(budget).toBe(27_200);
    });

    it('should return 0 when over flush threshold', () => {
      const budget = getTokenBudget(70_000);
      expect(budget).toBe(0);
    });
  });

  describe('getCompactionTarget', () => {
    it('should calculate target at default 50%', () => {
      const { targetTokens, tokensToRemove } = getCompactionTarget(80_000);
      
      // Target: 50% of 96,000 = 48,000
      expect(targetTokens).toBe(48_000);
      expect(tokensToRemove).toBe(32_000);
    });

    it('should use custom target ratio', () => {
      const { targetTokens, tokensToRemove } = getCompactionTarget(80_000, 0.4);
      
      // Target: 40% of 96,000 = 38,400
      expect(targetTokens).toBe(38_400);
      expect(tokensToRemove).toBe(41_600);
    });

    it('should return 0 tokens to remove when under target', () => {
      const { tokensToRemove } = getCompactionTarget(30_000, 0.5);
      expect(tokensToRemove).toBe(0);
    });
  });

  describe('canAccommodate', () => {
    it('should return canFit=true when under threshold', () => {
      const result = canAccommodate(40_000, 10_000);
      
      expect(result.canFit).toBe(true);
      expect(result.action).toBe('none');
      expect(result.overage).toBe(0);
    });

    it('should return flush action when crossing flush threshold', () => {
      const result = canAccommodate(60_000, 10_000);
      
      expect(result.canFit).toBe(true);
      expect(result.action).toBe('flush');
    });

    it('should return compact action when crossing compaction threshold', () => {
      const result = canAccommodate(75_000, 10_000);
      
      expect(result.canFit).toBe(true);
      expect(result.action).toBe('compact');
    });

    it('should return canFit=false when exceeding critical threshold', () => {
      const result = canAccommodate(85_000, 10_000);
      
      expect(result.canFit).toBe(false);
      expect(result.action).toBe('reject');
      expect(result.overage).toBeGreaterThan(0);
    });
  });

  describe('formatGuardResult', () => {
    it('should format OK result', () => {
      const result = checkContextThresholds(48_000);
      const formatted = formatGuardResult(result);
      
      expect(formatted).toContain('OK');
      expect(formatted).toContain('48,000');
    });

    it('should format action result with reason', () => {
      const result = checkContextThresholds(70_000);
      const formatted = formatGuardResult(result);
      
      expect(formatted).toContain('FLUSH');
      expect(formatted).toContain('70,000');
    });
  });
});
