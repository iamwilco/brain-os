/**
 * Extraction pipeline tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getSourcesToExtract,
  getChunksForSource,
  markSourceExtracted,
  extractFromChunks,
  saveExtractionResults,
  runExtractionPipeline,
  getExtractionStats,
  ensureExtractedAtColumn,
} from './extract.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { ensureItemsTable } from '../item/idempotent.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('getSourcesToExtract', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-extract-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);
    ensureExtractedAtColumn(db);

    // Add test sources
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('doc1.md', 'test', 'markdown', 'hash1', 100)
    `).run();
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('doc2.md', 'test', 'markdown', 'hash2', 200)
    `).run();
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size, extracted_at)
      VALUES ('doc3.md', 'other', 'markdown', 'hash3', 300, '2026-01-01')
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

  it('should get unextracted sources', () => {
    const sources = getSourcesToExtract(db, { vaultPath: testDir });
    expect(sources).toHaveLength(2);
    expect(sources[0].path).toBe('doc1.md');
  });

  it('should filter by collection', () => {
    const sources = getSourcesToExtract(db, { vaultPath: testDir, collection: 'other' });
    expect(sources).toHaveLength(0); // doc3 is already extracted
  });

  it('should respect limit', () => {
    const sources = getSourcesToExtract(db, { vaultPath: testDir, limit: 1 });
    expect(sources).toHaveLength(1);
  });

  it('should filter by since date', () => {
    const sources = getSourcesToExtract(db, { vaultPath: testDir, since: '2026-01-15' });
    // doc3 was extracted before 2026-01-15, so it should be included for re-extraction
    expect(sources.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getChunksForSource', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-chunks-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;

    // Add source and chunks
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('doc.md', 'test', 'markdown', 'hash', 100)
    `).run();
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'First chunk content', 1, 10)
    `).run();
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 1, 'Second chunk content', 11, 20)
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

  it('should get chunks for source in order', () => {
    const chunks = getChunksForSource(db, 1);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].chunk_index).toBe(0);
    expect(chunks[1].chunk_index).toBe(1);
  });

  it('should return empty array for non-existent source', () => {
    const chunks = getChunksForSource(db, 999);
    expect(chunks).toHaveLength(0);
  });
});

describe('markSourceExtracted', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-mark-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureExtractedAtColumn(db);

    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('doc.md', 'test', 'markdown', 'hash', 100)
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

  it('should mark source as extracted', () => {
    markSourceExtracted(db, 1);

    const source = db.prepare('SELECT extracted_at FROM sources WHERE id = 1').get() as { extracted_at: string };
    expect(source.extracted_at).not.toBeNull();
  });
});

describe('extractFromChunks', () => {
  it('should extract entities from content', () => {
    const chunks = [
      { id: 1, source_id: 1, content: 'John Smith works at Acme Corporation.', chunk_index: 0 },
    ];

    const result = extractFromChunks(chunks);

    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities.some(e => e.name === 'John Smith' || e.name === 'Acme Corporation')).toBe(true);
  });

  it('should extract facts from content', () => {
    const chunks = [
      { id: 1, source_id: 1, content: 'The project is successful. Testing is important for quality.', chunk_index: 0 },
    ];

    const result = extractFromChunks(chunks);

    expect(result.facts.length).toBeGreaterThan(0);
  });

  it('should extract tasks from content', () => {
    const chunks = [
      { id: 1, source_id: 1, content: 'TODO: Fix the bug\nACTION: Review the code', chunk_index: 0 },
    ];

    const result = extractFromChunks(chunks);

    expect(result.tasks.length).toBe(2);
  });

  it('should generate summary', () => {
    const chunks = [
      { id: 1, source_id: 1, content: 'This is the main topic of discussion. More details follow.', chunk_index: 0 },
    ];

    const result = extractFromChunks(chunks);

    expect(result.summary).toBeTruthy();
  });
});

describe('saveExtractionResults', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-save-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);

    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('doc.md', 'test', 'markdown', 'hash', 100)
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

  it('should save extraction results', () => {
    const extraction = {
      summary: 'Test summary',
      entities: [{ name: 'Test Entity', type: 'concept' }],
      facts: [{ content: 'Test fact', confidence: 0.8 }],
      tasks: [{ content: 'Test task' }],
      insights: [{ content: 'Test insight' }],
    };

    const result = saveExtractionResults(db, 1, 1, extraction);

    expect(result.entities).toBe(1);
    expect(result.facts).toBe(1);
    expect(result.tasks).toBe(1);
    expect(result.insights).toBe(1);

    const items = db.prepare('SELECT * FROM items').all();
    expect(items).toHaveLength(4);
  });

  it('should not duplicate items', () => {
    const extraction = {
      summary: 'Test',
      entities: [{ name: 'Same Entity', type: 'concept' }],
      facts: [],
      tasks: [],
      insights: [],
    };

    saveExtractionResults(db, 1, 1, extraction);
    const result = saveExtractionResults(db, 1, 1, extraction);

    expect(result.entities).toBe(0);

    const items = db.prepare('SELECT * FROM items').all();
    expect(items).toHaveLength(1);
  });
});

describe('getExtractionStats', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-stats-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);
    ensureExtractedAtColumn(db);

    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('doc1.md', 'test', 'markdown', 'hash1', 100)
    `).run();
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size, extracted_at)
      VALUES ('doc2.md', 'test', 'markdown', 'hash2', 200, '2026-01-01')
    `).run();

    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'Content', 1, 10)
    `).run();
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content, hash)
      VALUES (1, 'entity', 'Test', 'hash1')
    `).run();
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content, hash)
      VALUES (1, 'fact', 'Fact', 'hash2')
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

  it('should return extraction stats', () => {
    const stats = getExtractionStats(db);

    expect(stats.totalSources).toBe(2);
    expect(stats.extractedSources).toBe(1);
    expect(stats.pendingSources).toBe(1);
    expect(stats.totalItems).toBe(2);
    expect(stats.itemsByType.entity).toBe(1);
    expect(stats.itemsByType.fact).toBe(1);
  });
});

describe('runExtractionPipeline', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-pipeline-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '20_Concepts'), { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);
    ensureExtractedAtColumn(db);

    // Create source file
    await writeFile(join(testDir, 'doc.md'), `---
title: Test Doc
---

# Test Document

This is a test document about Software Development.`);

    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('doc.md', 'test', 'markdown', 'hash', 100)
    `).run();
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'This is a test document about Software Development.', 1, 10)
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

  it('should run extraction pipeline', async () => {
    const progressUpdates: string[] = [];

    const result = await runExtractionPipeline(db, {
      vaultPath: testDir,
      onProgress: (p) => progressUpdates.push(p.phase),
    });

    expect(result.sourcesProcessed).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(progressUpdates).toContain('scanning');
    expect(progressUpdates).toContain('extracting');
    expect(progressUpdates).toContain('complete');
  });

  it('should respect dry run option', async () => {
    const result = await runExtractionPipeline(db, {
      vaultPath: testDir,
      dryRun: true,
    });

    expect(result.sourcesProcessed).toBe(1);

    // Source should not be marked as extracted
    const source = db.prepare('SELECT extracted_at FROM sources WHERE id = 1').get() as { extracted_at: string | null };
    expect(source.extracted_at).toBeNull();
  });

  it('should return early if no sources to extract', async () => {
    // Mark all sources as extracted
    db.prepare("UPDATE sources SET extracted_at = datetime('now')").run();

    const result = await runExtractionPipeline(db, { vaultPath: testDir });

    expect(result.sourcesProcessed).toBe(0);
  });
});
