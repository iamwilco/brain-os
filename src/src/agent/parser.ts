/**
 * Agent definition parser
 * Parses AGENT.md files with YAML frontmatter and markdown body
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename } from 'path';

/**
 * Agent type
 */
export type AgentType = 'admin' | 'project' | 'skill';

/**
 * Agent frontmatter schema
 */
export interface AgentFrontmatter {
  name: string;
  id: string;
  type: AgentType;
  scope: string;
  model?: string;
  created: string;
  updated: string;
  tags?: string[];
  capabilities?: string[];
}

/**
 * Parsed agent definition
 */
export interface AgentDefinition {
  frontmatter: AgentFrontmatter;
  instructions: string;
  sections: AgentSections;
  path: string;
}

/**
 * Agent sections extracted from markdown
 */
export interface AgentSections {
  identity?: string;
  capabilities?: string;
  guidelines?: string;
  tools?: string;
  communication?: string;
  other: Record<string, string>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse YAML frontmatter from markdown content
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  
  try {
    const frontmatter = parseSimpleYaml(match[1]);
    return { frontmatter, body: match[2] };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

/**
 * Simple YAML parser for frontmatter (handles basic key: value pairs and multi-line arrays)
 */
function parseSimpleYaml(yamlStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlStr.split('\n');
  
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Check if this is an array item (starts with "- ")
    if (trimmed.startsWith('- ') && currentKey && currentArray) {
      let item = trimmed.slice(2).trim();
      // Remove quotes if present
      if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
        item = item.slice(1, -1);
      }
      currentArray.push(item);
      continue;
    }
    
    // If we were building an array, save it
    if (currentKey && currentArray) {
      result[currentKey] = currentArray.length === 1 ? currentArray[0] : currentArray;
      currentKey = null;
      currentArray = null;
    }
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();
    
    // Check if this is the start of a multi-line array (empty value, next line starts with "- ")
    if (value === '' && i + 1 < lines.length && lines[i + 1].trim().startsWith('- ')) {
      currentKey = key;
      currentArray = [];
      continue;
    }
    
    // Remove quotes if present
    if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
      value = (value as string).slice(1, -1);
    } else if ((value as string).startsWith("'") && (value as string).endsWith("'")) {
      value = (value as string).slice(1, -1);
    }
    // Handle arrays (simple inline format)
    else if ((value as string).startsWith('[') && (value as string).endsWith(']')) {
      value = (value as string)
        .slice(1, -1)
        .split(',')
        .map(v => v.trim().replace(/^["']|["']$/g, ''));
    }
    // Handle booleans
    else if (value === 'true') {
      value = true;
    } else if (value === 'false') {
      value = false;
    }
    // Handle numbers
    else if (!isNaN(Number(value)) && value !== '') {
      value = Number(value);
    }
    
    result[key] = value;
  }
  
  // Don't forget to save any pending array
  if (currentKey && currentArray) {
    result[currentKey] = currentArray.length === 1 ? currentArray[0] : currentArray;
  }
  
  return result;
}

/**
 * Extract sections from markdown body
 */
export function extractSections(body: string): AgentSections {
  const sections: AgentSections = { other: {} };
  const sectionRegex = /^##\s+(.+)$/gm;
  
  const sectionMatches: Array<{ title: string; start: number }> = [];
  let match;
  
  while ((match = sectionRegex.exec(body)) !== null) {
    sectionMatches.push({
      title: match[1].toLowerCase().trim(),
      start: match.index + match[0].length,
    });
  }
  
  for (let i = 0; i < sectionMatches.length; i++) {
    const current = sectionMatches[i];
    const next = sectionMatches[i + 1];
    const end = next ? next.start - next.title.length - 4 : body.length;
    const content = body.slice(current.start, end).trim();
    
    const title = current.title;
    
    if (title.includes('identity')) {
      sections.identity = content;
    } else if (title.includes('capabilities') || title.includes('capability')) {
      sections.capabilities = content;
    } else if (title.includes('guidelines') || title.includes('behavioral')) {
      sections.guidelines = content;
    } else if (title.includes('tools') || title.includes('commands')) {
      sections.tools = content;
    } else if (title.includes('communication') || title.includes('protocol')) {
      sections.communication = content;
    } else {
      sections.other[title] = content;
    }
  }
  
  return sections;
}

/**
 * Validate agent frontmatter
 */
export function validateFrontmatter(frontmatter: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required fields
  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    errors.push('Missing or invalid "name" field');
  }
  
  if (!frontmatter.id || typeof frontmatter.id !== 'string') {
    errors.push('Missing or invalid "id" field');
  } else if (!frontmatter.id.toString().startsWith('agent_')) {
    warnings.push('Agent ID should start with "agent_"');
  }
  
  if (!frontmatter.type || !['admin', 'project', 'skill'].includes(frontmatter.type as string)) {
    errors.push('Missing or invalid "type" field (must be admin, project, or skill)');
  }
  
  if (!frontmatter.scope || typeof frontmatter.scope !== 'string') {
    errors.push('Missing or invalid "scope" field');
  }
  
  // Optional but recommended
  if (!frontmatter.created) {
    warnings.push('Missing "created" field');
  }
  
  if (!frontmatter.updated) {
    warnings.push('Missing "updated" field');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse agent definition from content
 */
export function parseAgentDefinition(
  content: string,
  filePath: string
): AgentDefinition | null {
  const { frontmatter, body } = parseFrontmatter(content);
  
  const validation = validateFrontmatter(frontmatter);
  if (!validation.valid) {
    console.warn(`Invalid agent definition at ${filePath}:`, validation.errors);
    return null;
  }
  
  const sections = extractSections(body);
  
  return {
    frontmatter: frontmatter as unknown as AgentFrontmatter,
    instructions: body,
    sections,
    path: filePath,
  };
}

/**
 * Load agent definition from file
 */
export async function loadAgentDefinition(
  agentPath: string
): Promise<AgentDefinition | null> {
  const agentMdPath = agentPath.endsWith('.md') 
    ? agentPath 
    : join(agentPath, 'AGENT.md');
  
  if (!existsSync(agentMdPath)) {
    return null;
  }
  
  try {
    const content = await readFile(agentMdPath, 'utf-8');
    return parseAgentDefinition(content, agentMdPath);
  } catch {
    return null;
  }
}

/**
 * Get agent ID from path
 */
export function getAgentIdFromPath(agentPath: string): string {
  const dir = agentPath.endsWith('.md') ? dirname(agentPath) : agentPath;
  const name = basename(dir);
  const parent = basename(dirname(dir));
  
  // Determine type from parent folder
  if (parent === 'admin') {
    return `agent_admin_${name}`;
  } else if (parent === 'skills') {
    return `agent_skill_${name}`;
  } else if (parent === 'agent') {
    // Project agent
    const projectName = basename(dirname(dirname(dir)));
    return `agent_project_${projectName}`;
  }
  
  return `agent_${name}`;
}

/**
 * Discover all agents in vault
 */
export async function discoverAgents(vaultPath: string): Promise<AgentDefinition[]> {
  const agents: AgentDefinition[] = [];
  const { readdir } = await import('fs/promises');
  
  // Check admin agent
  const adminPath = join(vaultPath, '40_Brain', 'agents', 'admin', 'AGENT.md');
  const adminAgent = await loadAgentDefinition(adminPath);
  if (adminAgent) {
    agents.push(adminAgent);
  }
  
  // Check skill agents
  const skillsPath = join(vaultPath, '40_Brain', 'agents', 'skills');
  if (existsSync(skillsPath)) {
    try {
      const skillDirs = await readdir(skillsPath, { withFileTypes: true });
      for (const dir of skillDirs) {
        if (dir.isDirectory()) {
          const skillAgent = await loadAgentDefinition(join(skillsPath, dir.name));
          if (skillAgent) {
            agents.push(skillAgent);
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  // Check project agents in 30_Projects
  const projectsPath = join(vaultPath, '30_Projects');
  if (existsSync(projectsPath)) {
    try {
      const projectDirs = await readdir(projectsPath, { withFileTypes: true });
      for (const dir of projectDirs) {
        if (dir.isDirectory()) {
          const projectAgentPath = join(projectsPath, dir.name, 'agent', 'AGENT.md');
          const projectAgent = await loadAgentDefinition(projectAgentPath);
          if (projectAgent) {
            agents.push(projectAgent);
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
  
  return agents;
}

/**
 * Get agent by ID
 */
export async function getAgentById(
  vaultPath: string,
  agentId: string
): Promise<AgentDefinition | null> {
  const agents = await discoverAgents(vaultPath);
  return agents.find(a => a.frontmatter.id === agentId) || null;
}
