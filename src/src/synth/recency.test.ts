/**
 * Recency-based section management tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  calculateAgeDays,
  getSectionForAge,
  categorizeItemsByAge,
  getItemsForEntity,
  updateEntityNoteSections,
  getEntityNotes,
  runWeeklySectionUpdate,
  getRecencyStats,
  SECTION_THRESHOLDS,
  type TimestampedItem,
} from './recency.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { ensureItemsTable } from '../item/idempotent.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('calculateAgeDays', () => {
  it('should calculate age in days', () => {
    const now = new Date('2026-02-15');
    const created = '2026-02-10';
    
    expect(calculateAgeDays(created, now)).toBe(5);
  });

  it('should return 0 for same day', () => {
    const now = new Date('2026-02-15');
    const created = '2026-02-15';
    
    expect(calculateAgeDays(created, now)).toBe(0);
  });

  it('should handle month boundaries', () => {
    const now = new Date('2026-02-05');
    const created = '2026-01-25';
    
    expect(calculateAgeDays(created, now)).toBe(11);
  });
});

describe('getSectionForAge', () => {
  it('should return hot for items <= 7 days old', () => {
    expect(getSectionForAge(0)).toBe('hot');
    expect(getSectionForAge(5)).toBe('hot');
    expect(getSectionForAge(7)).toBe('hot');
  });

  it('should return warm for items 8-30 days old', () => {
    expect(getSectionForAge(8)).toBe('warm');
    expect(getSectionForAge(15)).toBe('warm');
    expect(getSectionForAge(30)).toBe('warm');
  });

  it('should return cold for items > 30 days old', () => {
    expect(getSectionForAge(31)).toBe('cold');
    expect(getSectionForAge(100)).toBe('cold');
    expect(getSectionForAge(365)).toBe('cold');
  });
});

describe('categorizeItemsByAge', () => {
  it('should categorize items by age', () => {
    const now = new Date('2026-02-15');
    const items: TimestampedItem[] = [
      { id: 1, content: 'Hot item', itemType: 'fact', createdAt: '2026-02-14', sourceChunkId: 1 },
      { id: 2, content: 'Warm item', itemType: 'fact', createdAt: '2026-02-01', sourceChunkId: 1 },
      { id: 3, content: 'Cold item', itemType: 'fact', createdAt: '2026-01-01', sourceChunkId: 1 },
    ];

    const result = categorizeItemsByAge(items, now);

    expect(result.hot).toHaveLength(1);
    expect(result.warm).toHaveLength(1);
    expect(result.cold).toHaveLength(1);
    expect(result.hot[0]).toContain('Hot item');
  });

  it('should format items as list items', () => {
    const now = new Date('2026-02-15');
    const items: TimestampedItem[] = [
      { id: 1, content: 'Test content', itemType: 'fact', createdAt: '2026-02-14', sourceChunkId: 1 },
    ];

    const result = categorizeItemsByAge(items, now);

    expect(result.hot[0]).toBe('- Test content');
  });
});

describe('Database operations', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-recency-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '20_Concepts'), { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);

    // Add test source and chunks
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('test.md', 'test', 'markdown', 'hash', 100)
    `).run();
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'Test content', 1, 10)
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

  describe('getItemsForEntity', () => {
    it('should find items mentioning entity', () => {
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash)
        VALUES (1, 'fact', 'Test Entity is important', 'hash1')
      `).run();
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash)
        VALUES (1, 'fact', 'Something else', 'hash2')
      `).run();

      const items = getItemsForEntity(db, 'Test Entity');

      expect(items).toHaveLength(1);
      expect(items[0].content).toContain('Test Entity');
    });

    it('should return empty array for no matches', () => {
      const items = getItemsForEntity(db, 'Nonexistent');
      expect(items).toHaveLength(0);
    });
  });

  describe('getRecencyStats', () => {
    it('should return recency statistics', () => {
      const now = new Date('2026-02-15');
      
      // Hot item (recent)
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash, created_at)
        VALUES (1, 'fact', 'Hot', 'hash1', '2026-02-14')
      `).run();
      // Warm item
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash, created_at)
        VALUES (1, 'fact', 'Warm', 'hash2', '2026-02-01')
      `).run();
      // Cold item
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash, created_at)
        VALUES (1, 'fact', 'Cold', 'hash3', '2026-01-01')
      `).run();

      const stats = getRecencyStats(db, now);

      expect(stats.hot).toBe(1);
      expect(stats.warm).toBe(1);
      expect(stats.cold).toBe(1);
      expect(stats.total).toBe(3);
    });
  });
});

describe('Entity note operations', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-entity-recency-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '20_Concepts'), { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);

    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('test.md', 'test', 'markdown', 'hash', 100)
    `).run();
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'Content', 1, 10)
    `).run();
  });

  afterEach(async () => {
    closeDatabase(db);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('getEntityNotes', () => {
    it('should list entity notes', async () => {
      await writeFile(join(testDir, '20_Concepts', 'Entity A.md'), '# Entity A');
      await writeFile(join(testDir, '20_Concepts', 'Entity B.md'), '# Entity B');

      const notes = await getEntityNotes(testDir);

      expect(notes).toHaveLength(2);
      expect(notes).toContain('Entity A');
      expect(notes).toContain('Entity B');
    });

    it('should return empty for missing folder', async () => {
      const notes = await getEntityNotes('/nonexistent');
      expect(notes).toHaveLength(0);
    });
  });

  describe('updateEntityNoteSections', () => {
    it('should update note sections based on recency', async () => {
      // Create entity note
      const noteContent = `---
name: "Test Entity"
type: concept
aliases: []
tags: []
created: 2026-01-01
updated: 2026-01-15
sources: []
---

# Test Entity

## Hot

- Old hot item

## Warm

*No warm items yet*

## Cold

*No archived items*

## Backlinks

*No backlinks yet*
`;
      await writeFile(join(testDir, '20_Concepts', 'Test Entity.md'), noteContent);

      // Add items to database
      db.prepare(`
        INSERT INTO items (chunk_id, item_type, content, hash, created_at)
        VALUES (1, 'fact', 'Test Entity is great', 'hash1', '2026-02-14')
      `).run();

      const now = new Date('2026-02-15');
      const result = await updateEntityNoteSections(testDir, 'Test Entity', db, now);

      expect(result).not.toBeNull();
      expect(result?.entityName).toBe('Test Entity');

      // Read updated note
      const updated = await readFile(join(testDir, '20_Concepts', 'Test Entity.md'), 'utf-8');
      expect(updated).toContain('Test Entity is great');
    });

    it('should return null for non-existent note', async () => {
      const result = await updateEntityNoteSections(testDir, 'Nonexistent', db);
      expect(result).toBeNull();
    });
  });

  describe('runWeeklySectionUpdate', () => {
    it('should update all entity notes', async () => {
      // Create entity notes
      const noteContent = `---
name: "Entity"
type: concept
aliases: []
tags: []
created: 2026-01-01
updated: 2026-01-15
sources: []
---

# Entity

## Hot

*No hot items yet*

## Warm

*No warm items yet*

## Cold

*No archived items*

## Backlinks

*No backlinks yet*
`;
      await writeFile(join(testDir, '20_Concepts', 'Entity A.md'), noteContent.replace('Entity', 'Entity A'));
      await writeFile(join(testDir, '20_Concepts', 'Entity B.md'), noteContent.replace('Entity', 'Entity B'));

      const progressUpdates: string[] = [];
      const result = await runWeeklySectionUpdate(testDir, db, (current, total, name) => {
        if (name) progressUpdates.push(name);
      });

      expect(result.notesUpdated + result.notesSkipped).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(progressUpdates).toHaveLength(2);
    });
  });
});

describe('SECTION_THRESHOLDS', () => {
  it('should have correct values', () => {
    expect(SECTION_THRESHOLDS.hot).toBe(7);
    expect(SECTION_THRESHOLDS.warm).toBe(30);
    expect(SECTION_THRESHOLDS.cold).toBe(Infinity);
  });
});
