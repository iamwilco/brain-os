/**
 * Tests for Agent Scheduler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCronField,
  parseCronExpression,
  matchesCron,
  getNextRunTime,
  AgentScheduler,
  createScheduler,
  CronPresets,
  type CronExpression,
  type ScheduledRunResult,
} from './scheduler.js';

describe('Agent Scheduler', () => {
  describe('parseCronField', () => {
    it('should parse wildcard', () => {
      const result = parseCronField('*', { min: 0, max: 59 });
      expect(result).toHaveLength(60);
      expect(result[0]).toBe(0);
      expect(result[59]).toBe(59);
    });

    it('should parse single value', () => {
      const result = parseCronField('5', { min: 0, max: 59 });
      expect(result).toEqual([5]);
    });

    it('should parse step values', () => {
      const result = parseCronField('*/15', { min: 0, max: 59 });
      expect(result).toEqual([0, 15, 30, 45]);
    });

    it('should parse range', () => {
      const result = parseCronField('1-5', { min: 0, max: 59 });
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should parse comma-separated values', () => {
      const result = parseCronField('1,3,5', { min: 0, max: 59 });
      expect(result).toEqual([1, 3, 5]);
    });

    it('should parse mixed values', () => {
      const result = parseCronField('1,5-7,10', { min: 0, max: 59 });
      expect(result).toEqual([1, 5, 6, 7, 10]);
    });

    it('should throw on invalid value', () => {
      expect(() => parseCronField('60', { min: 0, max: 59 })).toThrow();
    });

    it('should throw on invalid range', () => {
      expect(() => parseCronField('5-2', { min: 0, max: 59 })).toThrow();
    });
  });

  describe('parseCronExpression', () => {
    it('should parse valid cron expression', () => {
      const result = parseCronExpression('0 9 * * 1');
      expect(result.minute).toEqual([0]);
      expect(result.hour).toEqual([9]);
      expect(result.dayOfMonth).toHaveLength(31);
      expect(result.month).toHaveLength(12);
      expect(result.dayOfWeek).toEqual([1]);
    });

    it('should throw on invalid field count', () => {
      expect(() => parseCronExpression('0 9 *')).toThrow();
    });
  });

  describe('matchesCron', () => {
    it('should match when all fields match', () => {
      const cron = parseCronExpression('30 9 15 6 *');
      const date = new Date(2026, 5, 15, 9, 30); // June 15, 2026, 9:30
      expect(matchesCron(date, cron)).toBe(true);
    });

    it('should not match when minute differs', () => {
      const cron = parseCronExpression('30 9 * * *');
      const date = new Date(2026, 5, 15, 9, 31);
      expect(matchesCron(date, cron)).toBe(false);
    });

    it('should match wildcard fields', () => {
      const cron = parseCronExpression('* * * * *');
      const date = new Date();
      expect(matchesCron(date, cron)).toBe(true);
    });
  });

  describe('getNextRunTime', () => {
    it('should find next run time', () => {
      const cron = parseCronExpression('0 * * * *'); // Every hour at :00
      const from = new Date(2026, 0, 1, 10, 30); // Jan 1, 2026, 10:30
      const next = getNextRunTime(cron, from);
      
      expect(next.getHours()).toBe(11);
      expect(next.getMinutes()).toBe(0);
    });

    it('should handle day boundaries', () => {
      const cron = parseCronExpression('0 9 * * *'); // Every day at 9:00
      const from = new Date(2026, 0, 1, 10, 0); // Jan 1, 2026, 10:00
      const next = getNextRunTime(cron, from);
      
      expect(next.getDate()).toBe(2);
      expect(next.getHours()).toBe(9);
    });
  });

  describe('AgentScheduler', () => {
    let scheduler: AgentScheduler;

    beforeEach(() => {
      scheduler = createScheduler();
    });

    afterEach(() => {
      scheduler.stop();
    });

    describe('addSchedule', () => {
      it('should add a schedule entry', () => {
        const entry = scheduler.addSchedule('test-agent', '/path/to/agent', '0 9 * * *');
        
        expect(entry.agentId).toBe('test-agent');
        expect(entry.cron).toBe('0 9 * * *');
        expect(entry.enabled).toBe(true);
        expect(entry.nextRun).toBeDefined();
      });

      it('should emit schedule:added event', () => {
        const handler = vi.fn();
        scheduler.on('schedule:added', handler);
        
        scheduler.addSchedule('test-agent', '/path', '0 9 * * *');
        
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    describe('removeSchedule', () => {
      it('should remove a schedule entry', () => {
        const entry = scheduler.addSchedule('test-agent', '/path', '0 9 * * *');
        
        expect(scheduler.removeSchedule(entry.id)).toBe(true);
        expect(scheduler.getSchedule(entry.id)).toBeUndefined();
      });

      it('should return false for non-existent schedule', () => {
        expect(scheduler.removeSchedule('non-existent')).toBe(false);
      });
    });

    describe('setScheduleEnabled', () => {
      it('should enable/disable a schedule', () => {
        const entry = scheduler.addSchedule('test-agent', '/path', '0 9 * * *');
        
        scheduler.setScheduleEnabled(entry.id, false);
        expect(scheduler.getSchedule(entry.id)?.enabled).toBe(false);
        
        scheduler.setScheduleEnabled(entry.id, true);
        expect(scheduler.getSchedule(entry.id)?.enabled).toBe(true);
      });
    });

    describe('listSchedules', () => {
      it('should list all schedules', () => {
        scheduler.addSchedule('agent-1', '/path/1', '0 9 * * *');
        scheduler.addSchedule('agent-2', '/path/2', '0 10 * * *');
        
        const schedules = scheduler.listSchedules();
        expect(schedules).toHaveLength(2);
      });
    });

    describe('getAgentSchedules', () => {
      it('should filter schedules by agent', () => {
        scheduler.addSchedule('agent-1', '/path/1', '0 9 * * *');
        scheduler.addSchedule('agent-1', '/path/1', '0 10 * * *');
        scheduler.addSchedule('agent-2', '/path/2', '0 11 * * *');
        
        const schedules = scheduler.getAgentSchedules('agent-1');
        expect(schedules.length).toBeGreaterThanOrEqual(1);
        expect(schedules.every(s => s.agentId === 'agent-1')).toBe(true);
      });
    });

    describe('start/stop', () => {
      it('should start and stop the scheduler', () => {
        expect(scheduler.isRunning()).toBe(false);
        
        scheduler.start();
        expect(scheduler.isRunning()).toBe(true);
        
        scheduler.stop();
        expect(scheduler.isRunning()).toBe(false);
      });

      it('should emit events on start/stop', () => {
        const startHandler = vi.fn();
        const stopHandler = vi.fn();
        
        scheduler.on('scheduler:started', startHandler);
        scheduler.on('scheduler:stopped', stopHandler);
        
        scheduler.start();
        expect(startHandler).toHaveBeenCalledTimes(1);
        
        scheduler.stop();
        expect(stopHandler).toHaveBeenCalledTimes(1);
      });
    });

    describe('checkSchedules', () => {
      it('should run due schedules', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
          tokensUsed: 100,
        });
        
        const customScheduler = createScheduler({}, executor);
        
        // Add a schedule that matches current time
        const now = new Date();
        const cron = `${now.getMinutes()} ${now.getHours()} * * *`;
        customScheduler.addSchedule('test-agent', '/path', cron);
        
        await customScheduler.checkSchedules();
        
        expect(executor).toHaveBeenCalledTimes(1);
        customScheduler.stop();
      });

      it('should emit run events', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
        });
        
        const customScheduler = createScheduler({}, executor);
        const startHandler = vi.fn();
        const endHandler = vi.fn();
        
        customScheduler.on('run:start', startHandler);
        customScheduler.on('run:end', endHandler);
        
        const now = new Date();
        const cron = `${now.getMinutes()} ${now.getHours()} * * *`;
        customScheduler.addSchedule('test-agent', '/path', cron);
        
        await customScheduler.checkSchedules();
        
        // Wait for async execution
        await new Promise(resolve => setTimeout(resolve, 10));
        
        expect(startHandler).toHaveBeenCalledTimes(1);
        expect(endHandler).toHaveBeenCalledTimes(1);
        customScheduler.stop();
      });
    });

    describe('getStats', () => {
      it('should return scheduler stats', () => {
        scheduler.addSchedule('agent-1', '/path/1', '0 9 * * *');
        scheduler.addSchedule('agent-2', '/path/2', '0 10 * * *', { enabled: false });
        
        const stats = scheduler.getStats();
        
        expect(stats.totalSchedules).toBe(2);
        expect(stats.enabledSchedules).toBe(1);
        expect(stats.runningCount).toBe(0);
      });
    });

    describe('run history', () => {
      it('should track run history', async () => {
        const executor = vi.fn().mockResolvedValue({
          sessionId: 'test-session',
          success: true,
        });
        
        const customScheduler = createScheduler({}, executor);
        
        const now = new Date();
        const cron = `${now.getMinutes()} ${now.getHours()} * * *`;
        customScheduler.addSchedule('test-agent', '/path', cron);
        
        await customScheduler.checkSchedules();
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const history = customScheduler.getRunHistory();
        expect(history).toHaveLength(1);
        expect(history[0].success).toBe(true);
        
        customScheduler.clearRunHistory();
        expect(customScheduler.getRunHistory()).toHaveLength(0);
        customScheduler.stop();
      });
    });
  });

  describe('CronPresets', () => {
    it('should have valid presets', () => {
      expect(() => parseCronExpression(CronPresets.EVERY_MINUTE)).not.toThrow();
      expect(() => parseCronExpression(CronPresets.EVERY_HOUR)).not.toThrow();
      expect(() => parseCronExpression(CronPresets.DAILY_MIDNIGHT)).not.toThrow();
      expect(() => parseCronExpression(CronPresets.WEEKLY_MONDAY_9AM)).not.toThrow();
    });
  });
});
