/**
 * Idempotent item creation module
 * Creates items with deterministic hash-based IDs for deduplication
 */

import { createHash } from 'crypto';
import type { DatabaseInstance } from '../db/connection.js';

/**
 * Item types
 */
export type ItemType = 'entity' | 'fact' | 'task' | 'insight' | 'note';

/**
 * Base item interface
 */
export interface BaseItem {
  type: ItemType;
  content: string;
  sourceChunkId?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Item with generated ID
 */
export interface ItemWithId extends BaseItem {
  id: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Upsert result
 */
export interface UpsertResult {
  id: string;
  created: boolean;
  updated: boolean;
}

/**
 * Generate deterministic hash for item content
 * Same input always produces same hash
 */
export function generateItemHash(item: BaseItem): string {
  const normalized = normalizeForHash(item);
  const hash = createHash('sha256');
  hash.update(normalized);
  return hash.digest('hex').substring(0, 16);
}

/**
 * Normalize item for consistent hashing
 */
function normalizeForHash(item: BaseItem): string {
  // Create a stable string representation
  const parts = [
    item.type,
    item.content.trim().toLowerCase(),
  ];
  
  // Include source chunk if present for uniqueness
  if (item.sourceChunkId !== undefined) {
    parts.push(`chunk:${item.sourceChunkId}`);
  }
  
  return parts.join('|');
}

/**
 * Generate deterministic ID from hash
 */
export function generateItemId(item: BaseItem): string {
  const hash = generateItemHash(item);
  const prefix = item.type.substring(0, 3);
  return `${prefix}_${hash}`;
}

/**
 * Create or update item in database
 * Works with existing schema (INTEGER id, chunk_id required)
 */
export function upsertItem(
  db: DatabaseInstance,
  item: BaseItem
): UpsertResult {
  const hash = generateItemHash(item);
  
  // Check if item with same hash exists
  const existing = db.prepare(`
    SELECT id, hash FROM items WHERE hash = ?
  `).get(hash) as { id: number; hash: string } | undefined;
  
  if (existing) {
    // Item exists with same hash - no update needed
    return { id: String(existing.id), created: false, updated: false };
  }
  
  // Create new item (chunk_id is required, default to 0 if not provided)
  const chunkId = item.sourceChunkId ?? 0;
  
  const result = db.prepare(`
    INSERT INTO items (chunk_id, item_type, content, hash, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    chunkId,
    item.type,
    item.content,
    hash,
    item.metadata ? JSON.stringify(item.metadata) : null
  );
  
  return { id: String(result.lastInsertRowid), created: true, updated: false };
}

/**
 * Batch upsert items
 */
export function upsertItems(
  db: DatabaseInstance,
  items: BaseItem[]
): { created: number; updated: number; unchanged: number } {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  
  const upsert = db.transaction(() => {
    for (const item of items) {
      const result = upsertItem(db, item);
      if (result.created) created++;
      else if (result.updated) updated++;
      else unchanged++;
    }
  });
  
  upsert();
  
  return { created, updated, unchanged };
}

/**
 * Get item by ID
 */
export function getItem(db: DatabaseInstance, id: string): ItemWithId | null {
  const row = db.prepare(`
    SELECT id, item_type, content, hash, chunk_id, metadata, created_at
    FROM items WHERE id = ?
  `).get(id) as {
    id: number;
    item_type: ItemType;
    content: string;
    hash: string | null;
    chunk_id: number;
    metadata: string | null;
    created_at: string;
  } | undefined;
  
  if (!row) return null;
  
  return {
    id: String(row.id),
    type: row.item_type,
    content: row.content,
    hash: row.hash || '',
    sourceChunkId: row.chunk_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

/**
 * Check if item exists
 */
export function itemExists(db: DatabaseInstance, id: string): boolean {
  const row = db.prepare('SELECT 1 FROM items WHERE id = ?').get(id);
  return row !== undefined;
}

/**
 * Get item by hash
 */
export function getItemByHash(db: DatabaseInstance, hash: string): ItemWithId | null {
  const row = db.prepare(`
    SELECT id, item_type, content, hash, chunk_id, metadata, created_at
    FROM items WHERE hash = ?
  `).get(hash) as {
    id: number;
    item_type: ItemType;
    content: string;
    hash: string | null;
    chunk_id: number;
    metadata: string | null;
    created_at: string;
  } | undefined;
  
  if (!row) return null;
  
  return {
    id: String(row.id),
    type: row.item_type,
    content: row.content,
    hash: row.hash || '',
    sourceChunkId: row.chunk_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

/**
 * Delete item by ID
 */
export function deleteItem(db: DatabaseInstance, id: string): boolean {
  const result = db.prepare('DELETE FROM items WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Get items by type
 */
export function getItemsByType(
  db: DatabaseInstance,
  type: ItemType,
  limit?: number
): ItemWithId[] {
  const sql = limit
    ? 'SELECT * FROM items WHERE item_type = ? LIMIT ?'
    : 'SELECT * FROM items WHERE item_type = ?';
    
  const rows = (limit
    ? db.prepare(sql).all(type, limit)
    : db.prepare(sql).all(type)
  ) as Array<{
    id: number;
    item_type: ItemType;
    content: string;
    hash: string | null;
    chunk_id: number;
    metadata: string | null;
    created_at: string;
  }>;
  
  return rows.map(row => ({
    id: String(row.id),
    type: row.item_type,
    content: row.content,
    hash: row.hash || '',
    sourceChunkId: row.chunk_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  }));
}

/**
 * Get items by source chunk
 */
export function getItemsByChunk(
  db: DatabaseInstance,
  chunkId: number
): ItemWithId[] {
  const rows = db.prepare(`
    SELECT * FROM items WHERE chunk_id = ?
  `).all(chunkId) as Array<{
    id: number;
    item_type: ItemType;
    content: string;
    hash: string | null;
    chunk_id: number;
    metadata: string | null;
    created_at: string;
  }>;
  
  return rows.map(row => ({
    id: String(row.id),
    type: row.item_type,
    content: row.content,
    hash: row.hash || '',
    sourceChunkId: row.chunk_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  }));
}

/**
 * Ensure items table has hash column for idempotency
 * Works with existing schema, adds hash column if missing
 */
export function ensureItemsTable(db: DatabaseInstance): void {
  // Check if hash column exists
  const columns = db.prepare("PRAGMA table_info(items)").all() as Array<{ name: string }>;
  const hasHash = columns.some(col => col.name === 'hash');
  
  if (!hasHash) {
    // Add hash column to existing table
    db.exec(`
      ALTER TABLE items ADD COLUMN hash TEXT;
      CREATE INDEX IF NOT EXISTS idx_items_hash ON items(hash);
    `);
  }
  
  // Ensure other indexes exist
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(item_type);
    CREATE INDEX IF NOT EXISTS idx_items_chunk ON items(chunk_id);
  `);
}
