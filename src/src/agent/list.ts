/**
 * Agent list and status commands
 * Lists all registered agents with their status information
 */

import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative } from 'path';
import { loadAgentDefinition } from './parser.js';

/**
 * Agent status information
 */
export interface AgentStatus {
  id: string;
  name: string;
  type: 'admin' | 'project' | 'skill';
  scope: string;
  path: string;
  lastActive: string | null;
  sessionCount: number;
  hasMemory: boolean;
  hasContext: boolean;
}

/**
 * Agent list options
 */
export interface ListAgentsOptions {
  type?: 'admin' | 'project' | 'skill';
  includeInactive?: boolean;
  sortBy?: 'name' | 'type' | 'lastActive';
}

/**
 * Get last active time from sessions
 */
async function getLastActiveTime(agentPath: string): Promise<string | null> {
  const sessionsFile = join(agentPath, 'sessions', 'sessions.json');
  
  if (!existsSync(sessionsFile)) {
    return null;
  }
  
  try {
    const content = await readFile(sessionsFile, 'utf-8');
    const data = JSON.parse(content);
    
    if (data.sessions && data.sessions.length > 0) {
      // Get most recent session
      const sorted = [...data.sessions].sort((a: { updated: string }, b: { updated: string }) => 
        b.updated.localeCompare(a.updated)
      );
      return sorted[0].updated;
    }
  } catch {
    // Ignore parse errors
  }
  
  return null;
}

/**
 * Get session count for agent
 */
async function getSessionCount(agentPath: string): Promise<number> {
  const sessionsFile = join(agentPath, 'sessions', 'sessions.json');
  
  if (!existsSync(sessionsFile)) {
    return 0;
  }
  
  try {
    const content = await readFile(sessionsFile, 'utf-8');
    const data = JSON.parse(content);
    return data.sessions?.length || 0;
  } catch {
    return 0;
  }
}

/**
 * Get agent status from path
 */
export async function getAgentStatus(agentPath: string): Promise<AgentStatus | null> {
  const agentMdPath = join(agentPath, 'AGENT.md');
  
  if (!existsSync(agentMdPath)) {
    return null;
  }
  
  const definition = await loadAgentDefinition(agentMdPath);
  if (!definition) {
    return null;
  }
  
  const lastActive = await getLastActiveTime(agentPath);
  const sessionCount = await getSessionCount(agentPath);
  const hasMemory = existsSync(join(agentPath, 'MEMORY.md'));
  const hasContext = existsSync(join(agentPath, 'CONTEXT.md'));
  
  return {
    id: definition.frontmatter.id,
    name: definition.frontmatter.name,
    type: definition.frontmatter.type,
    scope: definition.frontmatter.scope,
    path: agentPath,
    lastActive,
    sessionCount,
    hasMemory,
    hasContext,
  };
}

/**
 * Find all agent directories in vault
 */
export async function findAgentDirectories(vaultPath: string): Promise<string[]> {
  const agentPaths: string[] = [];
  
  // Check admin agent
  const adminPath = join(vaultPath, '40_Brain', 'agents', 'admin');
  if (existsSync(join(adminPath, 'AGENT.md'))) {
    agentPaths.push(adminPath);
  }
  
  // Check skill agents
  const skillsPath = join(vaultPath, '40_Brain', 'agents', 'skills');
  if (existsSync(skillsPath)) {
    try {
      const skillDirs = await readdir(skillsPath, { withFileTypes: true });
      for (const dir of skillDirs) {
        if (dir.isDirectory()) {
          const skillAgentPath = join(skillsPath, dir.name);
          if (existsSync(join(skillAgentPath, 'AGENT.md'))) {
            agentPaths.push(skillAgentPath);
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  
  // Check project agents
  const projectsPath = join(vaultPath, '30_Projects');
  if (existsSync(projectsPath)) {
    try {
      const projectDirs = await readdir(projectsPath, { withFileTypes: true });
      for (const dir of projectDirs) {
        if (dir.isDirectory()) {
          const projectAgentPath = join(projectsPath, dir.name, 'agent');
          if (existsSync(join(projectAgentPath, 'AGENT.md'))) {
            agentPaths.push(projectAgentPath);
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  
  return agentPaths;
}

/**
 * List all agents in vault
 */
export async function listAgents(
  vaultPath: string,
  options: ListAgentsOptions = {}
): Promise<AgentStatus[]> {
  const agentPaths = await findAgentDirectories(vaultPath);
  const agents: AgentStatus[] = [];
  
  for (const agentPath of agentPaths) {
    const status = await getAgentStatus(agentPath);
    if (status) {
      // Filter by type if specified
      if (options.type && status.type !== options.type) {
        continue;
      }
      
      // Filter inactive if specified
      if (!options.includeInactive && !status.lastActive && status.sessionCount === 0) {
        continue;
      }
      
      agents.push(status);
    }
  }
  
  // Sort results
  const sortBy = options.sortBy || 'name';
  agents.sort((a, b) => {
    switch (sortBy) {
      case 'type':
        return a.type.localeCompare(b.type);
      case 'lastActive':
        if (!a.lastActive && !b.lastActive) return 0;
        if (!a.lastActive) return 1;
        if (!b.lastActive) return -1;
        return b.lastActive.localeCompare(a.lastActive);
      case 'name':
      default:
        return a.name.localeCompare(b.name);
    }
  });
  
  return agents;
}

/**
 * Format relative time
 */
export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toISOString().split('T')[0];
}

/**
 * Format agent status for display
 */
export function formatAgentStatus(agent: AgentStatus, vaultPath?: string): string {
  const lines: string[] = [];
  
  const relativePath = vaultPath 
    ? relative(vaultPath, agent.path) 
    : agent.path;
  
  lines.push(`**${agent.name}** (${agent.id})`);
  lines.push(`  Type: ${agent.type}`);
  lines.push(`  Scope: ${agent.scope}`);
  lines.push(`  Path: ${relativePath}`);
  
  if (agent.lastActive) {
    lines.push(`  Last Active: ${formatRelativeTime(agent.lastActive)}`);
  } else {
    lines.push(`  Last Active: never`);
  }
  
  lines.push(`  Sessions: ${agent.sessionCount}`);
  
  const files = [];
  if (agent.hasMemory) files.push('MEMORY');
  if (agent.hasContext) files.push('CONTEXT');
  if (files.length > 0) {
    lines.push(`  Files: ${files.join(', ')}`);
  }
  
  return lines.join('\n');
}

/**
 * Format agent list as table
 */
export function formatAgentTable(agents: AgentStatus[]): string {
  if (agents.length === 0) {
    return 'No agents found.';
  }
  
  const lines: string[] = [];
  
  // Header
  lines.push('| Name | Type | Scope | Last Active | Sessions |');
  lines.push('|------|------|-------|-------------|----------|');
  
  // Rows
  for (const agent of agents) {
    const lastActive = agent.lastActive 
      ? formatRelativeTime(agent.lastActive) 
      : 'never';
    
    const scope = agent.scope.length > 25 
      ? agent.scope.slice(0, 22) + '...' 
      : agent.scope;
    
    lines.push(`| ${agent.name} | ${agent.type} | ${scope} | ${lastActive} | ${agent.sessionCount} |`);
  }
  
  return lines.join('\n');
}

/**
 * Format agent list as simple list
 */
export function formatAgentList(agents: AgentStatus[]): string {
  if (agents.length === 0) {
    return 'No agents found.';
  }
  
  const lines: string[] = [];
  
  for (const agent of agents) {
    const lastActive = agent.lastActive 
      ? formatRelativeTime(agent.lastActive) 
      : 'never';
    
    lines.push(`- **${agent.name}** [${agent.type}] - ${agent.sessionCount} sessions, last: ${lastActive}`);
  }
  
  return lines.join('\n');
}

/**
 * Get agent status by ID
 */
export async function getAgentStatusById(
  vaultPath: string,
  agentId: string
): Promise<AgentStatus | null> {
  const agents = await listAgents(vaultPath, { includeInactive: true });
  return agents.find(a => a.id === agentId) || null;
}

/**
 * Get agents by type
 */
export async function getAgentsByType(
  vaultPath: string,
  type: 'admin' | 'project' | 'skill'
): Promise<AgentStatus[]> {
  return listAgents(vaultPath, { type, includeInactive: true });
}

/**
 * Get agent summary statistics
 */
export async function getAgentStats(vaultPath: string): Promise<{
  total: number;
  byType: Record<string, number>;
  active: number;
  totalSessions: number;
}> {
  const agents = await listAgents(vaultPath, { includeInactive: true });
  
  const byType: Record<string, number> = {
    admin: 0,
    project: 0,
    skill: 0,
  };
  
  let active = 0;
  let totalSessions = 0;
  
  for (const agent of agents) {
    byType[agent.type]++;
    if (agent.lastActive || agent.sessionCount > 0) {
      active++;
    }
    totalSessions += agent.sessionCount;
  }
  
  return {
    total: agents.length,
    byType,
    active,
    totalSessions,
  };
}

/**
 * Format agent stats for display
 */
export function formatAgentStats(stats: {
  total: number;
  byType: Record<string, number>;
  active: number;
  totalSessions: number;
}): string {
  const lines: string[] = [];
  
  lines.push('# Agent Statistics');
  lines.push('');
  lines.push(`Total Agents: ${stats.total}`);
  lines.push(`Active: ${stats.active}`);
  lines.push(`Total Sessions: ${stats.totalSessions}`);
  lines.push('');
  lines.push('By Type:');
  lines.push(`- Admin: ${stats.byType.admin}`);
  lines.push(`- Project: ${stats.byType.project}`);
  lines.push(`- Skill: ${stats.byType.skill}`);
  
  return lines.join('\n');
}
