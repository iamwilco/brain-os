/**
 * Full-text search module using SQLite FTS5
 * Provides search across chunks, items, and entities
 */

import type { DatabaseInstance } from '../db/connection.js';

/**
 * Search result with relevance score
 */
export interface SearchResult {
  id: number;
  content: string;
  score: number;
  highlights: string[];
  sourceType: 'chunk' | 'item' | 'entity';
}

/**
 * Chunk search result with source info
 */
export interface ChunkSearchResult extends SearchResult {
  sourceType: 'chunk';
  sourceId: number;
  sourcePath: string;
  startLine: number;
  endLine: number;
}

/**
 * Item search result
 */
export interface ItemSearchResult extends SearchResult {
  sourceType: 'item';
  itemType: string;
  chunkId: number;
}

/**
 * Entity search result
 */
export interface EntitySearchResult extends SearchResult {
  sourceType: 'entity';
  entityType: string;
  name: string;
  description: string | null;
}

/**
 * Search options
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  sourceType?: 'chunk' | 'item' | 'entity' | 'all';
  collection?: string;
  minScore?: number;
}

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  limit: 20,
  offset: 0,
  sourceType: 'all',
  collection: '',
  minScore: 0,
};

/**
 * Escape special FTS5 characters in query
 */
export function escapeQuery(query: string): string {
  // Escape quotes and special characters
  return query
    .replace(/"/g, '""')
    .replace(/\*/g, '')
    .replace(/\(/g, '')
    .replace(/\)/g, '');
}

/**
 * Build FTS5 match query with proper escaping
 */
export function buildMatchQuery(query: string): string {
  const escaped = escapeQuery(query.trim());
  
  // If query has multiple words, wrap in quotes for phrase search
  // or use * for prefix matching
  const words = escaped.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length === 0) {
    return '';
  }
  
  // Use prefix matching for each word
  return words.map(word => `"${word}"*`).join(' OR ');
}

/**
 * Search chunks using FTS5
 */
export function searchChunks(
  db: DatabaseInstance,
  query: string,
  options: SearchOptions = {}
): ChunkSearchResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const matchQuery = buildMatchQuery(query);
  
  if (!matchQuery) {
    return [];
  }

  let sql = `
    SELECT 
      c.id,
      c.content,
      c.source_id,
      c.start_line,
      c.end_line,
      s.path as source_path,
      s.collection,
      bm25(chunks_fts) as score,
      highlight(chunks_fts, 0, '<mark>', '</mark>') as highlighted
    FROM chunks_fts
    JOIN chunks c ON chunks_fts.rowid = c.id
    JOIN sources s ON c.source_id = s.id
    WHERE chunks_fts MATCH ?
  `;

  const params: (string | number)[] = [matchQuery];

  if (opts.collection) {
    sql += ' AND s.collection = ?';
    params.push(opts.collection);
  }

  if (opts.minScore > 0) {
    sql += ' AND bm25(chunks_fts) <= ?';
    params.push(-opts.minScore); // BM25 returns negative scores
  }

  sql += ' ORDER BY bm25(chunks_fts) LIMIT ? OFFSET ?';
  params.push(opts.limit, opts.offset);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    content: string;
    source_id: number;
    start_line: number;
    end_line: number;
    source_path: string;
    collection: string;
    score: number;
    highlighted: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    score: -row.score, // Convert to positive
    highlights: [row.highlighted],
    sourceType: 'chunk' as const,
    sourceId: row.source_id,
    sourcePath: row.source_path,
    startLine: row.start_line,
    endLine: row.end_line,
  }));
}

/**
 * Search items using FTS5
 */
export function searchItems(
  db: DatabaseInstance,
  query: string,
  options: SearchOptions = {}
): ItemSearchResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const matchQuery = buildMatchQuery(query);
  
  if (!matchQuery) {
    return [];
  }

  let sql = `
    SELECT 
      i.id,
      i.content,
      i.item_type,
      i.chunk_id,
      bm25(items_fts) as score,
      highlight(items_fts, 0, '<mark>', '</mark>') as highlighted
    FROM items_fts
    JOIN items i ON items_fts.rowid = i.id
    WHERE items_fts MATCH ?
  `;

  const params: (string | number)[] = [matchQuery];

  if (opts.minScore > 0) {
    sql += ' AND bm25(items_fts) <= ?';
    params.push(-opts.minScore);
  }

  sql += ' ORDER BY bm25(items_fts) LIMIT ? OFFSET ?';
  params.push(opts.limit, opts.offset);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    content: string;
    item_type: string;
    chunk_id: number;
    score: number;
    highlighted: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    content: row.content,
    score: -row.score,
    highlights: [row.highlighted],
    sourceType: 'item' as const,
    itemType: row.item_type,
    chunkId: row.chunk_id,
  }));
}

/**
 * Search entities using FTS5
 */
export function searchEntities(
  db: DatabaseInstance,
  query: string,
  options: SearchOptions = {}
): EntitySearchResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const matchQuery = buildMatchQuery(query);
  
  if (!matchQuery) {
    return [];
  }

  let sql = `
    SELECT 
      e.id,
      e.name,
      e.entity_type,
      e.description,
      bm25(entities_fts) as score,
      highlight(entities_fts, 0, '<mark>', '</mark>') as name_highlighted,
      highlight(entities_fts, 1, '<mark>', '</mark>') as desc_highlighted
    FROM entities_fts
    JOIN entities e ON entities_fts.rowid = e.id
    WHERE entities_fts MATCH ?
  `;

  const params: (string | number)[] = [matchQuery];

  if (opts.minScore > 0) {
    sql += ' AND bm25(entities_fts) <= ?';
    params.push(-opts.minScore);
  }

  sql += ' ORDER BY bm25(entities_fts) LIMIT ? OFFSET ?';
  params.push(opts.limit, opts.offset);

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    name: string;
    entity_type: string;
    description: string | null;
    score: number;
    name_highlighted: string;
    desc_highlighted: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    content: row.name + (row.description ? `: ${row.description}` : ''),
    score: -row.score,
    highlights: [row.name_highlighted, row.desc_highlighted].filter(Boolean),
    sourceType: 'entity' as const,
    entityType: row.entity_type,
    name: row.name,
    description: row.description,
  }));
}

/**
 * Combined search result
 */
export type CombinedSearchResult = ChunkSearchResult | ItemSearchResult | EntitySearchResult;

/**
 * Search across all content types
 */
export function search(
  db: DatabaseInstance,
  query: string,
  options: SearchOptions = {}
): CombinedSearchResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (opts.sourceType === 'chunk') {
    return searchChunks(db, query, opts);
  }
  
  if (opts.sourceType === 'item') {
    return searchItems(db, query, opts);
  }
  
  if (opts.sourceType === 'entity') {
    return searchEntities(db, query, opts);
  }
  
  // Search all and merge results
  const perTypeLimit = Math.ceil(opts.limit / 3);
  const chunkResults = searchChunks(db, query, { ...opts, limit: perTypeLimit });
  const itemResults = searchItems(db, query, { ...opts, limit: perTypeLimit });
  const entityResults = searchEntities(db, query, { ...opts, limit: perTypeLimit });
  
  // Combine and sort by score
  const combined: CombinedSearchResult[] = [
    ...chunkResults,
    ...itemResults,
    ...entityResults,
  ];
  
  combined.sort((a, b) => b.score - a.score);
  
  return combined.slice(0, opts.limit);
}

/**
 * Count total matches for a query
 */
export function countMatches(
  db: DatabaseInstance,
  query: string,
  sourceType: 'chunk' | 'item' | 'entity'
): number {
  const matchQuery = buildMatchQuery(query);
  
  if (!matchQuery) {
    return 0;
  }

  const table = sourceType === 'chunk' ? 'chunks_fts' 
    : sourceType === 'item' ? 'items_fts' 
    : 'entities_fts';

  const row = db.prepare(`
    SELECT COUNT(*) as count FROM ${table} WHERE ${table} MATCH ?
  `).get(matchQuery) as { count: number };

  return row.count;
}

/**
 * Get search suggestions based on partial query
 */
export function getSuggestions(
  db: DatabaseInstance,
  partialQuery: string,
  limit: number = 5
): string[] {
  if (partialQuery.length < 2) {
    return [];
  }

  const escaped = escapeQuery(partialQuery);
  const matchQuery = `"${escaped}"*`;

  // Get unique entity names that match
  const rows = db.prepare(`
    SELECT DISTINCT e.name
    FROM entities_fts
    JOIN entities e ON entities_fts.rowid = e.id
    WHERE entities_fts MATCH ?
    ORDER BY bm25(entities_fts)
    LIMIT ?
  `).all(matchQuery, limit) as Array<{ name: string }>;

  return rows.map(r => r.name);
}
