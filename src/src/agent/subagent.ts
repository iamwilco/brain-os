/**
 * Subagent Spawning
 * 
 * Allows Admin agents to spawn Skill agents with context and receive results.
 */

import { parseAgentDefinition, type AgentDefinition } from './parser.js';
import { createSession } from './session.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadMemory, formatMemoryForContext } from './memory.js';
import {
  createRequest,
  createResponse,
  Operations,
  type RequestMessage,
  type ResponseMessage,
  type SpawnAgentPayload,
  type SpawnAgentResult,
} from './protocol.js';

/**
 * Load agent definition from path
 */
async function loadAgentDefinition(agentPath: string): Promise<AgentDefinition | null> {
  const agentFile = join(agentPath, 'AGENT.md');
  
  if (!existsSync(agentFile)) {
    return null;
  }
  
  try {
    const content = await readFile(agentFile, 'utf-8');
    return parseAgentDefinition(content, agentFile);
  } catch {
    return null;
  }
}

/**
 * Subagent spawn configuration
 */
export interface SpawnConfig {
  /** Maximum tokens for skill response */
  maxTokens?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Include parent memory in context */
  includeParentMemory?: boolean;
  /** Additional context to prepend */
  additionalContext?: string;
}

/**
 * Default spawn configuration
 */
export const DEFAULT_SPAWN_CONFIG: Required<SpawnConfig> = {
  maxTokens: 4000,
  timeout: 60000,
  includeParentMemory: false,
  additionalContext: '',
};

/**
 * Agent type for allowlist purposes
 */
export type AgentType = 'admin' | 'project' | 'skill';

/**
 * Spawn allowlist entry
 */
export interface AllowlistEntry {
  /** Agent ID or pattern (e.g., "admin", "project-*") */
  agentPattern: string;
  /** Agent type */
  agentType: AgentType;
  /** Skill IDs this agent can spawn (empty = none, ['*'] = all) */
  allowedSkills: string[];
}

/**
 * Spawn allowlist configuration
 */
export interface SpawnAllowlistConfig {
  /** Whether allowlist is enabled */
  enabled: boolean;
  /** Default behavior when agent not in list */
  defaultAllow: boolean;
  /** Allowlist entries */
  entries: AllowlistEntry[];
}

/**
 * Default allowlist configuration
 * Admin can spawn any skill, others cannot spawn by default
 */
export const DEFAULT_ALLOWLIST_CONFIG: SpawnAllowlistConfig = {
  enabled: true,
  defaultAllow: false,
  entries: [
    {
      agentPattern: 'admin',
      agentType: 'admin',
      allowedSkills: ['*'],
    },
    {
      agentPattern: 'wilco',
      agentType: 'admin',
      allowedSkills: ['*'],
    },
  ],
};

// Current allowlist configuration
let currentAllowlistConfig: SpawnAllowlistConfig = {
  ...DEFAULT_ALLOWLIST_CONFIG,
  entries: [...DEFAULT_ALLOWLIST_CONFIG.entries],
};

/**
 * Set the spawn allowlist configuration
 */
export function setAllowlistConfig(config: Partial<SpawnAllowlistConfig>): void {
  currentAllowlistConfig = { ...currentAllowlistConfig, ...config };
  if (config.entries) {
    currentAllowlistConfig.entries = [...config.entries];
  }
}

/**
 * Get the current allowlist configuration
 */
export function getAllowlistConfig(): SpawnAllowlistConfig {
  return { ...currentAllowlistConfig, entries: [...currentAllowlistConfig.entries] };
}

/**
 * Reset allowlist to default configuration
 */
export function resetAllowlistConfig(): void {
  currentAllowlistConfig = {
    ...DEFAULT_ALLOWLIST_CONFIG,
    entries: [...DEFAULT_ALLOWLIST_CONFIG.entries],
  };
}

/**
 * Add an entry to the allowlist
 */
export function addAllowlistEntry(entry: AllowlistEntry): void {
  currentAllowlistConfig.entries.push(entry);
}

/**
 * Remove an entry from the allowlist by agent pattern
 */
export function removeAllowlistEntry(agentPattern: string): boolean {
  const initialLength = currentAllowlistConfig.entries.length;
  currentAllowlistConfig.entries = currentAllowlistConfig.entries.filter(
    e => e.agentPattern !== agentPattern
  );
  return currentAllowlistConfig.entries.length < initialLength;
}

/**
 * Check if agent pattern matches agent ID
 */
export function matchesAgentPattern(agentId: string, pattern: string): boolean {
  // Exact match
  if (pattern === agentId) return true;
  
  // Wildcard match (e.g., "project-*" matches "project-brain")
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return agentId.startsWith(prefix);
  }
  
  return false;
}

/**
 * Check if an agent can spawn a specific skill
 */
export function canSpawnSkill(
  agentId: string,
  agentType: AgentType,
  skillId: string
): { allowed: boolean; reason?: string } {
  // If allowlist is disabled, allow all
  if (!currentAllowlistConfig.enabled) {
    return { allowed: true };
  }
  
  // Find matching allowlist entry - prioritize exact pattern match over type match
  let entry = currentAllowlistConfig.entries.find(
    e => matchesAgentPattern(agentId, e.agentPattern)
  );
  
  // Fall back to type match if no pattern match
  if (!entry) {
    entry = currentAllowlistConfig.entries.find(
      e => e.agentType === agentType
    );
  }
  
  // No entry found - use default behavior
  if (!entry) {
    if (currentAllowlistConfig.defaultAllow) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Agent "${agentId}" (${agentType}) is not in spawn allowlist`,
    };
  }
  
  // Check if skill is in allowed list
  if (entry.allowedSkills.includes('*')) {
    return { allowed: true };
  }
  
  if (entry.allowedSkills.includes(skillId)) {
    return { allowed: true };
  }
  
  return {
    allowed: false,
    reason: `Agent "${agentId}" is not allowed to spawn skill "${skillId}"`,
  };
}

/**
 * Spawn result
 */
export interface SpawnResult {
  success: boolean;
  result?: string;
  error?: string;
  tokensUsed?: number;
  duration?: number;
  skillId: string;
  sessionId?: string;
}

/**
 * Skill agent registry entry
 */
export interface SkillEntry {
  id: string;
  name: string;
  path: string;
  description: string;
  capabilities: string[];
}

/**
 * In-memory skill registry
 */
const skillRegistry = new Map<string, SkillEntry>();

/**
 * Register a skill agent
 */
export function registerSkill(entry: SkillEntry): void {
  skillRegistry.set(entry.id, entry);
}

/**
 * Unregister a skill agent
 */
export function unregisterSkill(skillId: string): boolean {
  return skillRegistry.delete(skillId);
}

/**
 * Get a registered skill
 */
export function getSkill(skillId: string): SkillEntry | undefined {
  return skillRegistry.get(skillId);
}

/**
 * List all registered skills
 */
export function listSkills(): SkillEntry[] {
  return Array.from(skillRegistry.values());
}

/**
 * Clear all registered skills (for testing)
 */
export function clearSkillRegistry(): void {
  skillRegistry.clear();
}

/**
 * Build context for skill agent
 */
export async function buildSkillContext(
  parentAgentPath: string,
  userContext: string,
  config: SpawnConfig = {}
): Promise<string> {
  const cfg = { ...DEFAULT_SPAWN_CONFIG, ...config };
  const parts: string[] = [];
  
  // Add additional context if provided
  if (cfg.additionalContext) {
    parts.push(cfg.additionalContext);
    parts.push('');
  }
  
  // Add parent memory if requested
  if (cfg.includeParentMemory) {
    const memory = await loadMemory(parentAgentPath);
    if (memory) {
      parts.push('## Parent Agent Memory');
      parts.push(formatMemoryForContext(memory));
      parts.push('');
    }
  }
  
  // Add user context
  parts.push('## Task Context');
  parts.push(userContext);
  
  return parts.join('\n');
}

/**
 * Skill executor function type
 * This is injected to allow different execution strategies
 */
export type SkillExecutor = (
  skillDef: AgentDefinition,
  context: string,
  config: SpawnConfig
) => Promise<{ result: string; tokensUsed?: number }>;

/**
 * Default skill executor (placeholder - requires LLM integration)
 */
export const defaultSkillExecutor: SkillExecutor = async (
  _skillDef,
  context,
  _config
) => {
  // This is a placeholder that returns the context
  // Real implementation would call the LLM with skill instructions
  return {
    result: `[Skill execution placeholder]\nContext received: ${context.slice(0, 200)}...`,
    tokensUsed: 0,
  };
};

// Current executor (can be swapped for testing or different LLM providers)
let currentExecutor: SkillExecutor = defaultSkillExecutor;

/**
 * Set the skill executor
 */
export function setSkillExecutor(executor: SkillExecutor): void {
  currentExecutor = executor;
}

/**
 * Reset to default executor
 */
export function resetSkillExecutor(): void {
  currentExecutor = defaultSkillExecutor;
}

/**
 * Spawn a skill agent and execute with context
 */
export async function spawnSkillAgent(
  parentAgentPath: string,
  skillId: string,
  userContext: string,
  config: SpawnConfig = {},
  callerAgentId?: string,
  callerAgentType?: AgentType
): Promise<SpawnResult> {
  const cfg = { ...DEFAULT_SPAWN_CONFIG, ...config };
  const startTime = Date.now();
  
  // Check allowlist if caller info provided
  if (callerAgentId && callerAgentType) {
    const allowCheck = canSpawnSkill(callerAgentId, callerAgentType, skillId);
    if (!allowCheck.allowed) {
      return {
        success: false,
        error: allowCheck.reason || 'Spawn not allowed',
        skillId,
      };
    }
  }
  
  // Look up skill in registry
  const skill = getSkill(skillId);
  if (!skill) {
    return {
      success: false,
      error: `Skill "${skillId}" not found in registry`,
      skillId,
    };
  }
  
  try {
    // Load skill agent definition
    const skillDef = await loadAgentDefinition(skill.path);
    if (!skillDef) {
      return {
        success: false,
        error: `Failed to load skill definition from ${skill.path}`,
        skillId,
      };
    }
    
    // Build context for skill
    const context = await buildSkillContext(parentAgentPath, userContext, cfg);
    
    // Create session for skill execution
    const session = await createSession(skill.path, skillId);
    
    // Execute skill
    const { result, tokensUsed } = await currentExecutor(skillDef, context, cfg);
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      result,
      tokensUsed,
      duration,
      skillId,
      sessionId: session.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      skillId,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Create a spawn request message
 */
export function createSpawnRequest(
  fromAgent: string,
  skillId: string,
  context: string,
  params?: Record<string, unknown>,
  maxTokens?: number
): RequestMessage<SpawnAgentPayload> {
  return createRequest(fromAgent, skillId, Operations.SPAWN_AGENT, {
    skillId,
    context,
    params,
    maxTokens,
  });
}

/**
 * Create a spawn response message
 */
export function createSpawnResponse(
  request: RequestMessage<SpawnAgentPayload>,
  skillId: string,
  result: SpawnResult
): ResponseMessage<SpawnAgentResult | null> {
  if (result.success) {
    return createResponse(
      skillId,
      request.from,
      request.correlationId!,
      true,
      {
        result: result.result!,
        tokensUsed: result.tokensUsed,
        duration: result.duration,
      }
    );
  } else {
    return createResponse(
      skillId,
      request.from,
      request.correlationId!,
      false,
      null,
      result.error
    );
  }
}

/**
 * Format spawn result for incorporation into parent response
 */
export function formatSpawnResult(result: SpawnResult): string {
  if (!result.success) {
    return `[Skill Error: ${result.error}]`;
  }
  
  const lines: string[] = [];
  lines.push(`--- Skill Result (${result.skillId}) ---`);
  lines.push(result.result || '');
  
  if (result.tokensUsed) {
    lines.push(`[Tokens: ${result.tokensUsed}]`);
  }
  
  if (result.duration) {
    lines.push(`[Duration: ${result.duration}ms]`);
  }
  
  lines.push('--- End Skill Result ---');
  
  return lines.join('\n');
}
