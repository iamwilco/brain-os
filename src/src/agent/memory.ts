/**
 * Agent memory module
 * Read/write MEMORY.md for persistent agent working memory
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Memory frontmatter
 */
export interface MemoryFrontmatter {
  type: string;
  agent: string;
  updated: string;
  version?: number;
}

/**
 * Memory section
 */
export interface MemorySection {
  title: string;
  content: string;
  level: number;
}

/**
 * Parsed memory document
 */
export interface AgentMemory {
  frontmatter: MemoryFrontmatter;
  sections: MemorySection[];
  raw: string;
}

/**
 * Memory update operation
 */
export interface MemoryUpdate {
  section: string;
  content: string;
  append?: boolean;
}

/**
 * Memory size limits
 */
export interface MemoryLimits {
  /** Maximum total memory size in characters */
  maxTotalSize: number;
  /** Maximum size per section in characters */
  maxSectionSize: number;
  /** Maximum number of sections */
  maxSections: number;
}

/**
 * Default memory limits
 */
export const DEFAULT_MEMORY_LIMITS: MemoryLimits = {
  maxTotalSize: 50_000,      // ~12,500 tokens
  maxSectionSize: 10_000,    // ~2,500 tokens per section
  maxSections: 20,
};

/**
 * Memory write result
 */
export interface MemoryWriteResult {
  success: boolean;
  section: string;
  error?: string;
  truncated?: boolean;
  sizeUsed?: number;
  sizeLimit?: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalSize: number;
  sectionCount: number;
  largestSection: { title: string; size: number } | null;
  withinLimits: boolean;
  usagePercent: number;
}

/**
 * Get memory file path for agent
 */
export function getMemoryPath(agentPath: string): string {
  return join(agentPath, 'MEMORY.md');
}

/**
 * Parse simple frontmatter (reusing logic from parser)
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  
  const result: Record<string, unknown> = {};
  const lines = match[1].split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();
    
    // Remove quotes
    if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
      value = (value as string).slice(1, -1);
    }
    // Handle numbers
    else if (!isNaN(Number(value)) && value !== '') {
      value = Number(value);
    }
    
    result[key] = value;
  }
  
  return { frontmatter: result, body: match[2] };
}

/**
 * Parse sections from markdown body
 */
function parseSections(body: string): MemorySection[] {
  const sections: MemorySection[] = [];
  const lines = body.split('\n');
  
  let currentSection: MemorySection | null = null;
  let currentContent: string[] = [];
  
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }
      
      currentSection = {
        title: headingMatch[2],
        content: '',
        level: headingMatch[1].length,
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Load agent memory from file
 */
export async function loadMemory(agentPath: string): Promise<AgentMemory | null> {
  const memoryPath = getMemoryPath(agentPath);
  
  if (!existsSync(memoryPath)) {
    return null;
  }
  
  try {
    const content = await readFile(memoryPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const sections = parseSections(body);
    
    return {
      frontmatter: frontmatter as unknown as MemoryFrontmatter,
      sections,
      raw: content,
    };
  } catch {
    return null;
  }
}

/**
 * Generate frontmatter string
 */
function generateFrontmatter(fm: MemoryFrontmatter): string {
  const lines = ['---'];
  lines.push(`type: ${fm.type}`);
  lines.push(`agent: ${fm.agent}`);
  lines.push(`updated: ${fm.updated}`);
  if (fm.version !== undefined) {
    lines.push(`version: ${fm.version}`);
  }
  lines.push('---');
  return lines.join('\n');
}

/**
 * Generate markdown from memory structure
 */
export function generateMemoryMarkdown(memory: AgentMemory): string {
  const lines: string[] = [];
  
  // Frontmatter
  lines.push(generateFrontmatter(memory.frontmatter));
  lines.push('');
  
  // Sections
  for (const section of memory.sections) {
    lines.push(`${'#'.repeat(section.level)} ${section.title}`);
    lines.push('');
    if (section.content) {
      lines.push(section.content);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Save agent memory to file
 */
export async function saveMemory(
  agentPath: string,
  memory: AgentMemory
): Promise<void> {
  const memoryPath = getMemoryPath(agentPath);
  
  // Update timestamp and version
  memory.frontmatter.updated = new Date().toISOString().split('T')[0];
  memory.frontmatter.version = (memory.frontmatter.version || 0) + 1;
  
  const content = generateMemoryMarkdown(memory);
  await writeFile(memoryPath, content, 'utf-8');
}

/**
 * Get a specific section from memory
 */
export function getSection(
  memory: AgentMemory,
  sectionTitle: string
): MemorySection | null {
  return memory.sections.find(
    s => s.title.toLowerCase() === sectionTitle.toLowerCase()
  ) || null;
}

/**
 * Update a section in memory
 */
export function updateSection(
  memory: AgentMemory,
  sectionTitle: string,
  newContent: string,
  append: boolean = false
): boolean {
  const section = memory.sections.find(
    s => s.title.toLowerCase() === sectionTitle.toLowerCase()
  );
  
  if (!section) {
    return false;
  }
  
  if (append) {
    section.content = section.content 
      ? `${section.content}\n${newContent}`
      : newContent;
  } else {
    section.content = newContent;
  }
  
  return true;
}

/**
 * Add a new section to memory
 */
export function addSection(
  memory: AgentMemory,
  title: string,
  content: string,
  level: number = 2
): void {
  memory.sections.push({ title, content, level });
}

/**
 * Remove a section from memory
 */
export function removeSection(
  memory: AgentMemory,
  sectionTitle: string
): boolean {
  const index = memory.sections.findIndex(
    s => s.title.toLowerCase() === sectionTitle.toLowerCase()
  );
  
  if (index === -1) {
    return false;
  }
  
  memory.sections.splice(index, 1);
  return true;
}

/**
 * Initialize empty memory for new agent
 */
export function createEmptyMemory(agentId: string): AgentMemory {
  return {
    frontmatter: {
      type: 'agent-memory',
      agent: agentId,
      updated: new Date().toISOString().split('T')[0],
      version: 1,
    },
    sections: [
      {
        title: 'Working Memory',
        content: '',
        level: 1,
      },
      {
        title: 'Current State',
        content: '- **Status:** Initialized',
        level: 2,
      },
      {
        title: 'Key Context',
        content: '',
        level: 2,
      },
      {
        title: 'Pending Actions',
        content: '',
        level: 2,
      },
      {
        title: 'Important Notes',
        content: '',
        level: 2,
      },
    ],
    raw: '',
  };
}

/**
 * Load or create memory for agent
 */
export async function loadOrCreateMemory(
  agentPath: string,
  agentId: string
): Promise<AgentMemory> {
  const existing = await loadMemory(agentPath);
  if (existing) {
    return existing;
  }
  
  const memory = createEmptyMemory(agentId);
  await saveMemory(agentPath, memory);
  return memory;
}

/**
 * Apply multiple updates to memory
 */
export async function applyMemoryUpdates(
  agentPath: string,
  updates: MemoryUpdate[]
): Promise<AgentMemory | null> {
  const memory = await loadMemory(agentPath);
  if (!memory) {
    return null;
  }
  
  for (const update of updates) {
    const success = updateSection(memory, update.section, update.content, update.append);
    if (!success) {
      // Section doesn't exist, create it
      addSection(memory, update.section, update.content);
    }
  }
  
  await saveMemory(agentPath, memory);
  return memory;
}

/**
 * Quick update to a single section
 */
export async function quickUpdateMemory(
  agentPath: string,
  section: string,
  content: string,
  append: boolean = false
): Promise<boolean> {
  const result = await applyMemoryUpdates(agentPath, [
    { section, content, append },
  ]);
  return result !== null;
}

/**
 * Calculate memory statistics
 */
export function getMemoryStats(
  memory: AgentMemory,
  limits: MemoryLimits = DEFAULT_MEMORY_LIMITS
): MemoryStats {
  let totalSize = 0;
  let largestSection: { title: string; size: number } | null = null;
  
  for (const section of memory.sections) {
    const size = section.content.length;
    totalSize += size + section.title.length + 10; // overhead for heading
    
    if (!largestSection || size > largestSection.size) {
      largestSection = { title: section.title, size };
    }
  }
  
  return {
    totalSize,
    sectionCount: memory.sections.length,
    largestSection,
    withinLimits: totalSize <= limits.maxTotalSize && 
                  memory.sections.length <= limits.maxSections,
    usagePercent: Math.round((totalSize / limits.maxTotalSize) * 100),
  };
}

/**
 * Check if memory is within limits
 */
export function checkMemoryLimits(
  memory: AgentMemory,
  limits: MemoryLimits = DEFAULT_MEMORY_LIMITS
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const stats = getMemoryStats(memory, limits);
  
  if (stats.totalSize > limits.maxTotalSize) {
    errors.push(`Total size ${stats.totalSize} exceeds limit ${limits.maxTotalSize}`);
  }
  
  if (stats.sectionCount > limits.maxSections) {
    errors.push(`Section count ${stats.sectionCount} exceeds limit ${limits.maxSections}`);
  }
  
  for (const section of memory.sections) {
    if (section.content.length > limits.maxSectionSize) {
      errors.push(`Section "${section.title}" size ${section.content.length} exceeds limit ${limits.maxSectionSize}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Truncate content to fit within limit
 */
export function truncateContent(content: string, maxSize: number): string {
  if (content.length <= maxSize) {
    return content;
  }
  
  const truncated = content.slice(0, maxSize - 50);
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = lastNewline > maxSize * 0.8 ? lastNewline : truncated.length;
  
  return truncated.slice(0, cutPoint) + '\n\n[...truncated...]';
}

/**
 * Tool-friendly memory write function
 * Returns detailed result suitable for tool responses
 */
export async function writeMemorySection(
  agentPath: string,
  section: string,
  content: string,
  options: {
    append?: boolean;
    createIfMissing?: boolean;
    enforceLimits?: boolean;
    limits?: MemoryLimits;
  } = {}
): Promise<MemoryWriteResult> {
  const {
    append = false,
    createIfMissing = true,
    enforceLimits = true,
    limits = DEFAULT_MEMORY_LIMITS,
  } = options;
  
  // Load existing memory
  let memory = await loadMemory(agentPath);
  
  if (!memory) {
    // Extract agent ID from path
    const agentId = agentPath.split('/').pop() || 'unknown';
    memory = createEmptyMemory(agentId);
  }
  
  // Check section count limit
  const existingSection = memory.sections.find(
    s => s.title.toLowerCase() === section.toLowerCase()
  );
  
  if (!existingSection && !createIfMissing) {
    return {
      success: false,
      section,
      error: `Section "${section}" does not exist`,
    };
  }
  
  if (!existingSection && memory.sections.length >= limits.maxSections) {
    return {
      success: false,
      section,
      error: `Cannot create new section: limit of ${limits.maxSections} sections reached`,
    };
  }
  
  // Prepare content
  let finalContent = content;
  let truncated = false;
  
  if (enforceLimits && content.length > limits.maxSectionSize) {
    finalContent = truncateContent(content, limits.maxSectionSize);
    truncated = true;
  }
  
  // Apply update
  if (existingSection) {
    if (append) {
      const newContent = existingSection.content 
        ? `${existingSection.content}\n${finalContent}`
        : finalContent;
      
      if (enforceLimits && newContent.length > limits.maxSectionSize) {
        existingSection.content = truncateContent(newContent, limits.maxSectionSize);
        truncated = true;
      } else {
        existingSection.content = newContent;
      }
    } else {
      existingSection.content = finalContent;
    }
  } else {
    addSection(memory, section, finalContent);
  }
  
  // Check total size
  const stats = getMemoryStats(memory, limits);
  if (enforceLimits && stats.totalSize > limits.maxTotalSize) {
    return {
      success: false,
      section,
      error: `Write would exceed total memory limit (${stats.totalSize}/${limits.maxTotalSize})`,
      sizeUsed: stats.totalSize,
      sizeLimit: limits.maxTotalSize,
    };
  }
  
  // Save
  try {
    await saveMemory(agentPath, memory);
    return {
      success: true,
      section,
      truncated,
      sizeUsed: stats.totalSize,
      sizeLimit: limits.maxTotalSize,
    };
  } catch (error) {
    return {
      success: false,
      section,
      error: `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Tool-friendly memory read function
 */
export async function readMemorySection(
  agentPath: string,
  section?: string
): Promise<{ success: boolean; content?: string; sections?: string[]; error?: string }> {
  const memory = await loadMemory(agentPath);
  
  if (!memory) {
    return { success: false, error: 'No memory file found' };
  }
  
  if (section) {
    const found = getSection(memory, section);
    if (!found) {
      return { 
        success: false, 
        error: `Section "${section}" not found`,
        sections: memory.sections.map(s => s.title),
      };
    }
    return { success: true, content: found.content };
  }
  
  // Return all sections
  return {
    success: true,
    content: memory.raw,
    sections: memory.sections.map(s => s.title),
  };
}

/**
 * Format memory for context injection
 */
export function formatMemoryForContext(memory: AgentMemory): string {
  const lines: string[] = [];
  
  for (const section of memory.sections) {
    if (section.content.trim()) {
      lines.push(`### ${section.title}`);
      lines.push(section.content);
      lines.push('');
    }
  }
  
  return lines.join('\n').trim();
}
