/**
 * Agent spawn capability
 * Allows Admin agent to create and register new agents
 */

import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { generateAgentId, generateProjectAgentMd, generateSkillAgentMd, generateMemoryMd } from './templates.js';
import { findAgentDirectories, getAgentStatus } from './list.js';
import type { TemplateAgentType } from './templates.js';

/**
 * Spawn configuration
 */
export interface SpawnConfig {
  name: string;
  type: TemplateAgentType;
  description?: string;
  scope: string | string[];
  projectPath?: string;
  tags?: string[];
  capabilities?: string[];
  constraints?: string[];
}

/**
 * Spawn result
 */
export interface SpawnResult {
  success: boolean;
  agentId: string;
  agentPath: string;
  error?: string;
  duration: number;
}

/**
 * Agent registry entry
 */
export interface AgentRegistryEntry {
  id: string;
  name: string;
  type: TemplateAgentType;
  path: string;
  createdAt: string;
  createdBy: string;
  status: 'active' | 'inactive' | 'archived';
}

/**
 * Agent registry
 */
export interface AgentRegistry {
  version: string;
  agents: AgentRegistryEntry[];
  lastUpdated: string;
}

/**
 * Get registry path
 */
export function getRegistryPath(vaultPath: string): string {
  return join(vaultPath, '40_Brain', '.agent', 'registry.json');
}

/**
 * Load agent registry
 */
export async function loadRegistry(vaultPath: string): Promise<AgentRegistry> {
  const registryPath = getRegistryPath(vaultPath);
  
  if (!existsSync(registryPath)) {
    return {
      version: '1.0',
      agents: [],
      lastUpdated: new Date().toISOString(),
    };
  }
  
  try {
    const content = await readFile(registryPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      version: '1.0',
      agents: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save agent registry
 */
export async function saveRegistry(vaultPath: string, registry: AgentRegistry): Promise<void> {
  const registryPath = getRegistryPath(vaultPath);
  registry.lastUpdated = new Date().toISOString();
  
  // Ensure directory exists
  const dir = join(vaultPath, '40_Brain', '.agent');
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  
  await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
}

/**
 * Register agent in registry
 */
export async function registerAgent(
  vaultPath: string,
  entry: Omit<AgentRegistryEntry, 'createdAt' | 'status'>
): Promise<void> {
  const registry = await loadRegistry(vaultPath);
  
  // Check for duplicate
  const existing = registry.agents.find(a => a.id === entry.id);
  if (existing) {
    // Update existing
    Object.assign(existing, entry);
    existing.status = 'active';
  } else {
    // Add new
    registry.agents.push({
      ...entry,
      createdAt: new Date().toISOString(),
      status: 'active',
    });
  }
  
  await saveRegistry(vaultPath, registry);
}

/**
 * Unregister agent from registry
 */
export async function unregisterAgent(
  vaultPath: string,
  agentId: string
): Promise<boolean> {
  const registry = await loadRegistry(vaultPath);
  const agent = registry.agents.find(a => a.id === agentId);
  
  if (!agent) {
    return false;
  }
  
  agent.status = 'archived';
  await saveRegistry(vaultPath, registry);
  return true;
}

/**
 * Get agent path for spawn based on type
 */
export function getAgentSpawnPath(
  vaultPath: string,
  config: SpawnConfig
): string {
  switch (config.type) {
    case 'admin':
      return join(vaultPath, '40_Brain', 'agents', 'admin');
    case 'skill':
      const skillName = config.name.toLowerCase().replace(/\s+/g, '-');
      return join(vaultPath, '40_Brain', 'agents', 'skills', skillName);
    case 'project':
      if (config.projectPath) {
        return join(config.projectPath, 'agent');
      }
      const projectName = config.name.toLowerCase().replace(/\s+/g, '-');
      return join(vaultPath, '30_Projects', projectName, 'agent');
    default:
      throw new Error(`Unknown agent type: ${config.type}`);
  }
}

/**
 * Spawn new agent
 */
export async function spawnAgent(
  vaultPath: string,
  config: SpawnConfig,
  spawnedBy: string = 'agent_admin'
): Promise<SpawnResult> {
  const start = Date.now();
  const agentId = generateAgentId(config.name, config.type);
  
  try {
    // Get spawn path
    const agentPath = getAgentSpawnPath(vaultPath, config);
    
    // Check if already exists
    if (existsSync(join(agentPath, 'AGENT.md'))) {
      return {
        success: false,
        agentId,
        agentPath,
        error: `Agent already exists at ${agentPath}`,
        duration: Date.now() - start,
      };
    }
    
    // Create directory structure
    await mkdir(agentPath, { recursive: true });
    await mkdir(join(agentPath, 'sessions'), { recursive: true });
    
    // Normalize scope
    const scope = Array.isArray(config.scope) ? config.scope : [config.scope];
    
    // Generate AGENT.md based on type
    let agentMdContent: string;
    const agentOptions = {
      name: config.name,
      id: agentId,
      type: config.type,
      scope: scope.join(', '),
      description: config.description,
    };
    
    if (config.type === 'project') {
      agentMdContent = generateProjectAgentMd(agentOptions);
    } else {
      agentMdContent = generateSkillAgentMd(agentOptions);
    }
    await writeFile(join(agentPath, 'AGENT.md'), agentMdContent, 'utf-8');
    
    // Generate MEMORY.md
    const memoryContent = generateMemoryMd(agentId, config.name);
    await writeFile(join(agentPath, 'MEMORY.md'), memoryContent, 'utf-8');
    
    // Register agent
    await registerAgent(vaultPath, {
      id: agentId,
      name: config.name,
      type: config.type,
      path: agentPath,
      createdBy: spawnedBy,
    });
    
    return {
      success: true,
      agentId,
      agentPath,
      duration: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      agentId,
      agentPath: '',
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}

/**
 * Spawn project agent
 */
export async function spawnProjectAgent(
  vaultPath: string,
  projectName: string,
  projectPath: string,
  scope?: string[],
  spawnedBy: string = 'agent_admin'
): Promise<SpawnResult> {
  return spawnAgent(vaultPath, {
    name: projectName,
    type: 'project',
    description: `Agent for ${projectName} project`,
    scope: scope || [`${projectPath}/**/*`],
    projectPath,
  }, spawnedBy);
}

/**
 * Spawn skill agent
 */
export async function spawnSkillAgent(
  vaultPath: string,
  skillName: string,
  description: string,
  capabilities?: string[],
  spawnedBy: string = 'agent_admin'
): Promise<SpawnResult> {
  return spawnAgent(vaultPath, {
    name: skillName,
    type: 'skill',
    description,
    scope: '**/*',
    capabilities,
  }, spawnedBy);
}

/**
 * List registered agents
 */
export async function listRegisteredAgents(
  vaultPath: string,
  options: {
    type?: TemplateAgentType;
    status?: 'active' | 'inactive' | 'archived';
  } = {}
): Promise<AgentRegistryEntry[]> {
  const registry = await loadRegistry(vaultPath);
  let agents = registry.agents;
  
  if (options.type) {
    agents = agents.filter(a => a.type === options.type);
  }
  
  if (options.status) {
    agents = agents.filter(a => a.status === options.status);
  }
  
  return agents;
}

/**
 * Sync registry with filesystem
 */
export async function syncRegistry(vaultPath: string): Promise<{
  added: string[];
  removed: string[];
}> {
  const registry = await loadRegistry(vaultPath);
  const discoveredDirs = await findAgentDirectories(vaultPath);
  
  const added: string[] = [];
  const removed: string[] = [];
  
  // Find agents on filesystem not in registry
  for (const agentPath of discoveredDirs) {
    const status = await getAgentStatus(agentPath);
    if (status && !registry.agents.find(a => a.id === status.id)) {
      registry.agents.push({
        id: status.id,
        name: status.name || status.id,
        type: status.type as TemplateAgentType,
        path: agentPath,
        createdAt: new Date().toISOString(),
        createdBy: 'system',
        status: 'active',
      });
      added.push(status.id);
    }
  }
  
  // Mark agents in registry not on filesystem
  for (const entry of registry.agents) {
    if (!existsSync(join(entry.path, 'AGENT.md'))) {
      entry.status = 'archived';
      removed.push(entry.id);
    }
  }
  
  await saveRegistry(vaultPath, registry);
  
  return { added, removed };
}

/**
 * Format spawn result for display
 */
export function formatSpawnResult(result: SpawnResult): string {
  const lines: string[] = [];
  
  if (result.success) {
    lines.push(`✓ Agent spawned: ${result.agentId}`);
    lines.push(`  Path: ${result.agentPath}`);
    lines.push(`  Duration: ${result.duration}ms`);
  } else {
    lines.push(`✗ Spawn failed: ${result.error}`);
    lines.push(`  Duration: ${result.duration}ms`);
  }
  
  return lines.join('\n');
}

/**
 * Format registry for display
 */
export function formatRegistry(registry: AgentRegistry): string {
  const lines: string[] = [];
  
  lines.push('# Agent Registry');
  lines.push(`Version: ${registry.version}`);
  lines.push(`Last Updated: ${registry.lastUpdated}`);
  lines.push('');
  
  const active = registry.agents.filter(a => a.status === 'active');
  const archived = registry.agents.filter(a => a.status === 'archived');
  
  lines.push(`## Active Agents (${active.length})`);
  for (const agent of active) {
    lines.push(`- **${agent.name}** (\`${agent.id}\`) — ${agent.type}`);
  }
  
  if (archived.length > 0) {
    lines.push('');
    lines.push(`## Archived (${archived.length})`);
    for (const agent of archived) {
      lines.push(`- ~~${agent.name}~~ (\`${agent.id}\`)`);
    }
  }
  
  return lines.join('\n');
}
