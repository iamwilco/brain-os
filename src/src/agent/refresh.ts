/**
 * Agent refresh command
 * Regenerates CONTEXT.md for agents using latest extractions
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { loadAgentDefinition } from './parser.js';
import { generateAgentContext, saveContext } from './context.js';
import { findAgentDirectories, getAgentStatus } from './list.js';
import type { DatabaseInstance } from '../db/connection.js';

/**
 * Refresh options
 */
export interface RefreshOptions {
  force?: boolean;
  verbose?: boolean;
  limit?: number;
}

/**
 * Refresh result
 */
export interface RefreshResult {
  agentId: string;
  agentPath: string;
  success: boolean;
  itemCount: number;
  error?: string;
  duration: number;
}

/**
 * Refresh summary
 */
export interface RefreshSummary {
  total: number;
  successful: number;
  failed: number;
  results: RefreshResult[];
  duration: number;
}

/**
 * Refresh context for a single agent
 */
export async function refreshAgentContext(
  db: DatabaseInstance,
  agentPath: string,
  options: RefreshOptions = {}
): Promise<RefreshResult> {
  const start = Date.now();
  const agentMdPath = join(agentPath, 'AGENT.md');
  
  // Load agent definition
  const definition = await loadAgentDefinition(agentMdPath);
  if (!definition) {
    return {
      agentId: 'unknown',
      agentPath,
      success: false,
      itemCount: 0,
      error: 'Failed to load agent definition',
      duration: Date.now() - start,
    };
  }
  
  const agentId = definition.frontmatter.id;
  const scope = definition.frontmatter.scope;
  
  try {
    // Generate new context from database
    const context = await generateAgentContext(agentPath, agentId, scope, db);
    
    // Save to CONTEXT.md
    await saveContext(agentPath, context);
    
    if (options.verbose) {
      console.log(`Refreshed ${agentId}: ${context.itemCount} items`);
    }
    
    return {
      agentId,
      agentPath,
      success: true,
      itemCount: context.itemCount,
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      agentId,
      agentPath,
      success: false,
      itemCount: 0,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

/**
 * Refresh context for agent by ID
 */
export async function refreshAgentById(
  db: DatabaseInstance,
  vaultPath: string,
  agentId: string,
  options: RefreshOptions = {}
): Promise<RefreshResult | null> {
  const agents = await findAgentDirectories(vaultPath);
  
  for (const agentPath of agents) {
    const status = await getAgentStatus(agentPath);
    if (status?.id === agentId) {
      return refreshAgentContext(db, agentPath, options);
    }
  }
  
  return null;
}

/**
 * Refresh context for all agents of a type
 */
export async function refreshAgentsByType(
  db: DatabaseInstance,
  vaultPath: string,
  type: 'admin' | 'project' | 'skill',
  options: RefreshOptions = {}
): Promise<RefreshSummary> {
  const start = Date.now();
  const agents = await findAgentDirectories(vaultPath);
  const results: RefreshResult[] = [];
  
  for (const agentPath of agents) {
    const status = await getAgentStatus(agentPath);
    if (status?.type === type) {
      const result = await refreshAgentContext(db, agentPath, options);
      results.push(result);
    }
  }
  
  return {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
    duration: Date.now() - start,
  };
}

/**
 * Refresh context for all agents in vault
 */
export async function refreshAllAgents(
  db: DatabaseInstance,
  vaultPath: string,
  options: RefreshOptions = {}
): Promise<RefreshSummary> {
  const start = Date.now();
  const agents = await findAgentDirectories(vaultPath);
  const results: RefreshResult[] = [];
  
  for (const agentPath of agents) {
    const result = await refreshAgentContext(db, agentPath, options);
    results.push(result);
  }
  
  return {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
    duration: Date.now() - start,
  };
}

/**
 * Check if agent context needs refresh
 */
export async function needsRefresh(
  agentPath: string,
  maxAgeMs: number = 24 * 60 * 60 * 1000 // 24 hours
): Promise<boolean> {
  const contextPath = join(agentPath, 'CONTEXT.md');
  
  // No context file = needs refresh
  if (!existsSync(contextPath)) {
    return true;
  }
  
  try {
    const { stat } = await import('fs/promises');
    const stats = await stat(contextPath);
    const age = Date.now() - stats.mtimeMs;
    return age > maxAgeMs;
  } catch {
    return true;
  }
}

/**
 * Refresh stale agent contexts
 */
export async function refreshStaleAgents(
  db: DatabaseInstance,
  vaultPath: string,
  maxAgeMs: number = 24 * 60 * 60 * 1000,
  options: RefreshOptions = {}
): Promise<RefreshSummary> {
  const start = Date.now();
  const agents = await findAgentDirectories(vaultPath);
  const results: RefreshResult[] = [];
  
  for (const agentPath of agents) {
    if (await needsRefresh(agentPath, maxAgeMs)) {
      const result = await refreshAgentContext(db, agentPath, options);
      results.push(result);
    }
  }
  
  return {
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
    duration: Date.now() - start,
  };
}

/**
 * Format refresh result for display
 */
export function formatRefreshResult(result: RefreshResult): string {
  if (result.success) {
    return `✓ ${result.agentId}: ${result.itemCount} items (${result.duration}ms)`;
  } else {
    return `✗ ${result.agentId}: ${result.error} (${result.duration}ms)`;
  }
}

/**
 * Format refresh summary for display
 */
export function formatRefreshSummary(summary: RefreshSummary): string {
  const lines: string[] = [];
  
  lines.push('# Agent Context Refresh');
  lines.push('');
  lines.push(`Total: ${summary.total}`);
  lines.push(`Successful: ${summary.successful}`);
  lines.push(`Failed: ${summary.failed}`);
  lines.push(`Duration: ${summary.duration}ms`);
  lines.push('');
  
  if (summary.results.length > 0) {
    lines.push('## Results');
    lines.push('');
    for (const result of summary.results) {
      lines.push(`- ${formatRefreshResult(result)}`);
    }
  }
  
  return lines.join('\n');
}
