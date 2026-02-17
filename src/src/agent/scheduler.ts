/**
 * Agent Scheduler
 * 
 * Allows agents to run on schedule using cron syntax.
 * Supports scheduled runs without user prompts.
 */

import { EventEmitter } from 'events';

/**
 * Cron field ranges
 */
const CRON_RANGES = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
};

/**
 * Parsed cron expression
 */
export interface CronExpression {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

/**
 * Schedule entry for an agent
 */
export interface ScheduleEntry {
  id: string;
  agentId: string;
  agentPath: string;
  cron: string;
  parsedCron: CronExpression;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Scheduled run result
 */
export interface ScheduledRunResult {
  scheduleId: string;
  agentId: string;
  startTime: string;
  endTime: string;
  success: boolean;
  sessionId?: string;
  error?: string;
  tokensUsed?: number;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Check interval in milliseconds */
  checkInterval: number;
  /** Maximum concurrent runs */
  maxConcurrent: number;
  /** Retry failed runs */
  retryOnFailure: boolean;
  /** Maximum retries */
  maxRetries: number;
  /** Log path for run results */
  logPath?: string;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  checkInterval: 60000, // 1 minute
  maxConcurrent: 3,
  retryOnFailure: true,
  maxRetries: 3,
  logPath: undefined,
};

/**
 * Parse a cron field (e.g., 0, *, 1-5, *\/15, 1,3,5)
 */
export function parseCronField(
  field: string,
  range: { min: number; max: number }
): number[] {
  const values: number[] = [];
  
  // Handle wildcard
  if (field === '*') {
    for (let i = range.min; i <= range.max; i++) {
      values.push(i);
    }
    return values;
  }
  
  // Handle step values (*/n)
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid step value: ${field}`);
    }
    for (let i = range.min; i <= range.max; i += step) {
      values.push(i);
    }
    return values;
  }
  
  // Handle comma-separated values and ranges
  const parts = field.split(',');
  for (const part of parts) {
    if (part.includes('-')) {
      // Range (e.g., "1-5")
      const [start, end] = part.split('-').map(n => parseInt(n, 10));
      if (isNaN(start) || isNaN(end) || start < range.min || end > range.max || start > end) {
        throw new Error(`Invalid range: ${part}`);
      }
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
    } else {
      // Single value
      const value = parseInt(part, 10);
      if (isNaN(value) || value < range.min || value > range.max) {
        throw new Error(`Invalid value: ${part}`);
      }
      values.push(value);
    }
  }
  
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Parse a cron expression (5 fields: minute hour dayOfMonth month dayOfWeek)
 */
export function parseCronExpression(cron: string): CronExpression {
  const fields = cron.trim().split(/\s+/);
  
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }
  
  return {
    minute: parseCronField(fields[0], CRON_RANGES.minute),
    hour: parseCronField(fields[1], CRON_RANGES.hour),
    dayOfMonth: parseCronField(fields[2], CRON_RANGES.dayOfMonth),
    month: parseCronField(fields[3], CRON_RANGES.month),
    dayOfWeek: parseCronField(fields[4], CRON_RANGES.dayOfWeek),
  };
}

/**
 * Check if a date matches a cron expression
 */
export function matchesCron(date: Date, cron: CronExpression): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // JavaScript months are 0-indexed
  const dayOfWeek = date.getDay();
  
  return (
    cron.minute.includes(minute) &&
    cron.hour.includes(hour) &&
    cron.dayOfMonth.includes(dayOfMonth) &&
    cron.month.includes(month) &&
    cron.dayOfWeek.includes(dayOfWeek)
  );
}

/**
 * Calculate next run time from a cron expression
 */
export function getNextRunTime(cron: CronExpression, from: Date = new Date()): Date {
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);
  
  // Search up to 1 year ahead
  const maxIterations = 525600; // minutes in a year
  
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(next, cron)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }
  
  throw new Error('Could not find next run time within 1 year');
}

/**
 * Agent executor function type for scheduled runs
 */
export type ScheduledAgentExecutor = (
  agentPath: string,
  agentId: string,
  context: string
) => Promise<{ sessionId: string; success: boolean; error?: string; tokensUsed?: number }>;

/**
 * Default executor (placeholder)
 */
export const defaultScheduledExecutor: ScheduledAgentExecutor = async (
  _agentPath,
  agentId,
  _context
) => {
  return {
    sessionId: `scheduled-${agentId}-${Date.now()}`,
    success: true,
    tokensUsed: 0,
  };
};

/**
 * Agent Scheduler class
 */
export class AgentScheduler extends EventEmitter {
  private schedules: Map<string, ScheduleEntry> = new Map();
  private config: SchedulerConfig;
  private executor: ScheduledAgentExecutor;
  private intervalId: NodeJS.Timeout | null = null;
  private runningCount = 0;
  private runHistory: ScheduledRunResult[] = [];

  constructor(
    config: Partial<SchedulerConfig> = {},
    executor: ScheduledAgentExecutor = defaultScheduledExecutor
  ) {
    super();
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.executor = executor;
  }

  /**
   * Add a schedule entry
   */
  addSchedule(
    agentId: string,
    agentPath: string,
    cron: string,
    options: { context?: string; metadata?: Record<string, unknown>; enabled?: boolean } = {}
  ): ScheduleEntry {
    const parsedCron = parseCronExpression(cron);
    const id = `schedule-${agentId}-${Date.now()}`;
    
    const entry: ScheduleEntry = {
      id,
      agentId,
      agentPath,
      cron,
      parsedCron,
      enabled: options.enabled ?? true,
      context: options.context,
      metadata: options.metadata,
      nextRun: getNextRunTime(parsedCron).toISOString(),
    };
    
    this.schedules.set(id, entry);
    this.emit('schedule:added', entry);
    
    return entry;
  }

  /**
   * Remove a schedule entry
   */
  removeSchedule(scheduleId: string): boolean {
    const entry = this.schedules.get(scheduleId);
    if (entry) {
      this.schedules.delete(scheduleId);
      this.emit('schedule:removed', entry);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable a schedule
   */
  setScheduleEnabled(scheduleId: string, enabled: boolean): boolean {
    const entry = this.schedules.get(scheduleId);
    if (entry) {
      entry.enabled = enabled;
      this.emit('schedule:updated', entry);
      return true;
    }
    return false;
  }

  /**
   * Get a schedule entry
   */
  getSchedule(scheduleId: string): ScheduleEntry | undefined {
    return this.schedules.get(scheduleId);
  }

  /**
   * List all schedules
   */
  listSchedules(): ScheduleEntry[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Get schedules for a specific agent
   */
  getAgentSchedules(agentId: string): ScheduleEntry[] {
    return this.listSchedules().filter(s => s.agentId === agentId);
  }

  /**
   * Check and run due schedules
   */
  async checkSchedules(): Promise<void> {
    const now = new Date();
    
    for (const entry of this.schedules.values()) {
      if (!entry.enabled) continue;
      if (this.runningCount >= this.config.maxConcurrent) break;
      
      if (matchesCron(now, entry.parsedCron)) {
        // Check if already run this minute
        if (entry.lastRun) {
          const lastRun = new Date(entry.lastRun);
          if (
            lastRun.getFullYear() === now.getFullYear() &&
            lastRun.getMonth() === now.getMonth() &&
            lastRun.getDate() === now.getDate() &&
            lastRun.getHours() === now.getHours() &&
            lastRun.getMinutes() === now.getMinutes()
          ) {
            continue;
          }
        }
        
        // Run the agent
        this.runScheduledAgent(entry);
      }
    }
  }

  /**
   * Run a scheduled agent
   */
  private async runScheduledAgent(entry: ScheduleEntry): Promise<void> {
    this.runningCount++;
    const startTime = new Date().toISOString();
    
    this.emit('run:start', { scheduleId: entry.id, agentId: entry.agentId, startTime });
    
    try {
      const result = await this.executor(
        entry.agentPath,
        entry.agentId,
        entry.context || `Scheduled run at ${startTime}`
      );
      
      const endTime = new Date().toISOString();
      const runResult: ScheduledRunResult = {
        scheduleId: entry.id,
        agentId: entry.agentId,
        startTime,
        endTime,
        success: result.success,
        sessionId: result.sessionId,
        error: result.error,
        tokensUsed: result.tokensUsed,
      };
      
      entry.lastRun = startTime;
      entry.nextRun = getNextRunTime(entry.parsedCron).toISOString();
      
      this.runHistory.push(runResult);
      this.emit('run:end', runResult);
      
      if (!result.success) {
        this.emit('run:error', { ...runResult, error: result.error });
      }
    } catch (error) {
      const endTime = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const runResult: ScheduledRunResult = {
        scheduleId: entry.id,
        agentId: entry.agentId,
        startTime,
        endTime,
        success: false,
        error: errorMessage,
      };
      
      entry.lastRun = startTime;
      entry.nextRun = getNextRunTime(entry.parsedCron).toISOString();
      
      this.runHistory.push(runResult);
      this.emit('run:error', runResult);
    } finally {
      this.runningCount--;
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this.checkSchedules();
    }, this.config.checkInterval);
    
    this.emit('scheduler:started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.emit('scheduler:stopped');
    }
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.intervalId !== null;
  }

  /**
   * Get run history
   */
  getRunHistory(limit?: number): ScheduledRunResult[] {
    if (limit) {
      return this.runHistory.slice(-limit);
    }
    return [...this.runHistory];
  }

  /**
   * Clear run history
   */
  clearRunHistory(): void {
    this.runHistory = [];
  }

  /**
   * Get scheduler stats
   */
  getStats(): {
    totalSchedules: number;
    enabledSchedules: number;
    runningCount: number;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
  } {
    const schedules = this.listSchedules();
    return {
      totalSchedules: schedules.length,
      enabledSchedules: schedules.filter(s => s.enabled).length,
      runningCount: this.runningCount,
      totalRuns: this.runHistory.length,
      successfulRuns: this.runHistory.filter(r => r.success).length,
      failedRuns: this.runHistory.filter(r => !r.success).length,
    };
  }
}

/**
 * Create a scheduler instance
 */
export function createScheduler(
  config?: Partial<SchedulerConfig>,
  executor?: ScheduledAgentExecutor
): AgentScheduler {
  return new AgentScheduler(config, executor);
}

/**
 * Common cron presets
 */
export const CronPresets = {
  /** Every minute */
  EVERY_MINUTE: '* * * * *',
  /** Every 5 minutes */
  EVERY_5_MINUTES: '*/5 * * * *',
  /** Every 15 minutes */
  EVERY_15_MINUTES: '*/15 * * * *',
  /** Every hour */
  EVERY_HOUR: '0 * * * *',
  /** Every day at midnight */
  DAILY_MIDNIGHT: '0 0 * * *',
  /** Every day at 9am */
  DAILY_9AM: '0 9 * * *',
  /** Every Monday at 9am */
  WEEKLY_MONDAY_9AM: '0 9 * * 1',
  /** First day of month at midnight */
  MONTHLY_FIRST: '0 0 1 * *',
} as const;
