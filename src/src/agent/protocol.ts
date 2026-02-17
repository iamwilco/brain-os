/**
 * Agent Message Protocol
 * 
 * Defines TypeScript interfaces and Zod schemas for inter-agent communication.
 * Supports request/response/notify message patterns.
 */

import { z } from 'zod';

/**
 * Message types for inter-agent communication
 */
export type MessageType = 'request' | 'response' | 'notify';

/**
 * Base agent message structure
 */
export interface AgentMessage<T = unknown> {
  /** Unique message ID */
  id: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID */
  to: string;
  /** Message type */
  type: MessageType;
  /** Message payload */
  payload: T;
  /** Correlation ID for request/response matching */
  correlationId?: string;
  /** Timestamp */
  timestamp: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Request message - expects a response
 */
export interface RequestMessage<T = unknown> extends AgentMessage<T> {
  type: 'request';
  /** Operation being requested */
  operation: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Response message - reply to a request
 */
export interface ResponseMessage<T = unknown> extends AgentMessage<T> {
  type: 'response';
  /** ID of the request this responds to */
  correlationId: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Notify message - fire and forget
 */
export interface NotifyMessage<T = unknown> extends AgentMessage<T> {
  type: 'notify';
  /** Event or notification type */
  event: string;
}

// ============================================================================
// Common Payload Schemas
// ============================================================================

/**
 * Spawn agent request payload
 */
export const SpawnAgentPayloadSchema = z.object({
  /** Skill agent ID to spawn */
  skillId: z.string(),
  /** Context to pass to the skill */
  context: z.string(),
  /** Optional parameters */
  params: z.record(z.unknown()).optional(),
  /** Maximum tokens for skill response */
  maxTokens: z.number().optional(),
});

export type SpawnAgentPayload = z.infer<typeof SpawnAgentPayloadSchema>;

/**
 * Spawn agent response payload
 */
export const SpawnAgentResultSchema = z.object({
  /** Result from the skill agent */
  result: z.string(),
  /** Token usage */
  tokensUsed: z.number().optional(),
  /** Execution duration in ms */
  duration: z.number().optional(),
});

export type SpawnAgentResult = z.infer<typeof SpawnAgentResultSchema>;

/**
 * Task delegation request payload
 */
export const DelegateTaskPayloadSchema = z.object({
  /** Task description */
  task: z.string(),
  /** Priority level */
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  /** Deadline if any */
  deadline: z.string().optional(),
  /** Additional context */
  context: z.record(z.unknown()).optional(),
});

export type DelegateTaskPayload = z.infer<typeof DelegateTaskPayloadSchema>;

/**
 * Task result payload
 */
export const TaskResultPayloadSchema = z.object({
  /** Task status */
  status: z.enum(['completed', 'failed', 'partial', 'cancelled']),
  /** Result data */
  result: z.unknown().optional(),
  /** Error if failed */
  error: z.string().optional(),
  /** Summary of work done */
  summary: z.string().optional(),
});

export type TaskResultPayload = z.infer<typeof TaskResultPayloadSchema>;

/**
 * Status query payload
 */
export const StatusQueryPayloadSchema = z.object({
  /** What to query status for */
  target: z.enum(['session', 'memory', 'tasks', 'system']),
  /** Optional filter */
  filter: z.record(z.unknown()).optional(),
});

export type StatusQueryPayload = z.infer<typeof StatusQueryPayloadSchema>;

/**
 * Status response payload
 */
export const StatusResponsePayloadSchema = z.object({
  /** Status value */
  status: z.string(),
  /** Additional details */
  details: z.record(z.unknown()).optional(),
  /** Timestamp of status */
  asOf: z.string(),
});

export type StatusResponsePayload = z.infer<typeof StatusResponsePayloadSchema>;

/**
 * Memory update notification payload
 */
export const MemoryUpdatePayloadSchema = z.object({
  /** Section updated */
  section: z.string(),
  /** Type of update */
  updateType: z.enum(['create', 'update', 'delete']),
  /** New content (for create/update) */
  content: z.string().optional(),
});

export type MemoryUpdatePayload = z.infer<typeof MemoryUpdatePayloadSchema>;

// ============================================================================
// Message Validation
// ============================================================================

/**
 * Base message schema
 */
export const AgentMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  type: z.enum(['request', 'response', 'notify']),
  payload: z.unknown(),
  correlationId: z.string().optional(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Request message schema
 */
export const RequestMessageSchema = AgentMessageSchema.extend({
  type: z.literal('request'),
  operation: z.string(),
  timeout: z.number().optional(),
});

/**
 * Response message schema
 */
export const ResponseMessageSchema = AgentMessageSchema.extend({
  type: z.literal('response'),
  correlationId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

/**
 * Notify message schema
 */
export const NotifyMessageSchema = AgentMessageSchema.extend({
  type: z.literal('notify'),
  event: z.string(),
});

/**
 * Validate an agent message
 */
export function validateMessage(message: unknown): {
  valid: boolean;
  message?: AgentMessage;
  error?: string;
} {
  const result = AgentMessageSchema.safeParse(message);
  
  if (!result.success) {
    return {
      valid: false,
      error: result.error.message,
    };
  }
  
  return {
    valid: true,
    message: result.data as AgentMessage,
  };
}

/**
 * Validate a request message
 */
export function validateRequest(message: unknown): {
  valid: boolean;
  message?: RequestMessage;
  error?: string;
} {
  const result = RequestMessageSchema.safeParse(message);
  
  if (!result.success) {
    return {
      valid: false,
      error: result.error.message,
    };
  }
  
  return {
    valid: true,
    message: result.data as RequestMessage,
  };
}

/**
 * Validate a response message
 */
export function validateResponse(message: unknown): {
  valid: boolean;
  message?: ResponseMessage;
  error?: string;
} {
  const result = ResponseMessageSchema.safeParse(message);
  
  if (!result.success) {
    return {
      valid: false,
      error: result.error.message,
    };
  }
  
  return {
    valid: true,
    message: result.data as ResponseMessage,
  };
}

// ============================================================================
// Message Factory Functions
// ============================================================================

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Create a request message
 */
export function createRequest<T>(
  from: string,
  to: string,
  operation: string,
  payload: T,
  options: { timeout?: number; metadata?: Record<string, unknown> } = {}
): RequestMessage<T> {
  const id = generateMessageId();
  return {
    id,
    from,
    to,
    type: 'request',
    operation,
    payload,
    correlationId: id,
    timestamp: new Date().toISOString(),
    timeout: options.timeout,
    metadata: options.metadata,
  };
}

/**
 * Create a response message
 */
export function createResponse<T>(
  from: string,
  to: string,
  correlationId: string,
  success: boolean,
  payload: T,
  error?: string
): ResponseMessage<T> {
  return {
    id: generateMessageId(),
    from,
    to,
    type: 'response',
    correlationId,
    success,
    payload,
    error,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a notify message
 */
export function createNotify<T>(
  from: string,
  to: string,
  event: string,
  payload: T,
  metadata?: Record<string, unknown>
): NotifyMessage<T> {
  return {
    id: generateMessageId(),
    from,
    to,
    type: 'notify',
    event,
    payload,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

/**
 * Create a success response from a request
 */
export function successResponse<T>(
  request: RequestMessage,
  from: string,
  payload: T
): ResponseMessage<T> {
  return createResponse(from, request.from, request.correlationId!, true, payload);
}

/**
 * Create an error response from a request
 */
export function errorResponse(
  request: RequestMessage,
  from: string,
  error: string
): ResponseMessage<null> {
  return createResponse(from, request.from, request.correlationId!, false, null, error);
}

// ============================================================================
// Operation Constants
// ============================================================================

/**
 * Standard operations for inter-agent communication
 */
export const Operations = {
  /** Spawn a skill agent */
  SPAWN_AGENT: 'spawn_agent',
  /** Delegate a task */
  DELEGATE_TASK: 'delegate_task',
  /** Query status */
  QUERY_STATUS: 'query_status',
  /** Cancel operation */
  CANCEL: 'cancel',
  /** Ping for health check */
  PING: 'ping',
} as const;

/**
 * Standard events for notifications
 */
export const Events = {
  /** Agent started */
  AGENT_STARTED: 'agent:started',
  /** Agent completed */
  AGENT_COMPLETED: 'agent:completed',
  /** Agent failed */
  AGENT_FAILED: 'agent:failed',
  /** Memory updated */
  MEMORY_UPDATED: 'memory:updated',
  /** Task status changed */
  TASK_STATUS_CHANGED: 'task:status_changed',
} as const;
