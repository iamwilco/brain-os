/**
 * Session locking mechanism
 * Prevents concurrent execution on the same session
 * 
 * Implements PRD v2.0 requirement R2: Session serialization
 */

import { randomUUID } from 'crypto';

/**
 * Lock state for a session
 */
export interface SessionLock {
  sessionId: string;
  runId: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/**
 * Lock acquisition result
 */
export interface LockResult {
  success: boolean;
  lock?: SessionLock;
  error?: string;
  waitedMs?: number;
}

/**
 * Lock manager configuration
 */
export interface SessionLockConfig {
  /** Lock timeout in ms (auto-release). Default: 15 minutes */
  lockTimeoutMs: number;
  /** Max time to wait for lock acquisition in ms. Default: 30 seconds */
  acquireTimeoutMs: number;
  /** Polling interval when waiting for lock in ms. Default: 100ms */
  pollIntervalMs: number;
}

const DEFAULT_CONFIG: SessionLockConfig = {
  lockTimeoutMs: 15 * 60 * 1000,  // 15 minutes
  acquireTimeoutMs: 30 * 1000,    // 30 seconds
  pollIntervalMs: 100,            // 100ms
};

/**
 * Waiter waiting for a lock to be released
 */
interface LockWaiter {
  resolve: (released: boolean) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * Session lock manager
 * 
 * Manages exclusive locks for session execution.
 * Only one execution can hold a lock for a given session at a time.
 * 
 * Usage:
 * ```typescript
 * const manager = SessionLockManager.getInstance();
 * 
 * const result = await manager.acquire(sessionId);
 * if (!result.success) {
 *   throw new Error(result.error);
 * }
 * 
 * try {
 *   // Execute agent loop
 * } finally {
 *   manager.release(sessionId, result.lock!.runId);
 * }
 * ```
 */
export class SessionLockManager {
  private static instance: SessionLockManager | null = null;
  
  private locks: Map<string, SessionLock> = new Map();
  private waiters: Map<string, LockWaiter[]> = new Map();
  private config: SessionLockConfig;
  
  private constructor(config: Partial<SessionLockConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<SessionLockConfig>): SessionLockManager {
    if (!SessionLockManager.instance) {
      SessionLockManager.instance = new SessionLockManager(config);
    }
    return SessionLockManager.instance;
  }
  
  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    if (SessionLockManager.instance) {
      SessionLockManager.instance.releaseAll();
      SessionLockManager.instance = null;
    }
  }
  
  /**
   * Acquire a lock for a session
   * 
   * @param sessionId - Session to lock
   * @param runId - Optional run ID (generated if not provided)
   * @returns Lock result with success status and lock details
   */
  async acquire(
    sessionId: string,
    runId?: string
  ): Promise<LockResult> {
    const actualRunId = runId || randomUUID();
    const startTime = Date.now();
    
    // Check for existing lock
    const existing = this.locks.get(sessionId);
    
    if (existing) {
      // Check if lock has expired
      if (existing.expiresAt <= new Date()) {
        // Lock expired, remove it
        this.locks.delete(sessionId);
      } else {
        // Lock is active, wait for release
        const released = await this.waitForRelease(
          sessionId,
          this.config.acquireTimeoutMs
        );
        
        if (!released) {
          return {
            success: false,
            error: `Timeout waiting for session lock: ${sessionId}`,
            waitedMs: Date.now() - startTime,
          };
        }
      }
    }
    
    // Double-check no one grabbed the lock while we waited
    if (this.locks.has(sessionId)) {
      return {
        success: false,
        error: `Session lock acquired by another run: ${sessionId}`,
        waitedMs: Date.now() - startTime,
      };
    }
    
    // Acquire the lock
    const now = new Date();
    const lock: SessionLock = {
      sessionId,
      runId: actualRunId,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + this.config.lockTimeoutMs),
    };
    
    this.locks.set(sessionId, lock);
    
    return {
      success: true,
      lock,
      waitedMs: Date.now() - startTime,
    };
  }
  
  /**
   * Release a lock
   * 
   * @param sessionId - Session to unlock
   * @param runId - Run ID that holds the lock
   * @returns true if lock was released, false if not held or wrong runId
   */
  release(sessionId: string, runId: string): boolean {
    const lock = this.locks.get(sessionId);
    
    if (!lock) {
      return false;
    }
    
    if (lock.runId !== runId) {
      return false;
    }
    
    this.locks.delete(sessionId);
    
    // Notify waiters
    this.notifyWaiters(sessionId);
    
    return true;
  }
  
  /**
   * Force release a lock (for cleanup/recovery)
   * 
   * @param sessionId - Session to unlock
   * @returns true if a lock was released
   */
  forceRelease(sessionId: string): boolean {
    const had = this.locks.has(sessionId);
    this.locks.delete(sessionId);
    
    if (had) {
      this.notifyWaiters(sessionId);
    }
    
    return had;
  }
  
  /**
   * Release all locks (for shutdown/testing)
   */
  releaseAll(): void {
    const sessionIds = Array.from(this.locks.keys());
    this.locks.clear();
    
    for (const sessionId of sessionIds) {
      this.notifyWaiters(sessionId);
    }
  }
  
  /**
   * Check if a session is locked
   */
  isLocked(sessionId: string): boolean {
    const lock = this.locks.get(sessionId);
    if (!lock) return false;
    
    // Check expiration
    if (lock.expiresAt <= new Date()) {
      this.locks.delete(sessionId);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get lock info for a session
   */
  getLock(sessionId: string): SessionLock | null {
    const lock = this.locks.get(sessionId);
    if (!lock) return null;
    
    // Check expiration
    if (lock.expiresAt <= new Date()) {
      this.locks.delete(sessionId);
      return null;
    }
    
    return { ...lock };
  }
  
  /**
   * Get all active locks (for diagnostics)
   */
  getActiveLocks(): SessionLock[] {
    const now = new Date();
    const active: SessionLock[] = [];
    
    for (const [sessionId, lock] of this.locks) {
      if (lock.expiresAt > now) {
        active.push({ ...lock });
      } else {
        // Clean up expired
        this.locks.delete(sessionId);
      }
    }
    
    return active;
  }
  
  /**
   * Extend a lock's expiration
   * 
   * @param sessionId - Session with the lock
   * @param runId - Run ID that holds the lock
   * @param additionalMs - Additional time in ms
   * @returns Updated lock or null if not held
   */
  extend(
    sessionId: string,
    runId: string,
    additionalMs?: number
  ): SessionLock | null {
    const lock = this.locks.get(sessionId);
    
    if (!lock || lock.runId !== runId) {
      return null;
    }
    
    const extension = additionalMs || this.config.lockTimeoutMs;
    lock.expiresAt = new Date(Date.now() + extension);
    
    return { ...lock };
  }
  
  /**
   * Wait for a lock to be released
   */
  private waitForRelease(
    sessionId: string,
    timeoutMs: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        // Remove this waiter on timeout
        const waiters = this.waiters.get(sessionId) || [];
        const index = waiters.findIndex(w => w.timeoutId === timeoutId);
        if (index !== -1) {
          waiters.splice(index, 1);
        }
        resolve(false);
      }, timeoutMs);
      
      const waiter: LockWaiter = { resolve, timeoutId };
      
      const waiters = this.waiters.get(sessionId) || [];
      waiters.push(waiter);
      this.waiters.set(sessionId, waiters);
    });
  }
  
  /**
   * Notify all waiters that a lock was released
   */
  private notifyWaiters(sessionId: string): void {
    const waiters = this.waiters.get(sessionId) || [];
    this.waiters.delete(sessionId);
    
    for (const waiter of waiters) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve(true);
    }
  }
  
  /**
   * Clean up expired locks (call periodically if needed)
   */
  cleanupExpired(): number {
    const now = new Date();
    let cleaned = 0;
    
    for (const [sessionId, lock] of this.locks) {
      if (lock.expiresAt <= now) {
        this.locks.delete(sessionId);
        this.notifyWaiters(sessionId);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

/**
 * Convenience function to acquire a lock
 */
export async function acquireSessionLock(
  sessionId: string,
  runId?: string
): Promise<LockResult> {
  return SessionLockManager.getInstance().acquire(sessionId, runId);
}

/**
 * Convenience function to release a lock
 */
export function releaseSessionLock(
  sessionId: string,
  runId: string
): boolean {
  return SessionLockManager.getInstance().release(sessionId, runId);
}

/**
 * Execute a function with a session lock
 * Automatically releases the lock when done (even on error)
 * 
 * @param sessionId - Session to lock
 * @param fn - Function to execute while holding the lock
 * @returns Result of the function
 * @throws If lock cannot be acquired or function throws
 */
export async function withSessionLock<T>(
  sessionId: string,
  fn: (lock: SessionLock) => Promise<T>
): Promise<T> {
  const result = await acquireSessionLock(sessionId);
  
  if (!result.success || !result.lock) {
    throw new Error(result.error || 'Failed to acquire session lock');
  }
  
  try {
    return await fn(result.lock);
  } finally {
    releaseSessionLock(sessionId, result.lock.runId);
  }
}
