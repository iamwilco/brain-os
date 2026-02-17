/**
 * Agent Triggers
 * 
 * Allows agents to run in response to events such as file uploads,
 * extraction completion, or custom events.
 */

import { EventEmitter } from 'events';

/**
 * Trigger event types
 */
export type TriggerEventType =
  | 'file:created'
  | 'file:modified'
  | 'file:deleted'
  | 'extraction:complete'
  | 'extraction:failed'
  | 'session:ended'
  | 'memory:updated'
  | 'task:completed'
  | 'custom';

/**
 * Trigger event data
 */
export interface TriggerEvent {
  type: TriggerEventType;
  timestamp: string;
  source: string;
  payload: Record<string, unknown>;
}

/**
 * Trigger definition
 */
export interface TriggerDefinition {
  id: string;
  name: string;
  eventType: TriggerEventType;
  agentId: string;
  agentPath: string;
  enabled: boolean;
  filter?: TriggerFilter;
  contextTemplate?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Trigger filter for conditional execution
 */
export interface TriggerFilter {
  /** Match specific source */
  source?: string | RegExp;
  /** Match payload fields */
  payload?: Record<string, unknown>;
  /** Custom filter function */
  custom?: (event: TriggerEvent) => boolean;
}

/**
 * Trigger execution result
 */
export interface TriggerResult {
  triggerId: string;
  eventType: TriggerEventType;
  agentId: string;
  startTime: string;
  endTime: string;
  success: boolean;
  sessionId?: string;
  error?: string;
  context: string;
}

/**
 * Trigger configuration
 */
export interface TriggerConfig {
  /** Maximum concurrent trigger executions */
  maxConcurrent: number;
  /** Debounce time in ms for rapid events */
  debounceMs: number;
  /** Log path for trigger results */
  logPath?: string;
}

/**
 * Default trigger configuration
 */
export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
  maxConcurrent: 5,
  debounceMs: 1000,
  logPath: undefined,
};

/**
 * Build context from trigger event
 */
export function buildTriggerContext(
  event: TriggerEvent,
  template?: string
): string {
  if (template) {
    // Simple template substitution
    let context = template;
    context = context.replace(/\{\{type\}\}/g, event.type);
    context = context.replace(/\{\{source\}\}/g, event.source);
    context = context.replace(/\{\{timestamp\}\}/g, event.timestamp);
    
    // Replace payload fields
    for (const [key, value] of Object.entries(event.payload)) {
      const placeholder = new RegExp(`\\{\\{payload\\.${key}\\}\\}`, 'g');
      context = context.replace(placeholder, String(value));
    }
    
    return context;
  }
  
  // Default context format
  const lines: string[] = [
    '## Trigger Event',
    '',
    `**Type:** ${event.type}`,
    `**Source:** ${event.source}`,
    `**Time:** ${event.timestamp}`,
    '',
    '### Payload',
    '```json',
    JSON.stringify(event.payload, null, 2),
    '```',
  ];
  
  return lines.join('\n');
}

/**
 * Check if event matches filter
 */
export function matchesFilter(event: TriggerEvent, filter: TriggerFilter): boolean {
  // Check source filter
  if (filter.source) {
    if (filter.source instanceof RegExp) {
      if (!filter.source.test(event.source)) return false;
    } else {
      if (event.source !== filter.source) return false;
    }
  }
  
  // Check payload filter
  if (filter.payload) {
    for (const [key, value] of Object.entries(filter.payload)) {
      if (event.payload[key] !== value) return false;
    }
  }
  
  // Check custom filter
  if (filter.custom) {
    if (!filter.custom(event)) return false;
  }
  
  return true;
}

/**
 * Agent executor function type for triggered runs
 */
export type TriggeredAgentExecutor = (
  agentPath: string,
  agentId: string,
  context: string
) => Promise<{ sessionId: string; success: boolean; error?: string }>;

/**
 * Default executor (placeholder)
 */
export const defaultTriggeredExecutor: TriggeredAgentExecutor = async (
  _agentPath,
  agentId,
  _context
) => {
  return {
    sessionId: `triggered-${agentId}-${Date.now()}`,
    success: true,
  };
};

/**
 * Trigger Manager class
 */
export class TriggerManager extends EventEmitter {
  private triggers: Map<string, TriggerDefinition> = new Map();
  private config: TriggerConfig;
  private executor: TriggeredAgentExecutor;
  private runningCount = 0;
  private executionHistory: TriggerResult[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    config: Partial<TriggerConfig> = {},
    executor: TriggeredAgentExecutor = defaultTriggeredExecutor
  ) {
    super();
    this.config = { ...DEFAULT_TRIGGER_CONFIG, ...config };
    this.executor = executor;
  }

  /**
   * Register a trigger
   */
  registerTrigger(
    name: string,
    eventType: TriggerEventType,
    agentId: string,
    agentPath: string,
    options: {
      filter?: TriggerFilter;
      contextTemplate?: string;
      metadata?: Record<string, unknown>;
      enabled?: boolean;
    } = {}
  ): TriggerDefinition {
    const id = `trigger-${eventType}-${agentId}-${Date.now()}`;
    
    const trigger: TriggerDefinition = {
      id,
      name,
      eventType,
      agentId,
      agentPath,
      enabled: options.enabled ?? true,
      filter: options.filter,
      contextTemplate: options.contextTemplate,
      metadata: options.metadata,
    };
    
    this.triggers.set(id, trigger);
    this.emit('trigger:registered', trigger);
    
    return trigger;
  }

  /**
   * Unregister a trigger
   */
  unregisterTrigger(triggerId: string): boolean {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      this.triggers.delete(triggerId);
      this.emit('trigger:unregistered', trigger);
      return true;
    }
    return false;
  }

  /**
   * Enable/disable a trigger
   */
  setTriggerEnabled(triggerId: string, enabled: boolean): boolean {
    const trigger = this.triggers.get(triggerId);
    if (trigger) {
      trigger.enabled = enabled;
      this.emit('trigger:updated', trigger);
      return true;
    }
    return false;
  }

  /**
   * Get a trigger definition
   */
  getTrigger(triggerId: string): TriggerDefinition | undefined {
    return this.triggers.get(triggerId);
  }

  /**
   * List all triggers
   */
  listTriggers(): TriggerDefinition[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Get triggers for a specific event type
   */
  getTriggersForEvent(eventType: TriggerEventType): TriggerDefinition[] {
    return this.listTriggers().filter(t => t.eventType === eventType && t.enabled);
  }

  /**
   * Get triggers for a specific agent
   */
  getAgentTriggers(agentId: string): TriggerDefinition[] {
    return this.listTriggers().filter(t => t.agentId === agentId);
  }

  /**
   * Fire an event and execute matching triggers
   */
  async fireEvent(event: TriggerEvent): Promise<TriggerResult[]> {
    const results: TriggerResult[] = [];
    const matchingTriggers = this.getTriggersForEvent(event.type);
    
    for (const trigger of matchingTriggers) {
      // Check filter
      if (trigger.filter && !matchesFilter(event, trigger.filter)) {
        continue;
      }
      
      // Check concurrency limit
      if (this.runningCount >= this.config.maxConcurrent) {
        this.emit('trigger:skipped', { trigger, reason: 'max_concurrent' });
        continue;
      }
      
      // Debounce check
      const debounceKey = `${trigger.id}-${event.source}`;
      if (this.debounceTimers.has(debounceKey)) {
        this.emit('trigger:skipped', { trigger, reason: 'debounced' });
        continue;
      }
      
      // Set debounce timer
      if (this.config.debounceMs > 0) {
        const timer = setTimeout(() => {
          this.debounceTimers.delete(debounceKey);
        }, this.config.debounceMs);
        this.debounceTimers.set(debounceKey, timer);
      }
      
      // Execute trigger
      const result = await this.executeTrigger(trigger, event);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Execute a single trigger
   */
  private async executeTrigger(
    trigger: TriggerDefinition,
    event: TriggerEvent
  ): Promise<TriggerResult> {
    this.runningCount++;
    const startTime = new Date().toISOString();
    const context = buildTriggerContext(event, trigger.contextTemplate);
    
    this.emit('trigger:start', {
      triggerId: trigger.id,
      agentId: trigger.agentId,
      eventType: event.type,
      startTime,
    });
    
    try {
      const result = await this.executor(
        trigger.agentPath,
        trigger.agentId,
        context
      );
      
      const endTime = new Date().toISOString();
      const triggerResult: TriggerResult = {
        triggerId: trigger.id,
        eventType: event.type,
        agentId: trigger.agentId,
        startTime,
        endTime,
        success: result.success,
        sessionId: result.sessionId,
        error: result.error,
        context,
      };
      
      this.executionHistory.push(triggerResult);
      this.emit('trigger:end', triggerResult);
      
      if (!result.success) {
        this.emit('trigger:error', triggerResult);
      }
      
      return triggerResult;
    } catch (error) {
      const endTime = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const triggerResult: TriggerResult = {
        triggerId: trigger.id,
        eventType: event.type,
        agentId: trigger.agentId,
        startTime,
        endTime,
        success: false,
        error: errorMessage,
        context,
      };
      
      this.executionHistory.push(triggerResult);
      this.emit('trigger:error', triggerResult);
      
      return triggerResult;
    } finally {
      this.runningCount--;
    }
  }

  /**
   * Create and fire a trigger event
   */
  async emit_event(
    type: TriggerEventType,
    source: string,
    payload: Record<string, unknown> = {}
  ): Promise<TriggerResult[]> {
    const event: TriggerEvent = {
      type,
      timestamp: new Date().toISOString(),
      source,
      payload,
    };
    
    return this.fireEvent(event);
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit?: number): TriggerResult[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Get trigger stats
   */
  getStats(): {
    totalTriggers: number;
    enabledTriggers: number;
    runningCount: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    triggersByType: Record<string, number>;
  } {
    const triggers = this.listTriggers();
    const triggersByType: Record<string, number> = {};
    
    for (const trigger of triggers) {
      triggersByType[trigger.eventType] = (triggersByType[trigger.eventType] || 0) + 1;
    }
    
    return {
      totalTriggers: triggers.length,
      enabledTriggers: triggers.filter(t => t.enabled).length,
      runningCount: this.runningCount,
      totalExecutions: this.executionHistory.length,
      successfulExecutions: this.executionHistory.filter(r => r.success).length,
      failedExecutions: this.executionHistory.filter(r => !r.success).length,
      triggersByType,
    };
  }

  /**
   * Clear all debounce timers
   */
  clearDebounceTimers(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Dispose of the trigger manager
   */
  dispose(): void {
    this.clearDebounceTimers();
    this.triggers.clear();
    this.removeAllListeners();
  }
}

/**
 * Create a trigger manager instance
 */
export function createTriggerManager(
  config?: Partial<TriggerConfig>,
  executor?: TriggeredAgentExecutor
): TriggerManager {
  return new TriggerManager(config, executor);
}

/**
 * Common trigger event types
 */
export const TriggerEvents = {
  FILE_CREATED: 'file:created' as TriggerEventType,
  FILE_MODIFIED: 'file:modified' as TriggerEventType,
  FILE_DELETED: 'file:deleted' as TriggerEventType,
  EXTRACTION_COMPLETE: 'extraction:complete' as TriggerEventType,
  EXTRACTION_FAILED: 'extraction:failed' as TriggerEventType,
  SESSION_ENDED: 'session:ended' as TriggerEventType,
  MEMORY_UPDATED: 'memory:updated' as TriggerEventType,
  TASK_COMPLETED: 'task:completed' as TriggerEventType,
  CUSTOM: 'custom' as TriggerEventType,
} as const;
