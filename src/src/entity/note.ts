/**
 * Entity note creation and update module
 * Creates/updates Obsidian notes for extracted entities
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Entity types that get notes
 */
export type EntityType = 'person' | 'place' | 'concept' | 'project' | 'organization' | 'tool' | 'event';

/**
 * Entity data for note creation
 */
export interface EntityData {
  name: string;
  type: EntityType;
  description?: string;
  aliases?: string[];
  tags?: string[];
  facts?: string[];
  sources?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Note section types
 */
export type SectionType = 'hot' | 'warm' | 'cold';

/**
 * Entity note structure
 */
export interface EntityNote {
  frontmatter: EntityFrontmatter;
  hotSection: string[];
  warmSection: string[];
  coldSection: string[];
  backlinks: string[];
}

/**
 * Frontmatter for entity notes
 */
export interface EntityFrontmatter {
  name: string;
  type: EntityType;
  aliases: string[];
  tags: string[];
  created: string;
  updated: string;
  sources: string[];
  [key: string]: unknown;
}

/**
 * Note update options
 */
export interface NoteUpdateOptions {
  preserveManualEdits?: boolean;
  appendFacts?: boolean;
  updateTimestamp?: boolean;
}

/**
 * Generate frontmatter YAML
 */
export function generateFrontmatter(data: EntityFrontmatter): string {
  const lines = ['---'];
  
  lines.push(`name: "${escapeYamlString(data.name)}"`);
  lines.push(`type: ${data.type}`);
  
  if (data.aliases.length > 0) {
    lines.push('aliases:');
    for (const alias of data.aliases) {
      lines.push(`  - "${escapeYamlString(alias)}"`);
    }
  } else {
    lines.push('aliases: []');
  }
  
  if (data.tags.length > 0) {
    lines.push('tags:');
    for (const tag of data.tags) {
      lines.push(`  - ${tag}`);
    }
  } else {
    lines.push('tags: []');
  }
  
  lines.push(`created: ${data.created}`);
  lines.push(`updated: ${data.updated}`);
  
  if (data.sources.length > 0) {
    lines.push('sources:');
    for (const source of data.sources) {
      lines.push(`  - "${escapeYamlString(source)}"`);
    }
  } else {
    lines.push('sources: []');
  }
  
  // Add any additional metadata
  for (const [key, value] of Object.entries(data)) {
    if (!['name', 'type', 'aliases', 'tags', 'created', 'updated', 'sources'].includes(key)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  
  lines.push('---');
  return lines.join('\n');
}

/**
 * Escape special characters in YAML strings
 */
function escapeYamlString(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Generate entity note content
 */
export function generateNoteContent(entity: EntityData, existingNote?: EntityNote): string {
  const now = new Date().toISOString().split('T')[0];
  
  const frontmatter: EntityFrontmatter = {
    name: entity.name,
    type: entity.type,
    aliases: entity.aliases || [],
    tags: entity.tags || [`entity/${entity.type}`],
    created: existingNote?.frontmatter.created || now,
    updated: now,
    sources: entity.sources || [],
  };
  
  // Merge metadata
  if (entity.metadata) {
    Object.assign(frontmatter, entity.metadata);
  }
  
  const sections: string[] = [generateFrontmatter(frontmatter), ''];
  
  // Title
  sections.push(`# ${entity.name}`);
  sections.push('');
  
  // Description
  if (entity.description) {
    sections.push(entity.description);
    sections.push('');
  }
  
  // Hot section (most important/recent)
  sections.push('## Hot');
  sections.push('');
  const hotFacts = existingNote?.hotSection || [];
  if (entity.facts && entity.facts.length > 0) {
    // Add new facts to hot section
    for (const fact of entity.facts.slice(0, 5)) {
      if (!hotFacts.includes(fact)) {
        hotFacts.unshift(`- ${fact}`);
      }
    }
  }
  if (hotFacts.length > 0) {
    sections.push(...hotFacts.slice(0, 10));
  } else {
    sections.push('*No hot items yet*');
  }
  sections.push('');
  
  // Warm section (important but not urgent)
  sections.push('## Warm');
  sections.push('');
  const warmFacts = existingNote?.warmSection || [];
  if (entity.facts && entity.facts.length > 5) {
    // Move older facts to warm
    for (const fact of entity.facts.slice(5, 15)) {
      if (!warmFacts.includes(fact)) {
        warmFacts.push(`- ${fact}`);
      }
    }
  }
  if (warmFacts.length > 0) {
    sections.push(...warmFacts.slice(0, 20));
  } else {
    sections.push('*No warm items yet*');
  }
  sections.push('');
  
  // Cold section (archive/reference)
  sections.push('## Cold');
  sections.push('');
  const coldFacts = existingNote?.coldSection || [];
  if (coldFacts.length > 0) {
    sections.push(...coldFacts);
  } else {
    sections.push('*No archived items*');
  }
  sections.push('');
  
  // Backlinks section
  sections.push('## Backlinks');
  sections.push('');
  const backlinks = existingNote?.backlinks || [];
  if (entity.sources) {
    for (const source of entity.sources) {
      const link = `- [[${source}]]`;
      if (!backlinks.includes(link)) {
        backlinks.push(link);
      }
    }
  }
  if (backlinks.length > 0) {
    sections.push(...backlinks);
  } else {
    sections.push('*No backlinks yet*');
  }
  
  return sections.join('\n');
}

/**
 * Parse existing note content
 */
export function parseExistingNote(content: string): EntityNote | null {
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;
  
  const frontmatter = parseFrontmatter(frontmatterMatch[1]);
  if (!frontmatter) return null;
  
  // Extract sections
  const hotSection = extractSection(content, '## Hot');
  const warmSection = extractSection(content, '## Warm');
  const coldSection = extractSection(content, '## Cold');
  const backlinks = extractSection(content, '## Backlinks');
  
  return {
    frontmatter,
    hotSection,
    warmSection,
    coldSection,
    backlinks,
  };
}

/**
 * Parse YAML frontmatter
 */
function parseFrontmatter(yaml: string): EntityFrontmatter | null {
  try {
    const result: Record<string, unknown> = {};
    const lines = yaml.split('\n');
    let currentKey = '';
    let currentArray: string[] = [];
    let inArray = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (trimmed.startsWith('- ')) {
        // Array item
        if (inArray && currentKey) {
          const value = trimmed.slice(2).replace(/^["']|["']$/g, '');
          currentArray.push(value);
        }
      } else if (trimmed.includes(':')) {
        // Save previous array
        if (inArray && currentKey) {
          result[currentKey] = currentArray;
          currentArray = [];
          inArray = false;
        }
        
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        
        if (value === '' || value === '[]') {
          // Empty array or start of array
          currentKey = key;
          inArray = true;
          if (value === '[]') {
            result[key] = [];
            inArray = false;
          }
        } else {
          // Simple value
          result[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    }
    
    // Save last array
    if (inArray && currentKey) {
      result[currentKey] = currentArray;
    }
    
    return {
      name: String(result.name || ''),
      type: (result.type as EntityType) || 'concept',
      aliases: (result.aliases as string[]) || [],
      tags: (result.tags as string[]) || [],
      created: String(result.created || new Date().toISOString().split('T')[0]),
      updated: String(result.updated || new Date().toISOString().split('T')[0]),
      sources: (result.sources as string[]) || [],
      ...result,
    };
  } catch {
    return null;
  }
}

/**
 * Extract section content as array of lines
 */
function extractSection(content: string, sectionHeader: string): string[] {
  const lines = content.split('\n');
  const startIndex = lines.findIndex(line => line.trim() === sectionHeader);
  
  if (startIndex === -1) return [];
  
  const sectionLines: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at next section header
    if (line.startsWith('## ')) break;
    // Skip empty lines at start
    if (sectionLines.length === 0 && !line.trim()) continue;
    // Skip placeholder text
    if (line.includes('*No ') && line.includes(' yet*')) continue;
    if (line.includes('*No archived items*')) continue;
    // Add content lines
    if (line.trim()) {
      sectionLines.push(line);
    }
  }
  
  return sectionLines;
}

/**
 * Generate note file path
 */
export function getEntityNotePath(
  vaultPath: string,
  entity: EntityData,
  conceptsFolder = '20_Concepts'
): string {
  const sanitizedName = sanitizeFileName(entity.name);
  return join(vaultPath, conceptsFolder, `${sanitizedName}.md`);
}

/**
 * Sanitize file name
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Create or update entity note
 */
export async function upsertEntityNote(
  vaultPath: string,
  entity: EntityData,
  _options: NoteUpdateOptions = {}
): Promise<{ path: string; created: boolean; updated: boolean }> {
  const notePath = getEntityNotePath(vaultPath, entity);
  const dir = dirname(notePath);
  
  // Ensure directory exists
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  
  let existingNote: EntityNote | null = null;
  let created = false;
  let updated = false;
  
  // Check for existing note
  if (existsSync(notePath)) {
    try {
      const existingContent = await readFile(notePath, 'utf-8');
      existingNote = parseExistingNote(existingContent);
      updated = true;
    } catch {
      // File exists but couldn't be read, will be overwritten
    }
  } else {
    created = true;
  }
  
  // Generate new content
  const content = generateNoteContent(entity, existingNote || undefined);
  
  // Write note
  await writeFile(notePath, content, 'utf-8');
  
  return { path: notePath, created, updated };
}

/**
 * Batch create/update entity notes
 */
export async function upsertEntityNotes(
  vaultPath: string,
  entities: EntityData[],
  _options: NoteUpdateOptions = {}
): Promise<{ created: number; updated: number; errors: number }> {
  let created = 0;
  let updated = 0;
  let errors = 0;
  
  for (const entity of entities) {
    try {
      const result = await upsertEntityNote(vaultPath, entity, _options);
      if (result.created) created++;
      else if (result.updated) updated++;
    } catch {
      errors++;
    }
  }
  
  return { created, updated, errors };
}

/**
 * Add backlink to entity note
 */
export async function addBacklink(
  vaultPath: string,
  entityName: string,
  sourcePath: string
): Promise<boolean> {
  const entity: EntityData = { name: entityName, type: 'concept' };
  const notePath = getEntityNotePath(vaultPath, entity);
  
  if (!existsSync(notePath)) return false;
  
  try {
    const content = await readFile(notePath, 'utf-8');
    const existingNote = parseExistingNote(content);
    
    if (!existingNote) return false;
    
    const link = `- [[${sourcePath}]]`;
    if (!existingNote.backlinks.includes(link)) {
      existingNote.backlinks.push(link);
      
      // Regenerate note with new backlink
      const entityData: EntityData = {
        name: existingNote.frontmatter.name,
        type: existingNote.frontmatter.type,
        aliases: existingNote.frontmatter.aliases,
        tags: existingNote.frontmatter.tags,
        sources: existingNote.frontmatter.sources,
      };
      
      const newContent = generateNoteContent(entityData, existingNote);
      await writeFile(notePath, newContent, 'utf-8');
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Move fact between sections
 */
export async function moveFact(
  vaultPath: string,
  entityName: string,
  fact: string,
  fromSection: SectionType,
  toSection: SectionType
): Promise<boolean> {
  const entity: EntityData = { name: entityName, type: 'concept' };
  const notePath = getEntityNotePath(vaultPath, entity);
  
  if (!existsSync(notePath)) return false;
  
  try {
    const content = await readFile(notePath, 'utf-8');
    const existingNote = parseExistingNote(content);
    
    if (!existingNote) return false;
    
    // Find and remove fact from source section
    const fromArray = getSectionArray(existingNote, fromSection);
    const factIndex = fromArray.findIndex(f => f.includes(fact));
    
    if (factIndex === -1) return false;
    
    const [removedFact] = fromArray.splice(factIndex, 1);
    
    // Add to target section
    const toArray = getSectionArray(existingNote, toSection);
    toArray.push(removedFact);
    
    // Regenerate note
    const entityData: EntityData = {
      name: existingNote.frontmatter.name,
      type: existingNote.frontmatter.type,
      aliases: existingNote.frontmatter.aliases,
      tags: existingNote.frontmatter.tags,
      sources: existingNote.frontmatter.sources,
    };
    
    const newContent = generateNoteContent(entityData, existingNote);
    await writeFile(notePath, newContent, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get section array from note
 */
function getSectionArray(note: EntityNote, section: SectionType): string[] {
  switch (section) {
    case 'hot': return note.hotSection;
    case 'warm': return note.warmSection;
    case 'cold': return note.coldSection;
  }
}
