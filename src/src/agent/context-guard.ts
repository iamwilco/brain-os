/**
 * Context Window Guard
 * 
 * Monitors token usage and triggers memory flush or compaction
 * when thresholds are exceeded.
 */

import type { ContextOutput } from './loop/context.js';

/**
 * Context guard thresholds
 */
export interface ContextThresholds {
  /** Soft threshold - triggers memory flush (0-1, percentage of usable window) */
  flushThreshold: number;
  /** Hard threshold - triggers compaction (0-1, percentage of usable window) */
  compactionThreshold: number;
  /** Critical threshold - reject if exceeded after compaction (0-1) */
  criticalThreshold: number;
}

/**
 * Default thresholds
 */
export const DEFAULT_THRESHOLDS: ContextThresholds = {
  flushThreshold: 0.7,       // 70% - save working memory
  compactionThreshold: 0.85, // 85% - compact history
  criticalThreshold: 0.95,   // 95% - cannot proceed
};

/**
 * Context guard configuration
 */
export interface ContextGuardConfig {
  /** Total context window size in tokens */
  contextWindow: number;
  /** Tokens reserved for response generation */
  reserveTokens: number;
  /** Thresholds for triggering actions */
  thresholds: ContextThresholds;
}

/**
 * Default configuration
 */
export const DEFAULT_GUARD_CONFIG: ContextGuardConfig = {
  contextWindow: 100_000,
  reserveTokens: 4_000,
  thresholds: DEFAULT_THRESHOLDS,
};

/**
 * Guard action to take
 */
export type GuardAction = 'none' | 'flush' | 'compact' | 'reject';

/**
 * Guard check result
 */
export interface GuardResult {
  /** Action to take */
  action: GuardAction;
  /** Current token usage */
  tokenEstimate: number;
  /** Usable window (contextWindow - reserveTokens) */
  usableWindow: number;
  /** Usage ratio (0-1) */
  usageRatio: number;
  /** Tokens available before next threshold */
  tokensUntilThreshold: number;
  /** Human-readable reason */
  reason?: string;
}

/**
 * Check context against thresholds and determine action
 */
export function checkContextThresholds(
  tokenEstimate: number,
  config: Partial<ContextGuardConfig> = {}
): GuardResult {
  const cfg = { ...DEFAULT_GUARD_CONFIG, ...config };
  const thresholds = { ...DEFAULT_THRESHOLDS, ...cfg.thresholds };
  
  const usableWindow = cfg.contextWindow - cfg.reserveTokens;
  const usageRatio = tokenEstimate / usableWindow;
  
  // Determine action based on thresholds
  let action: GuardAction = 'none';
  let reason: string | undefined;
  let tokensUntilThreshold: number;
  
  if (usageRatio >= thresholds.criticalThreshold) {
    action = 'reject';
    reason = `Token usage (${Math.round(usageRatio * 100)}%) exceeds critical threshold (${Math.round(thresholds.criticalThreshold * 100)}%)`;
    tokensUntilThreshold = 0;
  } else if (usageRatio >= thresholds.compactionThreshold) {
    action = 'compact';
    reason = `Token usage (${Math.round(usageRatio * 100)}%) exceeds compaction threshold (${Math.round(thresholds.compactionThreshold * 100)}%)`;
    tokensUntilThreshold = Math.floor(usableWindow * thresholds.criticalThreshold - tokenEstimate);
  } else if (usageRatio >= thresholds.flushThreshold) {
    action = 'flush';
    reason = `Token usage (${Math.round(usageRatio * 100)}%) exceeds flush threshold (${Math.round(thresholds.flushThreshold * 100)}%)`;
    tokensUntilThreshold = Math.floor(usableWindow * thresholds.compactionThreshold - tokenEstimate);
  } else {
    tokensUntilThreshold = Math.floor(usableWindow * thresholds.flushThreshold - tokenEstimate);
  }
  
  return {
    action,
    tokenEstimate,
    usableWindow,
    usageRatio,
    tokensUntilThreshold,
    reason,
  };
}

/**
 * Check context output and determine required action
 */
export function guardContext(
  contextOutput: ContextOutput,
  config: Partial<ContextGuardConfig> = {}
): GuardResult {
  return checkContextThresholds(contextOutput.tokenEstimate, config);
}

/**
 * Calculate how many tokens can be added before hitting flush threshold
 */
export function getTokenBudget(
  currentTokens: number,
  config: Partial<ContextGuardConfig> = {}
): number {
  const cfg = { ...DEFAULT_GUARD_CONFIG, ...config };
  const thresholds = { ...DEFAULT_THRESHOLDS, ...cfg.thresholds };
  
  const usableWindow = cfg.contextWindow - cfg.reserveTokens;
  const flushLimit = Math.floor(usableWindow * thresholds.flushThreshold);
  
  return Math.max(0, flushLimit - currentTokens);
}

/**
 * Estimate tokens needed for compaction to reach target usage
 */
export function getCompactionTarget(
  currentTokens: number,
  targetRatio: number = 0.5,
  config: Partial<ContextGuardConfig> = {}
): { targetTokens: number; tokensToRemove: number } {
  const cfg = { ...DEFAULT_GUARD_CONFIG, ...config };
  
  const usableWindow = cfg.contextWindow - cfg.reserveTokens;
  const targetTokens = Math.floor(usableWindow * targetRatio);
  const tokensToRemove = Math.max(0, currentTokens - targetTokens);
  
  return { targetTokens, tokensToRemove };
}

/**
 * Check if context can accommodate additional tokens
 */
export function canAccommodate(
  currentTokens: number,
  additionalTokens: number,
  config: Partial<ContextGuardConfig> = {}
): { canFit: boolean; action: GuardAction; overage: number } {
  const cfg = { ...DEFAULT_GUARD_CONFIG, ...config };
  const thresholds = { ...DEFAULT_THRESHOLDS, ...cfg.thresholds };
  
  const usableWindow = cfg.contextWindow - cfg.reserveTokens;
  const newTotal = currentTokens + additionalTokens;
  const newRatio = newTotal / usableWindow;
  
  let action: GuardAction = 'none';
  if (newRatio >= thresholds.criticalThreshold) {
    action = 'reject';
  } else if (newRatio >= thresholds.compactionThreshold) {
    action = 'compact';
  } else if (newRatio >= thresholds.flushThreshold) {
    action = 'flush';
  }
  
  const criticalLimit = Math.floor(usableWindow * thresholds.criticalThreshold);
  const overage = Math.max(0, newTotal - criticalLimit);
  
  return {
    canFit: action !== 'reject',
    action,
    overage,
  };
}

/**
 * Format guard result for logging
 */
export function formatGuardResult(result: GuardResult): string {
  const pct = Math.round(result.usageRatio * 100);
  const used = result.tokenEstimate.toLocaleString();
  const total = result.usableWindow.toLocaleString();
  
  if (result.action === 'none') {
    return `Context OK: ${used}/${total} tokens (${pct}%)`;
  }
  
  return `Context ${result.action.toUpperCase()}: ${used}/${total} tokens (${pct}%) - ${result.reason}`;
}
