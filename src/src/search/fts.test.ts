/**
 * FTS5 search tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  escapeQuery,
  buildMatchQuery,
  searchChunks,
  searchItems,
  searchEntities,
  search,
  countMatches,
  getSuggestions,
} from './fts.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('escapeQuery', () => {
  it('should escape double quotes', () => {
    expect(escapeQuery('hello "world"')).toBe('hello ""world""');
  });

  it('should remove special characters', () => {
    expect(escapeQuery('test*query')).toBe('testquery');
    expect(escapeQuery('(foo) bar')).toBe('foo bar');
  });

  it('should handle empty string', () => {
    expect(escapeQuery('')).toBe('');
  });
});

describe('buildMatchQuery', () => {
  it('should build prefix match query', () => {
    const query = buildMatchQuery('hello');
    expect(query).toContain('"hello"*');
  });

  it('should handle multiple words', () => {
    const query = buildMatchQuery('hello world');
    expect(query).toContain('"hello"*');
    expect(query).toContain('"world"*');
    expect(query).toContain('OR');
  });

  it('should return empty for empty query', () => {
    expect(buildMatchQuery('')).toBe('');
    expect(buildMatchQuery('   ')).toBe('');
  });
});

describe('FTS5 search integration', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-fts-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    
    // Insert test data
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('test.md', 'test-collection', 'markdown', 'abc123', 100)
    `).run();
    
    const sourceId = db.prepare('SELECT last_insert_rowid() as id').get() as { id: number };
    
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (?, 0, 'This is a test chunk about artificial intelligence and machine learning.', 1, 5)
    `).run(sourceId.id);
    
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (?, 1, 'Another chunk discussing natural language processing and deep learning.', 6, 10)
    `).run(sourceId.id);
    
    const chunkId = db.prepare('SELECT id FROM chunks LIMIT 1').get() as { id: number };
    
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content)
      VALUES (?, 'fact', 'Machine learning is a subset of artificial intelligence.')
    `).run(chunkId.id);
    
    db.prepare(`
      INSERT INTO entities (name, entity_type, description)
      VALUES ('Artificial Intelligence', 'concept', 'The simulation of human intelligence by machines.')
    `).run();
    
    db.prepare(`
      INSERT INTO entities (name, entity_type, description)
      VALUES ('Machine Learning', 'concept', 'A type of AI that learns from data.')
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

  describe('searchChunks', () => {
    it('should find chunks by content', () => {
      const results = searchChunks(db, 'artificial intelligence');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sourceType).toBe('chunk');
      expect(results[0].content).toContain('artificial intelligence');
    });

    it('should return highlighted content', () => {
      const results = searchChunks(db, 'machine learning');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].highlights[0]).toContain('<mark>');
    });

    it('should include source path', () => {
      const results = searchChunks(db, 'test');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sourcePath).toBe('test.md');
    });

    it('should include line numbers', () => {
      const results = searchChunks(db, 'test');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].startLine).toBeDefined();
      expect(results[0].endLine).toBeDefined();
    });

    it('should respect limit option', () => {
      const results = searchChunks(db, 'learning', { limit: 1 });
      
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should filter by collection', () => {
      const results = searchChunks(db, 'test', { collection: 'test-collection' });
      
      expect(results.length).toBeGreaterThan(0);
      
      const noResults = searchChunks(db, 'test', { collection: 'nonexistent' });
      expect(noResults.length).toBe(0);
    });

    it('should return empty for no matches', () => {
      const results = searchChunks(db, 'xyznonexistent');
      
      expect(results.length).toBe(0);
    });
  });

  describe('searchItems', () => {
    it('should find items by content', () => {
      const results = searchItems(db, 'machine learning');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sourceType).toBe('item');
    });

    it('should include item type', () => {
      const results = searchItems(db, 'machine');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].itemType).toBe('fact');
    });
  });

  describe('searchEntities', () => {
    it('should find entities by name', () => {
      const results = searchEntities(db, 'artificial');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].sourceType).toBe('entity');
      expect(results[0].name).toContain('Artificial');
    });

    it('should find entities by description', () => {
      const results = searchEntities(db, 'simulation');
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('should include entity type', () => {
      const results = searchEntities(db, 'intelligence');
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entityType).toBe('concept');
    });
  });

  describe('search (combined)', () => {
    it('should search across all types', () => {
      const results = search(db, 'machine learning');
      
      expect(results.length).toBeGreaterThan(0);
      
      const types = new Set(results.map(r => r.sourceType));
      expect(types.size).toBeGreaterThanOrEqual(1);
    });

    it('should filter by source type', () => {
      const chunkResults = search(db, 'learning', { sourceType: 'chunk' });
      expect(chunkResults.every(r => r.sourceType === 'chunk')).toBe(true);
      
      const entityResults = search(db, 'learning', { sourceType: 'entity' });
      expect(entityResults.every(r => r.sourceType === 'entity')).toBe(true);
    });

    it('should sort by relevance score', () => {
      const results = search(db, 'machine');
      
      if (results.length > 1) {
        for (let i = 1; i < results.length; i++) {
          expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
        }
      }
    });
  });

  describe('countMatches', () => {
    it('should count chunk matches', () => {
      const count = countMatches(db, 'learning', 'chunk');
      expect(count).toBeGreaterThan(0);
    });

    it('should count entity matches', () => {
      const count = countMatches(db, 'artificial', 'entity');
      expect(count).toBeGreaterThan(0);
    });

    it('should return 0 for no matches', () => {
      const count = countMatches(db, 'xyznonexistent', 'chunk');
      expect(count).toBe(0);
    });
  });

  describe('getSuggestions', () => {
    it('should return entity name suggestions', () => {
      const suggestions = getSuggestions(db, 'art');
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toContain('Artificial');
    });

    it('should return empty for short query', () => {
      const suggestions = getSuggestions(db, 'a');
      expect(suggestions.length).toBe(0);
    });

    it('should respect limit', () => {
      const suggestions = getSuggestions(db, 'ma', 1);
      expect(suggestions.length).toBeLessThanOrEqual(1);
    });
  });
});
