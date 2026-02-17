/**
 * Self-Correction and Retry Logic
 * 
 * Provides retry mechanisms with exponential backoff and escalation
 * for failed agent operations.
 */

import { EventEmitter } from 'events';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Whether to add jitter to delays */
  jitter: boolean;
  /** Errors that should not be retried */
  nonRetryableErrors?: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  nonRetryableErrors: ['SCOPE_VIOLATION', 'AUTHENTICATION_FAILED', 'INVALID_INPUT'],
};

/**
 * Error context for retry tracking
 */
export interface ErrorContext {
  /** Original error message */
  message: string;
  /** Error code if available */
  code?: string;
  /** Stack trace */
  stack?: string;
  /** Timestamp of error */
  timestamp: string;
  /** Attempt number when error occurred */
  attempt: number;
  /** Operation that failed */
  operation: string;
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Retry state
 */
export interface RetryState {
  /** Operation identifier */
  operationId: string;
  /** Current attempt number */
  attempt: number;
  /** All errors encountered */
  errors: ErrorContext[];
  /** Whether operation succeeded */
  succeeded: boolean;
  /** Whether escalation was triggered */
  escalated: boolean;
  /** Start time */
  startTime: string;
  /** End time */
  endTime?: string;
  /** Final result if successful */
  result?: unknown;
}

/**
 * Escalation handler type
 */
export type EscalationHandler = (
  operationId: string,
  operation: string,
  errors: ErrorContext[],
  metadata?: Record<string, unknown>
) => Promise<void> | void;

/**
 * Default escalation handler (logs to console)
 */
export const defaultEscalationHandler: EscalationHandler = (
  operationId,
  operation,
  errors
) => {
  console.error(`[ESCALATION] Operation ${operationId} (${operation}) failed after ${errors.length} attempts`);
  console.error('Last error:', errors[errors.length - 1]?.message);
};

/**
 * Calculate delay with exponential backoff
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  let delay = Math.min(exponentialDelay, config.maxDelayMs);
  
  if (config.jitter) {
    // Add random jitter (0-25% of delay)
    const jitterAmount = delay * 0.25 * Math.random();
    delay += jitterAmount;
  }
  
  return Math.floor(delay);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(
  error: Error | string,
  config: RetryConfig
): boolean {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorCode = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  
  if (config.nonRetryableErrors) {
    for (const nonRetryable of config.nonRetryableErrors) {
      if (errorMessage.includes(nonRetryable) || errorCode === nonRetryable) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry Manager class
 */
export class RetryManager extends EventEmitter {
  private config: RetryConfig;
  private escalationHandler: EscalationHandler;
  private activeOperations: Map<string, RetryState> = new Map();
  private completedOperations: RetryState[] = [];

  constructor(
    config: Partial<RetryConfig> = {},
    escalationHandler: EscalationHandler = defaultEscalationHandler
  ) {
    super();
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.escalationHandler = escalationHandler;
  }

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operationId: string,
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; result?: T; state: RetryState }> {
    const state: RetryState = {
      operationId,
      attempt: 0,
      errors: [],
      succeeded: false,
      escalated: false,
      startTime: new Date().toISOString(),
    };
    
    this.activeOperations.set(operationId, state);
    this.emit('operation:start', { operationId, operation });
    
    while (state.attempt < this.config.maxRetries) {
      state.attempt++;
      
      this.emit('attempt:start', {
        operationId,
        operation,
        attempt: state.attempt,
        maxRetries: this.config.maxRetries,
      });
      
      try {
        const result = await fn();
        
        state.succeeded = true;
        state.result = result;
        state.endTime = new Date().toISOString();
        
        this.emit('operation:success', {
          operationId,
          operation,
          attempt: state.attempt,
          result,
        });
        
        this.activeOperations.delete(operationId);
        this.completedOperations.push(state);
        
        return { success: true, result, state };
      } catch (error) {
        const errorContext: ErrorContext = {
          message: error instanceof Error ? error.message : String(error),
          code: error instanceof Error ? (error as Error & { code?: string }).code : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
          attempt: state.attempt,
          operation,
          metadata,
        };
        
        state.errors.push(errorContext);
        
        this.emit('attempt:error', {
          operationId,
          operation,
          attempt: state.attempt,
          error: errorContext,
        });
        
        // Check if error is retryable
        if (!isRetryableError(error instanceof Error ? error : String(error), this.config)) {
          this.emit('operation:non_retryable', {
            operationId,
            operation,
            error: errorContext,
          });
          break;
        }
        
        // Check if we have more retries
        if (state.attempt < this.config.maxRetries) {
          const delay = calculateBackoffDelay(state.attempt, this.config);
          
          this.emit('retry:scheduled', {
            operationId,
            operation,
            attempt: state.attempt,
            nextAttempt: state.attempt + 1,
            delayMs: delay,
          });
          
          await sleep(delay);
        }
      }
    }
    
    // All retries exhausted - escalate
    state.escalated = true;
    state.endTime = new Date().toISOString();
    
    this.emit('operation:escalated', {
      operationId,
      operation,
      errors: state.errors,
    });
    
    // Call escalation handler
    try {
      await this.escalationHandler(operationId, operation, state.errors, metadata);
    } catch (escalationError) {
      this.emit('escalation:error', {
        operationId,
        error: escalationError instanceof Error ? escalationError.message : String(escalationError),
      });
    }
    
    this.activeOperations.delete(operationId);
    this.completedOperations.push(state);
    
    return { success: false, state };
  }

  /**
   * Get active operations
   */
  getActiveOperations(): RetryState[] {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Get completed operations
   */
  getCompletedOperations(limit?: number): RetryState[] {
    if (limit) {
      return this.completedOperations.slice(-limit);
    }
    return [...this.completedOperations];
  }

  /**
   * Get operation state
   */
  getOperationState(operationId: string): RetryState | undefined {
    return this.activeOperations.get(operationId) ||
      this.completedOperations.find(op => op.operationId === operationId);
  }

  /**
   * Clear completed operations history
   */
  clearHistory(): void {
    this.completedOperations = [];
  }

  /**
   * Get retry statistics
   */
  getStats(): {
    activeOperations: number;
    completedOperations: number;
    successfulOperations: number;
    failedOperations: number;
    escalatedOperations: number;
    totalRetries: number;
  } {
    const completed = this.completedOperations;
    const totalRetries = completed.reduce((sum, op) => sum + op.attempt - 1, 0);
    
    return {
      activeOperations: this.activeOperations.size,
      completedOperations: completed.length,
      successfulOperations: completed.filter(op => op.succeeded).length,
      failedOperations: completed.filter(op => !op.succeeded).length,
      escalatedOperations: completed.filter(op => op.escalated).length,
      totalRetries,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Set escalation handler
   */
  setEscalationHandler(handler: EscalationHandler): void {
    this.escalationHandler = handler;
  }
}

/**
 * Create a retry manager instance
 */
export function createRetryManager(
  config?: Partial<RetryConfig>,
  escalationHandler?: EscalationHandler
): RetryManager {
  return new RetryManager(config, escalationHandler);
}

/**
 * Simple retry wrapper for one-off operations
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const manager = createRetryManager(config);
  const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  
  const { success, result, state } = await manager.executeWithRetry(
    operationId,
    'anonymous',
    fn
  );
  
  if (success && result !== undefined) {
    return result;
  }
  
  const lastError = state.errors[state.errors.length - 1];
  throw new Error(lastError?.message || 'Operation failed after retries');
}

/**
 * Decorator-style retry wrapper
 */
export function retryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  config: Partial<RetryConfig> = {}
): T {
  return (async (...args: unknown[]) => {
    return withRetry(() => fn(...args), config);
  }) as T;
}
