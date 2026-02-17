/**
 * Extraction pipeline
 * Full pipeline for extracting knowledge from sources
 */

import type { DatabaseInstance } from '../db/connection.js';
import { generateItemHash } from '../item/idempotent.js';
import {
  updateSourceFile,
  createSummaryFromResults,
  type ExtractionSummary,
} from '../source/header.js';
import {
  upsertEntityNote,
  type EntityData,
} from '../entity/note.js';

/**
 * Extraction options
 */
export interface ExtractionOptions {
  vaultPath: string;
  collection?: string;
  limit?: number;
  since?: string;
  dryRun?: boolean;
  onProgress?: (progress: ExtractionProgress) => void;
}

/**
 * Extraction progress
 */
export interface ExtractionProgress {
  phase: 'scanning' | 'extracting' | 'saving' | 'complete';
  current: number;
  total: number;
  currentSource?: string;
  message?: string;
}

/**
 * Extraction result
 */
export interface ExtractionResult {
  sourcesProcessed: number;
  sourcesSkipped: number;
  entitiesCreated: number;
  factsCreated: number;
  tasksCreated: number;
  insightsCreated: number;
  notesCreated: number;
  notesUpdated: number;
  headersUpdated: number;
  errors: Array<{ source: string; error: string }>;
  duration: number;
}

/**
 * Source row from database
 */
interface SourceRow {
  id: number;
  path: string;
  collection: string;
  file_type: string;
  extracted_at: string | null;
  created_at: string;
}

/**
 * Chunk row from database
 */
interface ChunkRow {
  id: number;
  source_id: number;
  content: string;
  chunk_index: number;
}

/**
 * Ensure sources table has extracted_at column
 */
export function ensureExtractedAtColumn(db: DatabaseInstance): void {
  const columns = db.prepare("PRAGMA table_info(sources)").all() as Array<{ name: string }>;
  const hasColumn = columns.some(col => col.name === 'extracted_at');
  
  if (!hasColumn) {
    db.exec('ALTER TABLE sources ADD COLUMN extracted_at TEXT');
  }
}

/**
 * Get sources to extract
 */
export function getSourcesToExtract(
  db: DatabaseInstance,
  options: ExtractionOptions
): SourceRow[] {
  let sql = `
    SELECT id, path, collection, file_type, extracted_at, created_at
    FROM sources
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  
  if (options.collection) {
    sql += ' AND collection = ?';
    params.push(options.collection);
  }
  
  if (options.since) {
    sql += ' AND (extracted_at IS NULL OR extracted_at < ?)';
    params.push(options.since);
  } else {
    // By default, only extract sources that haven't been extracted
    sql += ' AND extracted_at IS NULL';
  }
  
  sql += ' ORDER BY created_at ASC';
  
  if (options.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }
  
  return db.prepare(sql).all(...params) as SourceRow[];
}

/**
 * Get chunks for source
 */
export function getChunksForSource(db: DatabaseInstance, sourceId: number): ChunkRow[] {
  return db.prepare(`
    SELECT id, source_id, content, chunk_index
    FROM chunks
    WHERE source_id = ?
    ORDER BY chunk_index
  `).all(sourceId) as ChunkRow[];
}

/**
 * Mark source as extracted
 */
export function markSourceExtracted(db: DatabaseInstance, sourceId: number): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE sources SET extracted_at = ? WHERE id = ?').run(now, sourceId);
}

/**
 * Mock extraction result (to be replaced with actual LLM extraction)
 */
export interface MockExtractionResult {
  summary: string;
  entities: Array<{ name: string; type: string; description?: string }>;
  facts: Array<{ content: string; confidence: number }>;
  tasks: Array<{ content: string; priority?: string }>;
  insights: Array<{ content: string }>;
}

/**
 * Extract from chunks (mock implementation)
 * In production, this would call the LLM provider
 */
export function extractFromChunks(chunks: ChunkRow[]): MockExtractionResult {
  // Simple extraction based on content patterns
  const allContent = chunks.map(c => c.content).join('\n');
  
  const entities: MockExtractionResult['entities'] = [];
  const facts: MockExtractionResult['facts'] = [];
  const tasks: MockExtractionResult['tasks'] = [];
  const insights: MockExtractionResult['insights'] = [];
  
  // Extract potential entities (capitalized words/phrases)
  const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const entityMatches = new Set<string>();
  let match;
  while ((match = entityPattern.exec(allContent)) !== null) {
    const name = match[1];
    if (name.length > 2 && !['The', 'This', 'That', 'What', 'When', 'Where', 'How', 'Why'].includes(name)) {
      entityMatches.add(name);
    }
  }
  for (const name of Array.from(entityMatches).slice(0, 10)) {
    entities.push({ name, type: 'concept' });
  }
  
  // Extract potential facts (sentences with specific patterns)
  const sentences = allContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
  for (const sentence of sentences.slice(0, 5)) {
    const trimmed = sentence.trim();
    if (trimmed.includes(' is ') || trimmed.includes(' are ') || trimmed.includes(' was ')) {
      facts.push({ content: trimmed, confidence: 0.7 });
    }
  }
  
  // Extract potential tasks (TODO, action items)
  const taskPattern = /(?:TODO|TASK|ACTION|FIXME)[:\s]+(.+?)(?:\n|$)/gi;
  while ((match = taskPattern.exec(allContent)) !== null) {
    tasks.push({ content: match[1].trim() });
  }
  
  // Generate summary
  const summary = sentences.length > 0 
    ? sentences[0].trim().slice(0, 200) + (sentences[0].length > 200 ? '...' : '')
    : 'No summary available';
  
  return { summary, entities, facts, tasks, insights };
}

/**
 * Save extraction results to database
 */
export function saveExtractionResults(
  db: DatabaseInstance,
  _sourceId: number,
  chunkId: number,
  extraction: MockExtractionResult
): { entities: number; facts: number; tasks: number; insights: number } {
  let entities = 0;
  let facts = 0;
  let tasks = 0;
  let insights = 0;
  
  // Save entities
  for (const entity of extraction.entities) {
    const hash = generateItemHash({ type: 'entity', content: entity.name, sourceChunkId: chunkId });
    const existing = db.prepare('SELECT id FROM items WHERE hash = ?').get(hash);
    if (!existing) {
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash, metadata)
        VALUES (?, 'entity', ?, ?, ?)
      `).run(chunkId, entity.name, hash, JSON.stringify({ entityType: entity.type }));
      entities++;
    }
  }
  
  // Save facts
  for (const fact of extraction.facts) {
    const hash = generateItemHash({ type: 'fact', content: fact.content, sourceChunkId: chunkId });
    const existing = db.prepare('SELECT id FROM items WHERE hash = ?').get(hash);
    if (!existing) {
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, confidence, hash)
        VALUES (?, 'fact', ?, ?, ?)
      `).run(chunkId, fact.content, fact.confidence, hash);
      facts++;
    }
  }
  
  // Save tasks
  for (const task of extraction.tasks) {
    const hash = generateItemHash({ type: 'task', content: task.content, sourceChunkId: chunkId });
    const existing = db.prepare('SELECT id FROM items WHERE hash = ?').get(hash);
    if (!existing) {
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash, metadata)
        VALUES (?, 'task', ?, ?, ?)
      `).run(chunkId, task.content, hash, JSON.stringify({ priority: task.priority }));
      tasks++;
    }
  }
  
  // Save insights
  for (const insight of extraction.insights) {
    const hash = generateItemHash({ type: 'insight', content: insight.content, sourceChunkId: chunkId });
    const existing = db.prepare('SELECT id FROM items WHERE hash = ?').get(hash);
    if (!existing) {
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash)
        VALUES (?, 'insight', ?, ?)
      `).run(chunkId, insight.content, hash);
      insights++;
    }
  }
  
  return { entities, facts, tasks, insights };
}

/**
 * Run extraction pipeline
 */
export async function runExtractionPipeline(
  db: DatabaseInstance,
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const result: ExtractionResult = {
    sourcesProcessed: 0,
    sourcesSkipped: 0,
    entitiesCreated: 0,
    factsCreated: 0,
    tasksCreated: 0,
    insightsCreated: 0,
    notesCreated: 0,
    notesUpdated: 0,
    headersUpdated: 0,
    errors: [],
    duration: 0,
  };
  
  const progress = options.onProgress || (() => {});
  
  // Get sources to extract
  progress({ phase: 'scanning', current: 0, total: 0, message: 'Finding sources...' });
  const sources = getSourcesToExtract(db, options);
  
  if (sources.length === 0) {
    progress({ phase: 'complete', current: 0, total: 0, message: 'No sources to extract' });
    result.duration = Date.now() - startTime;
    return result;
  }
  
  progress({ phase: 'extracting', current: 0, total: sources.length });
  
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    progress({
      phase: 'extracting',
      current: i + 1,
      total: sources.length,
      currentSource: source.path,
    });
    
    try {
      // Get chunks for source
      const chunks = getChunksForSource(db, source.id);
      
      if (chunks.length === 0) {
        result.sourcesSkipped++;
        continue;
      }
      
      // Extract from chunks
      const extraction = extractFromChunks(chunks);
      
      // Save results to database
      const saved = saveExtractionResults(db, source.id, chunks[0].id, extraction);
      result.entitiesCreated += saved.entities;
      result.factsCreated += saved.facts;
      result.tasksCreated += saved.tasks;
      result.insightsCreated += saved.insights;
      
      // Create/update entity notes
      if (!options.dryRun) {
        for (const entity of extraction.entities) {
          const entityData: EntityData = {
            name: entity.name,
            type: entity.type as EntityData['type'],
            description: entity.description,
            facts: extraction.facts.map(f => f.content),
            sources: [source.path],
          };
          
          try {
            const noteResult = await upsertEntityNote(options.vaultPath, entityData);
            if (noteResult.created) result.notesCreated++;
            else if (noteResult.updated) result.notesUpdated++;
          } catch {
            // Entity note creation is non-critical
          }
        }
        
        // Update source header
        const summary: ExtractionSummary = createSummaryFromResults(
          extraction.summary,
          extraction.entities.map(e => ({ name: e.name })),
          extraction.facts.map(f => ({ content: f.content })),
          extraction.tasks.map(t => ({ content: t.content })),
          extraction.insights.map(i => ({ content: i.content })),
          chunks.length
        );
        
        const sourcePath = `${options.vaultPath}/${source.path}`;
        const headerResult = await updateSourceFile(sourcePath, summary);
        if (headerResult.success) {
          result.headersUpdated++;
        }
      }
      
      // Mark source as extracted
      if (!options.dryRun) {
        markSourceExtracted(db, source.id);
      }
      
      result.sourcesProcessed++;
    } catch (error) {
      result.errors.push({
        source: source.path,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  progress({ phase: 'complete', current: sources.length, total: sources.length });
  result.duration = Date.now() - startTime;
  
  return result;
}

/**
 * Get extraction stats
 */
export function getExtractionStats(db: DatabaseInstance): {
  totalSources: number;
  extractedSources: number;
  pendingSources: number;
  totalItems: number;
  itemsByType: Record<string, number>;
} {
  const totalSources = (db.prepare('SELECT COUNT(*) as count FROM sources').get() as { count: number }).count;
  const extractedSources = (db.prepare('SELECT COUNT(*) as count FROM sources WHERE extracted_at IS NOT NULL').get() as { count: number }).count;
  const totalItems = (db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number }).count;
  
  const itemsByType: Record<string, number> = {};
  const typeRows = db.prepare('SELECT item_type, COUNT(*) as count FROM items GROUP BY item_type').all() as Array<{ item_type: string; count: number }>;
  for (const row of typeRows) {
    itemsByType[row.item_type] = row.count;
  }
  
  return {
    totalSources,
    extractedSources,
    pendingSources: totalSources - extractedSources,
    totalItems,
    itemsByType,
  };
}
