/**
 * Tests for session locking mechanism
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SessionLockManager,
  acquireSessionLock,
  releaseSessionLock,
  withSessionLock,
} from './session-lock.js';

describe('SessionLockManager', () => {
  beforeEach(() => {
    SessionLockManager.resetInstance();
  });

  afterEach(() => {
    SessionLockManager.resetInstance();
  });

  describe('acquire', () => {
    it('should acquire lock for unlocked session', async () => {
      const manager = SessionLockManager.getInstance();
      const result = await manager.acquire('session-1');

      expect(result.success).toBe(true);
      expect(result.lock).toBeDefined();
      expect(result.lock?.sessionId).toBe('session-1');
      expect(result.lock?.runId).toBeDefined();
      expect(result.lock?.acquiredAt).toBeInstanceOf(Date);
      expect(result.lock?.expiresAt).toBeInstanceOf(Date);
    });

    it('should use provided runId', async () => {
      const manager = SessionLockManager.getInstance();
      const result = await manager.acquire('session-1', 'my-run-id');

      expect(result.success).toBe(true);
      expect(result.lock?.runId).toBe('my-run-id');
    });

    it('should allow different sessions to be locked concurrently', async () => {
      const manager = SessionLockManager.getInstance();
      
      const result1 = await manager.acquire('session-1');
      const result2 = await manager.acquire('session-2');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should wait for lock release on same session', async () => {
      const manager = SessionLockManager.getInstance({
        acquireTimeoutMs: 1000,
      });

      const result1 = await manager.acquire('session-1', 'run-1');
      expect(result1.success).toBe(true);

      // Start second acquire (will wait)
      const acquirePromise = manager.acquire('session-1', 'run-2');

      // Release first lock after short delay
      setTimeout(() => {
        manager.release('session-1', 'run-1');
      }, 50);

      const result2 = await acquirePromise;
      expect(result2.success).toBe(true);
      expect(result2.lock?.runId).toBe('run-2');
      expect(result2.waitedMs).toBeGreaterThan(0);
    });

    it('should timeout if lock not released', async () => {
      const manager = SessionLockManager.getInstance({
        acquireTimeoutMs: 100,
      });

      await manager.acquire('session-1', 'run-1');
      const result = await manager.acquire('session-1', 'run-2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
      expect(result.waitedMs).toBeGreaterThanOrEqual(100);
    });

    it('should acquire lock after expiration', async () => {
      const manager = SessionLockManager.getInstance({
        lockTimeoutMs: 50,
        acquireTimeoutMs: 200,
      });

      await manager.acquire('session-1', 'run-1');
      
      // Wait for lock to expire
      await new Promise(r => setTimeout(r, 100));

      const result = await manager.acquire('session-1', 'run-2');
      expect(result.success).toBe(true);
      expect(result.lock?.runId).toBe('run-2');
    });
  });

  describe('release', () => {
    it('should release held lock', async () => {
      const manager = SessionLockManager.getInstance();
      const result = await manager.acquire('session-1', 'run-1');

      expect(manager.isLocked('session-1')).toBe(true);
      
      const released = manager.release('session-1', 'run-1');
      
      expect(released).toBe(true);
      expect(manager.isLocked('session-1')).toBe(false);
    });

    it('should not release with wrong runId', async () => {
      const manager = SessionLockManager.getInstance();
      await manager.acquire('session-1', 'run-1');

      const released = manager.release('session-1', 'wrong-run-id');
      
      expect(released).toBe(false);
      expect(manager.isLocked('session-1')).toBe(true);
    });

    it('should return false for non-existent lock', () => {
      const manager = SessionLockManager.getInstance();
      const released = manager.release('session-1', 'run-1');
      expect(released).toBe(false);
    });
  });

  describe('forceRelease', () => {
    it('should release lock regardless of runId', async () => {
      const manager = SessionLockManager.getInstance();
      await manager.acquire('session-1', 'run-1');

      const released = manager.forceRelease('session-1');
      
      expect(released).toBe(true);
      expect(manager.isLocked('session-1')).toBe(false);
    });
  });

  describe('isLocked', () => {
    it('should return true for locked session', async () => {
      const manager = SessionLockManager.getInstance();
      await manager.acquire('session-1');

      expect(manager.isLocked('session-1')).toBe(true);
    });

    it('should return false for unlocked session', () => {
      const manager = SessionLockManager.getInstance();
      expect(manager.isLocked('session-1')).toBe(false);
    });

    it('should return false for expired lock', async () => {
      const manager = SessionLockManager.getInstance({
        lockTimeoutMs: 50,
      });
      
      await manager.acquire('session-1');
      expect(manager.isLocked('session-1')).toBe(true);

      await new Promise(r => setTimeout(r, 100));
      expect(manager.isLocked('session-1')).toBe(false);
    });
  });

  describe('getLock', () => {
    it('should return lock info', async () => {
      const manager = SessionLockManager.getInstance();
      await manager.acquire('session-1', 'run-1');

      const lock = manager.getLock('session-1');
      
      expect(lock).not.toBeNull();
      expect(lock?.sessionId).toBe('session-1');
      expect(lock?.runId).toBe('run-1');
    });

    it('should return null for non-existent lock', () => {
      const manager = SessionLockManager.getInstance();
      expect(manager.getLock('session-1')).toBeNull();
    });
  });

  describe('getActiveLocks', () => {
    it('should return all active locks', async () => {
      const manager = SessionLockManager.getInstance();
      
      await manager.acquire('session-1', 'run-1');
      await manager.acquire('session-2', 'run-2');

      const locks = manager.getActiveLocks();
      
      expect(locks).toHaveLength(2);
      expect(locks.map(l => l.sessionId).sort()).toEqual(['session-1', 'session-2']);
    });

    it('should not include expired locks', async () => {
      const manager = SessionLockManager.getInstance({
        lockTimeoutMs: 50,
      });

      await manager.acquire('session-1');
      await new Promise(r => setTimeout(r, 100));

      const locks = manager.getActiveLocks();
      expect(locks).toHaveLength(0);
    });
  });

  describe('extend', () => {
    it('should extend lock expiration', async () => {
      const manager = SessionLockManager.getInstance({
        lockTimeoutMs: 100,
      });

      const result = await manager.acquire('session-1', 'run-1');
      const originalExpiry = result.lock!.expiresAt;

      await new Promise(r => setTimeout(r, 50));

      const extended = manager.extend('session-1', 'run-1', 200);
      
      expect(extended).not.toBeNull();
      expect(extended!.expiresAt.getTime()).toBeGreaterThan(originalExpiry.getTime());
    });

    it('should return null for wrong runId', async () => {
      const manager = SessionLockManager.getInstance();
      await manager.acquire('session-1', 'run-1');

      const extended = manager.extend('session-1', 'wrong-run-id');
      expect(extended).toBeNull();
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired locks', async () => {
      const manager = SessionLockManager.getInstance({
        lockTimeoutMs: 50,
      });

      await manager.acquire('session-1');
      await manager.acquire('session-2');

      await new Promise(r => setTimeout(r, 100));

      const cleaned = manager.cleanupExpired();
      
      expect(cleaned).toBe(2);
      expect(manager.getActiveLocks()).toHaveLength(0);
    });
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    SessionLockManager.resetInstance();
  });

  afterEach(() => {
    SessionLockManager.resetInstance();
  });

  describe('acquireSessionLock', () => {
    it('should acquire lock using singleton', async () => {
      const result = await acquireSessionLock('session-1');
      expect(result.success).toBe(true);
    });
  });

  describe('releaseSessionLock', () => {
    it('should release lock using singleton', async () => {
      const result = await acquireSessionLock('session-1', 'run-1');
      expect(result.success).toBe(true);

      const released = releaseSessionLock('session-1', 'run-1');
      expect(released).toBe(true);
    });
  });

  describe('withSessionLock', () => {
    it('should execute function with lock held', async () => {
      let lockHeld = false;

      await withSessionLock('session-1', async (lock) => {
        lockHeld = SessionLockManager.getInstance().isLocked('session-1');
        expect(lock.sessionId).toBe('session-1');
        return 'result';
      });

      expect(lockHeld).toBe(true);
      expect(SessionLockManager.getInstance().isLocked('session-1')).toBe(false);
    });

    it('should release lock on error', async () => {
      await expect(
        withSessionLock('session-1', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(SessionLockManager.getInstance().isLocked('session-1')).toBe(false);
    });

    it('should throw if lock cannot be acquired', async () => {
      const manager = SessionLockManager.getInstance({
        acquireTimeoutMs: 50,
      });

      await manager.acquire('session-1', 'blocking-run');

      await expect(
        withSessionLock('session-1', async () => 'result')
      ).rejects.toThrow('Timeout');
    });
  });
});
