/**
 * Agent Loop Events
 * 
 * Provides event emission for observability throughout the agent loop.
 * Events are emitted at each stage for monitoring, logging, and debugging.
 */

import { EventEmitter } from 'events';
import type { IntakeOutput } from './intake.js';
import type { ContextOutput } from './context.js';
import type { ExecuteOutput, ToolCall, ToolResult, TokenUsage } from './execute.js';
import type { PersistOutput } from './persist.js';

/**
 * Event types emitted by the agent loop
 */
export type LoopEventType =
  | 'loop:start'
  | 'loop:context'
  | 'loop:execute'
  | 'loop:persist'
  | 'loop:end'
  | 'loop:error'
  | 'tool:start'
  | 'tool:end'
  | 'llm:start'
  | 'llm:end'
  | 'memory:read'
  | 'memory:write'
  | 'memory:flush'
  | 'memory:compact';

/**
 * Base event data included in all events
 */
export interface BaseEventData {
  /** Unique run ID for this execution */
  runId: string;
  /** Session ID */
  sessionId: string;
  /** Agent ID */
  agentId: string;
  /** Timestamp of event */
  timestamp: Date;
}

/**
 * Event data for loop:start
 */
export interface LoopStartEvent extends BaseEventData {
  type: 'loop:start';
  message: string;
}

/**
 * Event data for loop:context
 */
export interface LoopContextEvent extends BaseEventData {
  type: 'loop:context';
  tokenEstimate: number;
  historyLength: number;
  needsCompaction: boolean;
  needsFlush: boolean;
}

/**
 * Event data for loop:execute
 */
export interface LoopExecuteEvent extends BaseEventData {
  type: 'loop:execute';
  toolCallCount: number;
  usage: TokenUsage;
}

/**
 * Event data for loop:persist
 */
export interface LoopPersistEvent extends BaseEventData {
  type: 'loop:persist';
  transcriptUpdated: boolean;
  sessionUpdated: boolean;
  memoryUpdated: boolean;
  lockReleased: boolean;
}

/**
 * Event data for loop:end
 */
export interface LoopEndEvent extends BaseEventData {
  type: 'loop:end';
  success: boolean;
  duration: number;
  usage: TokenUsage;
}

/**
 * Event data for loop:error
 */
export interface LoopErrorEvent extends BaseEventData {
  type: 'loop:error';
  stage: 'intake' | 'context' | 'execute' | 'persist';
  error: string;
  code?: string;
}

/**
 * Event data for tool:start
 */
export interface ToolStartEvent extends BaseEventData {
  type: 'tool:start';
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * Event data for tool:end
 */
export interface ToolEndEvent extends BaseEventData {
  type: 'tool:end';
  toolCallId: string;
  toolName: string;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Event data for llm:start
 */
export interface LLMStartEvent extends BaseEventData {
  type: 'llm:start';
  iteration: number;
}

/**
 * Event data for llm:end
 */
export interface LLMEndEvent extends BaseEventData {
  type: 'llm:end';
  iteration: number;
  hasToolCalls: boolean;
  usage?: TokenUsage;
}

/**
 * Event data for memory:read
 */
export interface MemoryReadEvent extends BaseEventData {
  type: 'memory:read';
  memoryPath: string;
  sectionCount: number;
  totalSize: number;
  success: boolean;
}

/**
 * Event data for memory:write
 */
export interface MemoryWriteEvent extends BaseEventData {
  type: 'memory:write';
  memoryPath: string;
  section: string;
  sizeUsed: number;
  sizeLimit: number;
  truncated: boolean;
  success: boolean;
}

/**
 * Event data for memory:flush
 */
export interface MemoryFlushEvent extends BaseEventData {
  type: 'memory:flush';
  reason: 'compaction_pending' | 'session_end' | 'manual' | 'threshold';
  updatesCount: number;
  noReply: boolean;
}

/**
 * Event data for memory:compact
 */
export interface MemoryCompactEvent extends BaseEventData {
  type: 'memory:compact';
  originalCount: number;
  compactedCount: number;
  tokensUsed: number;
  method: 'llm' | 'local';
}

/**
 * Union of all event types
 */
export type LoopEvent =
  | LoopStartEvent
  | LoopContextEvent
  | LoopExecuteEvent
  | LoopPersistEvent
  | LoopEndEvent
  | LoopErrorEvent
  | ToolStartEvent
  | ToolEndEvent
  | LLMStartEvent
  | LLMEndEvent
  | MemoryReadEvent
  | MemoryWriteEvent
  | MemoryFlushEvent
  | MemoryCompactEvent;

/**
 * Event handler function type
 */
export type LoopEventHandler<T extends LoopEvent = LoopEvent> = (event: T) => void;

/**
 * Global event emitter for agent loop events
 */
class LoopEventEmitter extends EventEmitter {
  private static instance: LoopEventEmitter;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): LoopEventEmitter {
    if (!LoopEventEmitter.instance) {
      LoopEventEmitter.instance = new LoopEventEmitter();
    }
    return LoopEventEmitter.instance;
  }

  /**
   * Emit a loop event
   */
  emitLoopEvent<T extends LoopEvent>(event: T): void {
    this.emit(event.type, event);
    this.emit('*', event); // Wildcard for all events
  }

  /**
   * Subscribe to a specific event type
   */
  onEvent<T extends LoopEvent>(
    type: T['type'] | '*',
    handler: LoopEventHandler<T>
  ): () => void {
    this.on(type, handler);
    return () => this.off(type, handler);
  }

  /**
   * Subscribe once to a specific event type
   */
  onceEvent<T extends LoopEvent>(
    type: T['type'],
    handler: LoopEventHandler<T>
  ): void {
    this.once(type, handler);
  }

  /**
   * Reset for testing
   */
  reset(): void {
    this.removeAllListeners();
  }
}

/**
 * Get the global event emitter instance
 */
export function getEventEmitter(): LoopEventEmitter {
  return LoopEventEmitter.getInstance();
}

/**
 * Helper to create base event data
 */
function createBaseEvent(
  runId: string,
  sessionId: string,
  agentId: string
): BaseEventData {
  return {
    runId,
    sessionId,
    agentId,
    timestamp: new Date(),
  };
}

/**
 * Emit loop:start event
 */
export function emitLoopStart(
  intake: IntakeOutput,
  message: string
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'loop:start',
    message,
  });
}

/**
 * Emit loop:context event
 */
export function emitLoopContext(
  intake: IntakeOutput,
  context: ContextOutput
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'loop:context',
    tokenEstimate: context.tokenEstimate,
    historyLength: context.history.length,
    needsCompaction: context.needsCompaction,
    needsFlush: context.needsFlush,
  });
}

/**
 * Emit loop:execute event
 */
export function emitLoopExecute(
  intake: IntakeOutput,
  execute: ExecuteOutput
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'loop:execute',
    toolCallCount: execute.toolCalls.length,
    usage: execute.usage,
  });
}

/**
 * Emit loop:persist event
 */
export function emitLoopPersist(
  intake: IntakeOutput,
  persist: PersistOutput
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'loop:persist',
    transcriptUpdated: persist.transcriptUpdated,
    sessionUpdated: persist.sessionUpdated,
    memoryUpdated: persist.memoryUpdated,
    lockReleased: persist.lockReleased,
  });
}

/**
 * Emit loop:end event
 */
export function emitLoopEnd(
  intake: IntakeOutput,
  success: boolean,
  startTime: number,
  usage: TokenUsage
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'loop:end',
    success,
    duration: Date.now() - startTime,
    usage,
  });
}

/**
 * Emit loop:error event
 */
export function emitLoopError(
  runId: string,
  sessionId: string,
  agentId: string,
  stage: 'intake' | 'context' | 'execute' | 'persist',
  error: Error | string,
  code?: string
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(runId, sessionId, agentId),
    type: 'loop:error',
    stage,
    error: error instanceof Error ? error.message : error,
    code,
  });
}

/**
 * Emit tool:start event
 */
export function emitToolStart(
  intake: IntakeOutput,
  toolCall: ToolCall
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'tool:start',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    arguments: toolCall.arguments,
  });
}

/**
 * Emit tool:end event
 */
export function emitToolEnd(
  intake: IntakeOutput,
  result: ToolResult
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'tool:end',
    toolCallId: result.toolCallId,
    toolName: result.name,
    duration: result.duration,
    success: !result.error,
    error: result.error,
  });
}

/**
 * Emit llm:start event
 */
export function emitLLMStart(
  intake: IntakeOutput,
  iteration: number
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'llm:start',
    iteration,
  });
}

/**
 * Emit llm:end event
 */
export function emitLLMEnd(
  intake: IntakeOutput,
  iteration: number,
  hasToolCalls: boolean,
  usage?: TokenUsage
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(intake.runId, intake.sessionId, intake.agentDef.frontmatter.id),
    type: 'llm:end',
    iteration,
    hasToolCalls,
    usage,
  });
}

/**
 * Emit memory:read event
 */
export function emitMemoryRead(
  runId: string,
  sessionId: string,
  agentId: string,
  memoryPath: string,
  sectionCount: number,
  totalSize: number,
  success: boolean
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(runId, sessionId, agentId),
    type: 'memory:read',
    memoryPath,
    sectionCount,
    totalSize,
    success,
  });
}

/**
 * Emit memory:write event
 */
export function emitMemoryWrite(
  runId: string,
  sessionId: string,
  agentId: string,
  memoryPath: string,
  section: string,
  sizeUsed: number,
  sizeLimit: number,
  truncated: boolean,
  success: boolean
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(runId, sessionId, agentId),
    type: 'memory:write',
    memoryPath,
    section,
    sizeUsed,
    sizeLimit,
    truncated,
    success,
  });
}

/**
 * Emit memory:flush event
 */
export function emitMemoryFlush(
  runId: string,
  sessionId: string,
  agentId: string,
  reason: 'compaction_pending' | 'session_end' | 'manual' | 'threshold',
  updatesCount: number,
  noReply: boolean
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(runId, sessionId, agentId),
    type: 'memory:flush',
    reason,
    updatesCount,
    noReply,
  });
}

/**
 * Emit memory:compact event
 */
export function emitMemoryCompact(
  runId: string,
  sessionId: string,
  agentId: string,
  originalCount: number,
  compactedCount: number,
  tokensUsed: number,
  method: 'llm' | 'local'
): void {
  const emitter = getEventEmitter();
  emitter.emitLoopEvent({
    ...createBaseEvent(runId, sessionId, agentId),
    type: 'memory:compact',
    originalCount,
    compactedCount,
    tokensUsed,
    method,
  });
}
