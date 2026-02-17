/**
 * Idempotent item creation tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateItemHash,
  generateItemId,
  upsertItem,
  upsertItems,
  getItem,
  itemExists,
  getItemByHash,
  deleteItem,
  getItemsByType,
  ensureItemsTable,
  type BaseItem,
} from './idempotent.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('generateItemHash', () => {
  it('should generate same hash for same content', () => {
    const item1: BaseItem = { type: 'entity', content: 'Test Entity' };
    const item2: BaseItem = { type: 'entity', content: 'Test Entity' };

    expect(generateItemHash(item1)).toBe(generateItemHash(item2));
  });

  it('should generate different hash for different content', () => {
    const item1: BaseItem = { type: 'entity', content: 'Entity A' };
    const item2: BaseItem = { type: 'entity', content: 'Entity B' };

    expect(generateItemHash(item1)).not.toBe(generateItemHash(item2));
  });

  it('should generate different hash for different types', () => {
    const item1: BaseItem = { type: 'entity', content: 'Same' };
    const item2: BaseItem = { type: 'fact', content: 'Same' };

    expect(generateItemHash(item1)).not.toBe(generateItemHash(item2));
  });

  it('should normalize whitespace and case', () => {
    const item1: BaseItem = { type: 'entity', content: 'Test Entity' };
    const item2: BaseItem = { type: 'entity', content: '  TEST ENTITY  ' };

    expect(generateItemHash(item1)).toBe(generateItemHash(item2));
  });

  it('should include source chunk in hash', () => {
    const item1: BaseItem = { type: 'entity', content: 'Test', sourceChunkId: 1 };
    const item2: BaseItem = { type: 'entity', content: 'Test', sourceChunkId: 2 };

    expect(generateItemHash(item1)).not.toBe(generateItemHash(item2));
  });
});

describe('generateItemId', () => {
  it('should generate ID with type prefix', () => {
    const item: BaseItem = { type: 'entity', content: 'Test' };
    const id = generateItemId(item);

    expect(id).toMatch(/^ent_[a-f0-9]{16}$/);
  });

  it('should generate same ID for same content', () => {
    const item1: BaseItem = { type: 'fact', content: 'A fact' };
    const item2: BaseItem = { type: 'fact', content: 'A fact' };

    expect(generateItemId(item1)).toBe(generateItemId(item2));
  });

  it('should use correct prefix for each type', () => {
    expect(generateItemId({ type: 'entity', content: 'x' })).toMatch(/^ent_/);
    expect(generateItemId({ type: 'fact', content: 'x' })).toMatch(/^fac_/);
    expect(generateItemId({ type: 'task', content: 'x' })).toMatch(/^tas_/);
    expect(generateItemId({ type: 'insight', content: 'x' })).toMatch(/^ins_/);
  });
});

describe('Database operations', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-item-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;

    // Ensure items table has hash column
    ensureItemsTable(db);
    
    // Create a source and chunk for foreign key constraint
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('test.md', 'test', 'markdown', 'abc123', 100)
    `).run();
    
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'Test chunk content', 1, 10)
    `).run();
  });

  afterEach(async () => {
    closeDatabase(db);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('upsertItem', () => {
    it('should create new item', () => {
      const item: BaseItem = { type: 'entity', content: 'New Entity', sourceChunkId: 1 };
      const result = upsertItem(db, item);

      expect(result.created).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.id).toBeDefined();
    });

    it('should not duplicate on rerun', () => {
      const item: BaseItem = { type: 'entity', content: 'Same Entity', sourceChunkId: 1 };

      const result1 = upsertItem(db, item);
      const result2 = upsertItem(db, item);

      expect(result1.created).toBe(true);
      expect(result2.created).toBe(false);
      expect(result2.updated).toBe(false);
      expect(result1.id).toBe(result2.id);
    });

    it('should return same ID for same content hash', () => {
      const item1: BaseItem = { type: 'entity', content: 'entity', sourceChunkId: 1, metadata: { version: 1 } };
      const result1 = upsertItem(db, item1);

      // Same logical item but different metadata - same hash
      const item2: BaseItem = { type: 'entity', content: 'entity', sourceChunkId: 1, metadata: { version: 2 } };
      const result2 = upsertItem(db, item2);

      // Should be unchanged since content hash is the same
      expect(result2.created).toBe(false);
      expect(result1.id).toBe(result2.id);
    });

    it('should store metadata', () => {
      const item: BaseItem = {
        type: 'entity',
        content: 'With Metadata',
        sourceChunkId: 1,
        metadata: { key: 'value' },
      };

      const result = upsertItem(db, item);
      const retrieved = getItem(db, result.id);

      expect(retrieved?.metadata).toEqual({ key: 'value' });
    });
  });

  describe('upsertItems', () => {
    it('should batch insert items', () => {
      const items: BaseItem[] = [
        { type: 'entity', content: 'Entity 1', sourceChunkId: 1 },
        { type: 'entity', content: 'Entity 2', sourceChunkId: 1 },
        { type: 'fact', content: 'Fact 1', sourceChunkId: 1 },
      ];

      const result = upsertItems(db, items);

      expect(result.created).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);
    });

    it('should count unchanged items on rerun', () => {
      const items: BaseItem[] = [
        { type: 'entity', content: 'Entity 1', sourceChunkId: 1 },
        { type: 'entity', content: 'Entity 2', sourceChunkId: 1 },
      ];

      upsertItems(db, items);
      const result = upsertItems(db, items);

      expect(result.created).toBe(0);
      expect(result.unchanged).toBe(2);
    });
  });

  describe('getItem', () => {
    it('should retrieve item by ID', () => {
      const item: BaseItem = { type: 'fact', content: 'A fact to retrieve', sourceChunkId: 1 };
      const { id } = upsertItem(db, item);

      const retrieved = getItem(db, id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe('A fact to retrieve');
      expect(retrieved?.type).toBe('fact');
    });

    it('should return null for non-existent ID', () => {
      const retrieved = getItem(db, '999999');
      expect(retrieved).toBeNull();
    });
  });

  describe('itemExists', () => {
    it('should return true for existing item', () => {
      const item: BaseItem = { type: 'entity', content: 'Exists', sourceChunkId: 1 };
      const { id } = upsertItem(db, item);

      expect(itemExists(db, id)).toBe(true);
    });

    it('should return false for non-existent item', () => {
      expect(itemExists(db, '999999')).toBe(false);
    });
  });

  describe('getItemByHash', () => {
    it('should retrieve item by hash', () => {
      const item: BaseItem = { type: 'entity', content: 'Hash lookup', sourceChunkId: 1 };
      upsertItem(db, item);

      const hash = generateItemHash(item);
      const retrieved = getItemByHash(db, hash);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe('Hash lookup');
    });
  });

  describe('deleteItem', () => {
    it('should delete existing item', () => {
      const item: BaseItem = { type: 'entity', content: 'To Delete', sourceChunkId: 1 };
      const { id } = upsertItem(db, item);

      const deleted = deleteItem(db, id);

      expect(deleted).toBe(true);
      expect(itemExists(db, id)).toBe(false);
    });

    it('should return false for non-existent item', () => {
      expect(deleteItem(db, '999999')).toBe(false);
    });
  });

  describe('getItemsByType', () => {
    it('should retrieve items by type', () => {
      const items: BaseItem[] = [
        { type: 'entity', content: 'E1', sourceChunkId: 1 },
        { type: 'entity', content: 'E2', sourceChunkId: 1 },
        { type: 'fact', content: 'F1', sourceChunkId: 1 },
      ];
      upsertItems(db, items);

      const entities = getItemsByType(db, 'entity');
      const facts = getItemsByType(db, 'fact');

      expect(entities).toHaveLength(2);
      expect(facts).toHaveLength(1);
    });

    it('should respect limit', () => {
      const items: BaseItem[] = [
        { type: 'entity', content: 'E1', sourceChunkId: 1 },
        { type: 'entity', content: 'E2', sourceChunkId: 1 },
        { type: 'entity', content: 'E3', sourceChunkId: 1 },
      ];
      upsertItems(db, items);

      const limited = getItemsByType(db, 'entity', 2);

      expect(limited).toHaveLength(2);
    });
  });
});
