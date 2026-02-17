/**
 * Indexer tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseScope,
  indexSources,
  getIndexStats,
} from './indexer.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('parseScope', () => {
  it('should parse "all" scope', () => {
    expect(parseScope('all')).toEqual({ type: 'all', value: '' });
    expect(parseScope('')).toEqual({ type: 'all', value: '' });
  });

  it('should parse collection scope', () => {
    expect(parseScope('collection:chatgpt')).toEqual({ 
      type: 'collection', 
      value: 'chatgpt' 
    });
  });

  it('should parse path scope', () => {
    expect(parseScope('path:*.md')).toEqual({ 
      type: 'path', 
      value: '*.md' 
    });
  });

  it('should default to path for unknown format', () => {
    expect(parseScope('*.txt')).toEqual({ 
      type: 'path', 
      value: '*.txt' 
    });
  });
});

describe('indexSources', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-indexer-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create sources directory
    const sourcesDir = join(testDir, '70_Sources');
    await mkdir(sourcesDir, { recursive: true });
    
    // Create test files
    await writeFile(
      join(sourcesDir, 'test1.md'),
      '# Test Document\n\nThis is a test markdown file with some content.'
    );
    await writeFile(
      join(sourcesDir, 'test2.txt'),
      'This is a plain text file.\nIt has multiple lines.\nFor testing purposes.'
    );
    
    // Create nested directory
    const nestedDir = join(sourcesDir, 'nested');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(
      join(nestedDir, 'nested.md'),
      '# Nested File\n\nThis file is in a subdirectory.'
    );
    
    // Initialize database
    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
  });

  afterEach(async () => {
    closeDatabase(db);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should index all files in sources directory', async () => {
    const result = await indexSources(db, {
      vaultPath: testDir,
    });
    
    expect(result.filesScanned).toBe(3);
    expect(result.filesIndexed).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it('should create chunks for indexed files', async () => {
    const result = await indexSources(db, {
      vaultPath: testDir,
    });
    
    expect(result.chunksCreated).toBeGreaterThan(0);
  });

  it('should skip already indexed files with same hash', async () => {
    // Index first time
    await indexSources(db, { vaultPath: testDir });
    
    // Index again
    const result = await indexSources(db, { vaultPath: testDir });
    
    expect(result.filesSkipped).toBe(3);
    expect(result.filesIndexed).toBe(0);
  });

  it('should detect and remove deleted files', async () => {
    // Index first time
    await indexSources(db, { vaultPath: testDir });
    
    // Delete a file
    const sourcesDir = join(testDir, '70_Sources');
    await rm(join(sourcesDir, 'test1.md'));
    
    // Index again
    const result = await indexSources(db, { vaultPath: testDir });
    
    expect(result.filesDeleted).toBe(1);
    expect(result.chunksDeleted).toBeGreaterThan(0);
  });

  it('should track chunks deleted', async () => {
    // Index first time
    const firstResult = await indexSources(db, { vaultPath: testDir });
    const initialChunks = firstResult.chunksCreated;
    
    // Delete all files
    const sourcesDir = join(testDir, '70_Sources');
    await rm(sourcesDir, { recursive: true });
    await mkdir(sourcesDir, { recursive: true });
    
    // Index again
    const result = await indexSources(db, { vaultPath: testDir });
    
    expect(result.filesDeleted).toBe(3);
    expect(result.chunksDeleted).toBe(initialChunks);
  });

  it('should report progress', async () => {
    const progress: Array<{ phase: string; current: number }> = [];
    
    await indexSources(db, {
      vaultPath: testDir,
      onProgress: (p) => progress.push({ phase: p.phase, current: p.current }),
    });
    
    expect(progress.some(p => p.phase === 'scanning')).toBe(true);
    expect(progress.some(p => p.phase === 'indexing')).toBe(true);
    expect(progress.some(p => p.phase === 'complete')).toBe(true);
  });

  it('should filter by path scope', async () => {
    const result = await indexSources(db, {
      vaultPath: testDir,
      scope: 'path:*.md',
    });
    
    expect(result.filesIndexed).toBe(2); // test1.md and nested/nested.md
  });

  it('should handle empty sources directory', async () => {
    const emptyDir = join(testDir, 'empty');
    await mkdir(emptyDir, { recursive: true });
    
    const result = await indexSources(db, {
      vaultPath: testDir,
      sourcesPath: emptyDir,
    });
    
    expect(result.filesScanned).toBe(0);
    expect(result.filesIndexed).toBe(0);
  });

  it('should handle non-existent sources directory', async () => {
    const result = await indexSources(db, {
      vaultPath: testDir,
      sourcesPath: join(testDir, 'nonexistent'),
    });
    
    expect(result.filesScanned).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should record duration', async () => {
    const result = await indexSources(db, {
      vaultPath: testDir,
    });
    
    expect(result.duration).toBeGreaterThan(0);
  });
});

describe('getIndexStats', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-stats-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    const sourcesDir = join(testDir, '70_Sources');
    await mkdir(sourcesDir, { recursive: true });
    await writeFile(join(sourcesDir, 'test.md'), '# Test\n\nContent here.');
    
    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
  });

  afterEach(async () => {
    closeDatabase(db);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should return zero stats for empty index', () => {
    const stats = getIndexStats(db);
    
    expect(stats.sources).toBe(0);
    expect(stats.chunks).toBe(0);
    expect(stats.collections).toHaveLength(0);
  });

  it('should return correct stats after indexing', async () => {
    await indexSources(db, { vaultPath: testDir, collection: 'test-coll' });
    
    const stats = getIndexStats(db);
    
    expect(stats.sources).toBe(1);
    expect(stats.chunks).toBeGreaterThan(0);
    expect(stats.collections).toContain('test-coll');
  });
});
