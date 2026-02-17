/**
 * Tests for Agent Triggers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildTriggerContext,
  matchesFilter,
  TriggerManager,
  createTriggerManager,
  TriggerEvents,
  type TriggerEvent,
  type TriggerFilter,
  type TriggerResult,
} from './triggers.js';

describe('Agent Triggers', () => {
  describe('buildTriggerContext', () => {
    it('should build default context', () => {
      const event: TriggerEvent = {
        type: 'file:created',
        timestamp: '2026-02-08T10:00:00Z',
        source: '/path/to/file.md',
        payload: { size: 1024 },
      };

      const context = buildTriggerContext(event);

      expect(context).toContain('file:created');
      expect(context).toContain('/path/to/file.md');
      expect(context).toContain('2026-02-08T10:00:00Z');
      expect(context).toContain('"size": 1024');
    });

    it('should use template when provided', () => {
      const event: TriggerEvent = {
        type: 'extraction:complete',
        timestamp: '2026-02-08T10:00:00Z',
        source: 'chatgpt-export',
        payload: { count: 50, collection: 'chatgpt' },
      };

      const template = 'Extraction {{type}} from {{source}}: {{payload.count}} items in {{payload.collection}}';
      const context = buildTriggerContext(event, template);

      expect(context).toBe('Extraction extraction:complete from chatgpt-export: 50 items in chatgpt');
    });
  });

  describe('matchesFilter', () => {
    const event: TriggerEvent = {
      type: 'file:created',
      timestamp: '2026-02-08T10:00:00Z',
      source: '/path/to/notes/file.md',
      payload: { extension: 'md', size: 1024 },
    };

    it('should match when no filter', () => {
      expect(matchesFilter(event, {})).toBe(true);
    });

    it('should match exact source', () => {
      const filter: TriggerFilter = { source: '/path/to/notes/file.md' };
      expect(matchesFilter(event, filter)).toBe(true);
    });

    it('should not match different source', () => {
      const filter: TriggerFilter = { source: '/other/path.md' };
      expect(matchesFilter(event, filter)).toBe(false);
    });

    it('should match regex source', () => {
      const filter: TriggerFilter = { source: /\/notes\// };
      expect(matchesFilter(event, filter)).toBe(true);
    });

    it('should match payload fields', () => {
      const filter: TriggerFilter = { payload: { extension: 'md' } };
      expect(matchesFilter(event, filter)).toBe(true);
    });

    it('should not match different payload', () => {
      const filter: TriggerFilter = { payload: { extension: 'txt' } };
      expect(matchesFilter(event, filter)).toBe(false);
    });

    it('should use custom filter function', () => {
      const filter: TriggerFilter = {
        custom: (e) => (e.payload.size as number) > 500,
      };
      expect(matchesFilter(event, filter)).toBe(true);
    });
  });

  describe('TriggerManager', () => {
    let manager: TriggerManager;

    beforeEach(() => {
      manager = createTriggerManager({ debounceMs: 0 });
    });

    afterEach(() => {
      manager.dispose();
    });

    describe('registerTrigger', () => {
      it('should register a trigger', () => {
        const trigger = manager.registerTrigger(
          'On file create',
          'file:created',
          'admin',
          '/path/to/agent'
        );

        expect(trigger.name).toBe('On file create');
        expect(trigger.eventType).toBe('file:created');
        expect(trigger.agentId).toBe('admin');
        expect(trigger.enabled).toBe(true);
      });

      it('should emit trigger:registered event', () => {
        const handler = vi.fn();
        manager.on('trigger:registered', handler);

        manager.registerTrigger('Test', 'file:created', 'admin', '/path');

        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    describe('unregisterTrigger', () => {
      it('should unregister a trigger', () => {
        const trigger = manager.registerTrigger('Test', 'file:created', 'admin', '/path');

        expect(manager.unregisterTrigger(trigger.id)).toBe(true);
        expect(manager.getTrigger(trigger.id)).toBeUndefined();
      });

      it('should return false for non-existent trigger', () => {
        expect(manager.unregisterTrigger('non-existent')).toBe(false);
      });
    });

    describe('setTriggerEnabled', () => {
      it('should enable/disable a trigger', () => {
        const trigger = manager.registerTrigger('Test', 'file:created', 'admin', '/path');

        manager.setTriggerEnabled(trigger.id, false);
        expect(manager.getTrigger(trigger.id)?.enabled).toBe(false);

        manager.setTriggerEnabled(trigger.id, true);
        expect(manager.getTrigger(trigger.id)?.enabled).toBe(true);
      });
    });

    describe('listTriggers', () => {
      it('should list all triggers', () => {
        manager.registerTrigger('Trigger 1', 'file:created', 'agent-1', '/path/1');
        manager.registerTrigger('Trigger 2', 'file:modified', 'agent-2', '/path/2');

        const triggers = manager.listTriggers();
        expect(triggers).toHaveLength(2);
      });
    });

    describe('getTriggersForEvent', () => {
      it('should filter triggers by event type', () => {
        manager.registerTrigger('T1', 'file:created', 'agent-1', '/path/1');
        manager.registerTrigger('T2', 'file:created', 'agent-2', '/path/2');
        manager.registerTrigger('T3', 'file:modified', 'agent-3', '/path/3');

        const triggers = manager.getTriggersForEvent('file:created');
        expect(triggers).toHaveLength(2);
      });

      it('should exclude disabled triggers', () => {
        const t1 = manager.registerTrigger('T1', 'file:created', 'agent-1', '/path/1');
        manager.registerTrigger('T2', 'file:created', 'agent-2', '/path/2');

        manager.setTriggerEnabled(t1.id, false);

        const triggers = manager.getTriggersForEvent('file:created');
        expect(triggers).toHaveLength(1);
      });
    });

    describe('fireEvent', () => {
      it('should execute matching triggers', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
        });

        const customManager = createTriggerManager({ debounceMs: 0 }, executor);
        customManager.registerTrigger('Test', 'file:created', 'admin', '/path');

        const results = await customManager.fireEvent({
          type: 'file:created',
          timestamp: new Date().toISOString(),
          source: '/test/file.md',
          payload: {},
        });

        expect(executor).toHaveBeenCalledTimes(1);
        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);

        customManager.dispose();
      });

      it('should respect filters', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
        });

        const customManager = createTriggerManager({ debounceMs: 0 }, executor);
        customManager.registerTrigger('Test', 'file:created', 'admin', '/path', {
          filter: { source: /\.md$/ },
        });

        // Should match
        await customManager.fireEvent({
          type: 'file:created',
          timestamp: new Date().toISOString(),
          source: '/test/file.md',
          payload: {},
        });

        // Should not match
        await customManager.fireEvent({
          type: 'file:created',
          timestamp: new Date().toISOString(),
          source: '/test/file.txt',
          payload: {},
        });

        expect(executor).toHaveBeenCalledTimes(1);

        customManager.dispose();
      });

      it('should emit trigger events', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
        });

        const customManager = createTriggerManager({ debounceMs: 0 }, executor);
        const startHandler = vi.fn();
        const endHandler = vi.fn();

        customManager.on('trigger:start', startHandler);
        customManager.on('trigger:end', endHandler);

        customManager.registerTrigger('Test', 'file:created', 'admin', '/path');

        await customManager.fireEvent({
          type: 'file:created',
          timestamp: new Date().toISOString(),
          source: '/test/file.md',
          payload: {},
        });

        expect(startHandler).toHaveBeenCalledTimes(1);
        expect(endHandler).toHaveBeenCalledTimes(1);

        customManager.dispose();
      });
    });

    describe('emit_event', () => {
      it('should create and fire event', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
        });

        const customManager = createTriggerManager({ debounceMs: 0 }, executor);
        customManager.registerTrigger('Test', 'extraction:complete', 'admin', '/path');

        const results = await customManager.emit_event(
          'extraction:complete',
          'chatgpt-export',
          { count: 50 }
        );

        expect(results).toHaveLength(1);
        expect(results[0].context).toContain('extraction:complete');

        customManager.dispose();
      });
    });

    describe('getStats', () => {
      it('should return trigger stats', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
        });

        const customManager = createTriggerManager({ debounceMs: 0 }, executor);
        customManager.registerTrigger('T1', 'file:created', 'agent-1', '/path/1');
        customManager.registerTrigger('T2', 'file:created', 'agent-2', '/path/2', { enabled: false });
        customManager.registerTrigger('T3', 'file:modified', 'agent-3', '/path/3');

        await customManager.emit_event('file:created', '/test.md', {});

        const stats = customManager.getStats();

        expect(stats.totalTriggers).toBe(3);
        expect(stats.enabledTriggers).toBe(2);
        expect(stats.totalExecutions).toBe(1);
        expect(stats.triggersByType['file:created']).toBe(2);

        customManager.dispose();
      });
    });

    describe('execution history', () => {
      it('should track execution history', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
        });

        const customManager = createTriggerManager({ debounceMs: 0 }, executor);
        customManager.registerTrigger('Test', 'file:created', 'admin', '/path');

        await customManager.emit_event('file:created', '/test.md', {});

        const history = customManager.getExecutionHistory();
        expect(history).toHaveLength(1);
        expect(history[0].success).toBe(true);

        customManager.clearExecutionHistory();
        expect(customManager.getExecutionHistory()).toHaveLength(0);

        customManager.dispose();
      });
    });
  });

  describe('TriggerEvents', () => {
    it('should have all event types', () => {
      expect(TriggerEvents.FILE_CREATED).toBe('file:created');
      expect(TriggerEvents.EXTRACTION_COMPLETE).toBe('extraction:complete');
      expect(TriggerEvents.SESSION_ENDED).toBe('session:ended');
      expect(TriggerEvents.CUSTOM).toBe('custom');
    });
  });
});
