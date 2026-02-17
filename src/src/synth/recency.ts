/**
 * Recency-based hot/warm/cold section management
 * Updates entity notes based on item age
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { DatabaseInstance } from '../db/connection.js';
import {
  parseExistingNote,
  generateNoteContent,
  type EntityData,
  type EntityNote,
} from '../entity/note.js';

/**
 * Time thresholds for sections (in days)
 */
export const SECTION_THRESHOLDS = {
  hot: 7,    // Items from last 7 days
  warm: 30,  // Items from 8-30 days
  cold: Infinity, // Items older than 30 days
};

/**
 * Item with timestamp
 */
export interface TimestampedItem {
  id: number;
  content: string;
  itemType: string;
  createdAt: string;
  sourceChunkId: number;
}

/**
 * Section update result
 */
export interface SectionUpdateResult {
  entityName: string;
  hotCount: number;
  warmCount: number;
  coldCount: number;
  movedToWarm: number;
  movedToCold: number;
}

/**
 * Batch update result
 */
export interface BatchUpdateResult {
  notesUpdated: number;
  notesSkipped: number;
  itemsMoved: number;
  errors: Array<{ note: string; error: string }>;
  duration: number;
}

/**
 * Progress callback
 */
export type ProgressCallback = (current: number, total: number, noteName?: string) => void;

/**
 * Calculate item age in days
 */
export function calculateAgeDays(createdAt: string, now: Date = new Date()): number {
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determine section for item based on age
 */
export function getSectionForAge(ageDays: number): 'hot' | 'warm' | 'cold' {
  if (ageDays <= SECTION_THRESHOLDS.hot) {
    return 'hot';
  } else if (ageDays <= SECTION_THRESHOLDS.warm) {
    return 'warm';
  }
  return 'cold';
}

/**
 * Get items for entity from database
 */
export function getItemsForEntity(
  db: DatabaseInstance,
  entityName: string
): TimestampedItem[] {
  // Find items that mention this entity
  const items = db.prepare(`
    SELECT i.id, i.content, i.item_type, i.created_at, i.chunk_id
    FROM items i
    WHERE i.content LIKE ? OR i.metadata LIKE ?
    ORDER BY i.created_at DESC
  `).all(`%${entityName}%`, `%${entityName}%`) as Array<{
    id: number;
    content: string;
    item_type: string;
    created_at: string;
    chunk_id: number;
  }>;
  
  return items.map(row => ({
    id: row.id,
    content: row.content,
    itemType: row.item_type,
    createdAt: row.created_at,
    sourceChunkId: row.chunk_id,
  }));
}

/**
 * Categorize items by section based on age
 */
export function categorizeItemsByAge(
  items: TimestampedItem[],
  now: Date = new Date()
): { hot: string[]; warm: string[]; cold: string[] } {
  const hot: string[] = [];
  const warm: string[] = [];
  const cold: string[] = [];
  
  for (const item of items) {
    const ageDays = calculateAgeDays(item.createdAt, now);
    const section = getSectionForAge(ageDays);
    const formattedItem = `- ${item.content}`;
    
    switch (section) {
      case 'hot':
        hot.push(formattedItem);
        break;
      case 'warm':
        warm.push(formattedItem);
        break;
      case 'cold':
        cold.push(formattedItem);
        break;
    }
  }
  
  return { hot, warm, cold };
}

/**
 * Parse section items from note content
 */
export function parseSectionItems(sectionContent: string[]): Array<{ content: string; raw: string }> {
  return sectionContent
    .filter(line => line.trim().startsWith('- '))
    .map(line => ({
      content: line.trim().replace(/^- /, ''),
      raw: line,
    }));
}

/**
 * Update entity note sections based on recency
 */
export async function updateEntityNoteSections(
  vaultPath: string,
  entityName: string,
  db: DatabaseInstance,
  now: Date = new Date()
): Promise<SectionUpdateResult | null> {
  const notePath = join(vaultPath, '20_Concepts', `${entityName}.md`);
  
  if (!existsSync(notePath)) {
    return null;
  }
  
  try {
    const content = await readFile(notePath, 'utf-8');
    const existingNote = parseExistingNote(content);
    
    if (!existingNote) {
      return null;
    }
    
    // Get items from database for this entity
    const items = getItemsForEntity(db, entityName);
    
    // Categorize by age
    const categorized = categorizeItemsByAge(items, now);
    
    // Merge with existing sections (preserve manual additions)
    const existingHot = parseSectionItems(existingNote.hotSection);
    const existingWarm = parseSectionItems(existingNote.warmSection);
    const existingCold = parseSectionItems(existingNote.coldSection);
    
    // Track moves
    let movedToWarm = 0;
    let movedToCold = 0;
    
    // Check existing hot items - move old ones to warm/cold
    const newHotSection: string[] = [];
    for (const item of existingHot) {
      // Check if this item should move based on content match with DB items
      const matchingDbItem = items.find(i => i.content === item.content);
      if (matchingDbItem) {
        const ageDays = calculateAgeDays(matchingDbItem.createdAt, now);
        const newSection = getSectionForAge(ageDays);
        if (newSection === 'warm') {
          movedToWarm++;
          categorized.warm.push(item.raw);
        } else if (newSection === 'cold') {
          movedToCold++;
          categorized.cold.push(item.raw);
        } else {
          newHotSection.push(item.raw);
        }
      } else {
        // Keep items not in DB (manual additions) - assume they age out after threshold
        newHotSection.push(item.raw);
      }
    }
    
    // Similar for warm -> cold
    const newWarmSection: string[] = [];
    for (const item of existingWarm) {
      const matchingDbItem = items.find(i => i.content === item.content);
      if (matchingDbItem) {
        const ageDays = calculateAgeDays(matchingDbItem.createdAt, now);
        if (ageDays > SECTION_THRESHOLDS.warm) {
          movedToCold++;
          categorized.cold.push(item.raw);
        } else {
          newWarmSection.push(item.raw);
        }
      } else {
        newWarmSection.push(item.raw);
      }
    }
    
    // Build updated note
    const updatedNote: EntityNote = {
      frontmatter: {
        ...existingNote.frontmatter,
        updated: now.toISOString().split('T')[0],
      },
      hotSection: [...new Set([...newHotSection, ...categorized.hot])].slice(0, 10),
      warmSection: [...new Set([...newWarmSection, ...categorized.warm])].slice(0, 20),
      coldSection: [...new Set([...existingCold.map(i => i.raw), ...categorized.cold])],
      backlinks: existingNote.backlinks,
    };
    
    // Generate updated content
    const entityData: EntityData = {
      name: existingNote.frontmatter.name,
      type: existingNote.frontmatter.type,
      aliases: existingNote.frontmatter.aliases,
      tags: existingNote.frontmatter.tags,
      sources: existingNote.frontmatter.sources,
    };
    
    const newContent = generateNoteContent(entityData, updatedNote);
    await writeFile(notePath, newContent, 'utf-8');
    
    return {
      entityName,
      hotCount: updatedNote.hotSection.length,
      warmCount: updatedNote.warmSection.length,
      coldCount: updatedNote.coldSection.length,
      movedToWarm,
      movedToCold,
    };
  } catch {
    return null;
  }
}

/**
 * Get all entity notes in vault
 */
export async function getEntityNotes(vaultPath: string): Promise<string[]> {
  const conceptsPath = join(vaultPath, '20_Concepts');
  
  if (!existsSync(conceptsPath)) {
    return [];
  }
  
  try {
    const files = await readdir(conceptsPath);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  } catch {
    return [];
  }
}

/**
 * Run weekly section update for all entity notes
 */
export async function runWeeklySectionUpdate(
  vaultPath: string,
  db: DatabaseInstance,
  onProgress?: ProgressCallback
): Promise<BatchUpdateResult> {
  const startTime = Date.now();
  const result: BatchUpdateResult = {
    notesUpdated: 0,
    notesSkipped: 0,
    itemsMoved: 0,
    errors: [],
    duration: 0,
  };
  
  const now = new Date();
  const entityNames = await getEntityNotes(vaultPath);
  
  for (let i = 0; i < entityNames.length; i++) {
    const entityName = entityNames[i];
    onProgress?.(i + 1, entityNames.length, entityName);
    
    try {
      const updateResult = await updateEntityNoteSections(vaultPath, entityName, db, now);
      
      if (updateResult) {
        result.notesUpdated++;
        result.itemsMoved += updateResult.movedToWarm + updateResult.movedToCold;
      } else {
        result.notesSkipped++;
      }
    } catch (error) {
      result.errors.push({
        note: entityName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Get section statistics for an entity
 */
export function getEntitySectionStats(
  db: DatabaseInstance,
  entityName: string,
  now: Date = new Date()
): { hot: number; warm: number; cold: number } {
  const items = getItemsForEntity(db, entityName);
  const categorized = categorizeItemsByAge(items, now);
  
  return {
    hot: categorized.hot.length,
    warm: categorized.warm.length,
    cold: categorized.cold.length,
  };
}

/**
 * Get overall recency statistics
 */
export function getRecencyStats(
  db: DatabaseInstance,
  now: Date = new Date()
): { hot: number; warm: number; cold: number; total: number } {
  const items = db.prepare(`
    SELECT created_at FROM items
  `).all() as Array<{ created_at: string }>;
  
  let hot = 0;
  let warm = 0;
  let cold = 0;
  
  for (const item of items) {
    const ageDays = calculateAgeDays(item.created_at, now);
    const section = getSectionForAge(ageDays);
    
    switch (section) {
      case 'hot': hot++; break;
      case 'warm': warm++; break;
      case 'cold': cold++; break;
    }
  }
  
  return { hot, warm, cold, total: items.length };
}
