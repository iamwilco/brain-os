/**
 * INTAKE Stage - Agent Loop Stage 1
 * 
 * Validates input, resolves routing, acquires execution lock.
 * 
 * Required Outputs:
 * - runId: UUID - Unique execution identifier
 * - sessionId: UUID - Session identifier (new or existing)
 * - agentDef: AgentDefinition - Parsed AGENT.md
 * - lock: SessionLock - Exclusive session access
 */

import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import type { AgentDefinition } from '../parser.js';
import { loadAgentDefinition, discoverAgents } from '../parser.js';
import {
  createSession,
  getOrCreateSession,
  getSession,
  type SessionMetadata,
} from '../session.js';
import {
  acquireSessionLock,
  releaseSessionLock,
  type SessionLock,
  type LockResult,
} from '../session-lock.js';

/**
 * INTAKE stage input
 */
export interface IntakeInput {
  /** User message */
  message: string;
  /** Vault root path */
  vaultPath: string;
  /** Project ID (optional) */
  projectId?: string;
  /** Project root path relative to vault (optional, derived from project) */
  projectRootPath?: string;
  /** Agent path (optional, derived from project) */
  agentPath?: string;
  /** Agent ID (optional, alternative to agentPath) */
  agentId?: string;
  /** Session ID (optional, creates new if absent) */
  sessionId?: string;
  /** Force new session */
  newSession?: boolean;
}

/**
 * INTAKE stage output
 */
export interface IntakeOutput {
  /** Unique execution identifier */
  runId: string;
  /** Session identifier */
  sessionId: string;
  /** Session metadata */
  session: SessionMetadata;
  /** Parsed agent definition */
  agentDef: AgentDefinition;
  /** Agent directory path */
  agentPath: string;
  /** Session lock */
  lock: SessionLock;
}

/**
 * INTAKE stage error types
 */
export type IntakeErrorCode =
  | 'VALIDATION_ERROR'
  | 'AGENT_NOT_FOUND'
  | 'AGENT_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_TERMINATED'
  | 'LOCK_TIMEOUT'
  | 'LOCK_FAILED';

/**
 * INTAKE stage error
 */
export class IntakeError extends Error {
  constructor(
    public code: IntakeErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'IntakeError';
  }
}

/**
 * INTAKE stage configuration
 */
export interface IntakeConfig {
  /** Maximum message length in characters */
  maxMessageLength: number;
  /** Minimum message length in characters */
  minMessageLength: number;
}

const DEFAULT_CONFIG: IntakeConfig = {
  maxMessageLength: 100_000,
  minMessageLength: 1,
};

/**
 * Validate message input
 */
function validateMessage(message: string, config: IntakeConfig): void {
  if (typeof message !== 'string') {
    throw new IntakeError('VALIDATION_ERROR', 'Message must be a string');
  }

  const trimmed = message.trim();

  if (trimmed.length < config.minMessageLength) {
    throw new IntakeError('VALIDATION_ERROR', 'Message cannot be empty');
  }

  if (trimmed.length > config.maxMessageLength) {
    throw new IntakeError(
      'VALIDATION_ERROR',
      `Message exceeds maximum length of ${config.maxMessageLength} characters`,
      { length: trimmed.length, max: config.maxMessageLength }
    );
  }
}

/**
 * Resolve agent from input options
 */
async function resolveAgent(
  input: IntakeInput
): Promise<{ agent: AgentDefinition; agentPath: string }> {
  // Priority 1: Explicit agent path
  if (input.agentPath) {
    const agent = await loadAgentDefinition(input.agentPath);
    if (!agent) {
      throw new IntakeError('AGENT_NOT_FOUND', `Agent not found at path: ${input.agentPath}`);
    }
    return { agent, agentPath: input.agentPath };
  }

  // Priority 2: Project root path (derive agent path)
  if (input.projectRootPath) {
    const agentPath = join(input.vaultPath, input.projectRootPath, 'agent');
    const agent = await loadAgentDefinition(agentPath);
    if (!agent) {
      throw new IntakeError(
        'AGENT_NOT_FOUND',
        `No agent found for project at: ${input.projectRootPath}`
      );
    }
    return { agent, agentPath };
  }

  // Priority 3: Agent ID lookup
  if (input.agentId) {
    const agents = await discoverAgents(input.vaultPath);
    const agent = agents.find(a => a.frontmatter.id === input.agentId);
    if (!agent) {
      throw new IntakeError('AGENT_NOT_FOUND', `Agent not found with ID: ${input.agentId}`);
    }
    const agentPath = dirname(agent.path);
    return { agent, agentPath };
  }

  // Priority 4: Default to admin agent
  const agentPath = join(input.vaultPath, '40_Brain', 'agents', 'admin');
  const agent = await loadAgentDefinition(agentPath);
  if (!agent) {
    throw new IntakeError('AGENT_NOT_FOUND', 'Default admin agent not found');
  }
  return { agent, agentPath };
}

/**
 * Resolve or create session
 */
async function resolveSession(
  agentPath: string,
  agentId: string,
  sessionId?: string,
  newSession?: boolean
): Promise<SessionMetadata> {
  // Force new session
  if (newSession) {
    return createSession(agentPath, agentId);
  }

  // Resume existing session by ID
  if (sessionId) {
    const session = await getSession(agentPath, sessionId);
    if (!session) {
      throw new IntakeError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
    }
    if (session.status === 'completed' || session.status === 'abandoned') {
      throw new IntakeError(
        'SESSION_TERMINATED',
        `Session is ${session.status}: ${sessionId}`,
        { status: session.status }
      );
    }
    return session;
  }

  // Get or create active session
  return getOrCreateSession(agentPath, agentId);
}

/**
 * Execute INTAKE stage
 * 
 * Validates input, resolves agent and session, acquires lock.
 * 
 * @param input - Stage input
 * @param config - Optional configuration overrides
 * @returns Stage output with runId, session, agent, and lock
 * @throws IntakeError on validation, resolution, or lock failure
 */
export async function intake(
  input: IntakeInput,
  config: Partial<IntakeConfig> = {}
): Promise<IntakeOutput> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const runId = randomUUID();

  // Step 1: Validate message (before any resource acquisition)
  validateMessage(input.message, cfg);

  // Step 2: Resolve agent
  const { agent, agentPath } = await resolveAgent(input);

  // Validate agent has required frontmatter
  if (!agent.frontmatter.id) {
    throw new IntakeError('AGENT_INVALID', 'Agent missing required "id" in frontmatter');
  }
  if (!agent.frontmatter.name) {
    throw new IntakeError('AGENT_INVALID', 'Agent missing required "name" in frontmatter');
  }

  // Step 3: Resolve session
  const session = await resolveSession(
    agentPath,
    agent.frontmatter.id,
    input.sessionId,
    input.newSession
  );

  // Step 4: Acquire lock (validation passed, now acquire resources)
  let lockResult: LockResult;
  try {
    lockResult = await acquireSessionLock(session.id, runId);
  } catch (err) {
    throw new IntakeError(
      'LOCK_FAILED',
      `Failed to acquire session lock: ${err instanceof Error ? err.message : 'Unknown error'}`,
      { sessionId: session.id, runId }
    );
  }

  if (!lockResult.success || !lockResult.lock) {
    throw new IntakeError(
      'LOCK_TIMEOUT',
      lockResult.error || 'Failed to acquire session lock',
      { sessionId: session.id, runId, waitedMs: lockResult.waitedMs }
    );
  }

  return {
    runId,
    sessionId: session.id,
    session,
    agentDef: agent,
    agentPath,
    lock: lockResult.lock,
  };
}

/**
 * Release resources acquired during INTAKE
 * 
 * Call this if subsequent stages fail to ensure lock is released.
 */
export function releaseIntake(output: IntakeOutput): boolean {
  return releaseSessionLock(output.sessionId, output.lock.runId);
}

/**
 * Type guard to check if error is IntakeError
 */
export function isIntakeError(error: unknown): error is IntakeError {
  return error instanceof IntakeError;
}

/**
 * Map IntakeError code to HTTP status code
 */
export function intakeErrorToHttpStatus(code: IntakeErrorCode): number {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'AGENT_NOT_FOUND':
    case 'SESSION_NOT_FOUND':
      return 404;
    case 'AGENT_INVALID':
      return 400;
    case 'SESSION_TERMINATED':
      return 410; // Gone
    case 'LOCK_TIMEOUT':
      return 503;
    case 'LOCK_FAILED':
      return 500;
    default:
      return 500;
  }
}
