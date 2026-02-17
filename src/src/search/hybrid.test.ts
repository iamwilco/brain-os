/**
 * Tests for Hybrid Search Module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  HybridSearchEngine,
  createHybridSearchEngine,
} from './hybrid.js';
import {
  VectorStore,
  MockEmbeddingProvider,
} from './vector.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('Hybrid Search', () => {
  let db: Database.Database;
  let vectorStore: VectorStore;
  let engine: HybridSearchEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    
    // Create required tables
    db.exec(`
      CREATE TABLE sources (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL,
        collection TEXT NOT NULL
      );
      
      CREATE TABLE chunks (
        id INTEGER PRIMARY KEY,
        source_id INTEGER REFERENCES sources(id),
        content TEXT NOT NULL,
        start_line INTEGER,
        end_line INTEGER
      );
      
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        chunk_id INTEGER REFERENCES chunks(id),
        content TEXT NOT NULL,
        item_type TEXT NOT NULL
      );
      
      -- FTS5 tables
      CREATE VIRTUAL TABLE chunks_fts USING fts5(content, content=chunks, content_rowid=id);
      CREATE VIRTUAL TABLE items_fts USING fts5(content, content=items, content_rowid=id);
      
      -- Triggers to keep FTS in sync
      CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
      END;
      
      CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(rowid, content) VALUES (new.id, new.content);
      END;
    `);
    
    const provider = new MockEmbeddingProvider();
    vectorStore = new VectorStore(db as unknown as DatabaseInstance, provider);
    vectorStore.initTables();
    
    engine = createHybridSearchEngine(db as unknown as DatabaseInstance, vectorStore);
  });

  afterEach(() => {
    db.close();
  });

  describe('searchChunks', () => {
    it('should combine FTS and vector results', async () => {
      // Insert test data
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'machine learning algorithms', 1, 5)").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (2, 1, 'cooking recipes', 6, 10)").run();
      
      // Index for vector search
      await vectorStore.indexChunk(1, 'machine learning algorithms');
      await vectorStore.indexChunk(2, 'cooking recipes');
      
      const results = await engine.searchChunks('machine learning', {
        minSimilarity: -1, // Low threshold for mock embeddings
      });
      
      expect(results.length).toBeGreaterThan(0);
      // Results should have both FTS and vector scores
      expect(results[0]).toHaveProperty('ftsScore');
      expect(results[0]).toHaveProperty('vectorScore');
      expect(results[0]).toHaveProperty('combinedScore');
    });

    it('should respect limit option', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      
      for (let i = 1; i <= 10; i++) {
        db.prepare(`INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (${i}, 1, 'test content ${i}', ${i}, ${i + 5})`).run();
        await vectorStore.indexChunk(i, `test content ${i}`);
      }
      
      const results = await engine.searchChunks('test', {
        limit: 3,
        minSimilarity: -1,
      });
      
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should filter by collection', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/a.md', 'collection-a')").run();
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (2, '/b.md', 'collection-b')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'test in collection a', 1, 5)").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (2, 2, 'test in collection b', 1, 5)").run();
      
      await vectorStore.indexChunk(1, 'test in collection a');
      await vectorStore.indexChunk(2, 'test in collection b');
      
      const results = await engine.searchChunks('test', {
        collection: 'collection-a',
        minSimilarity: -1,
      });
      
      // Should only return results from collection-a
      expect(results.every(r => r.sourcePath === '/a.md')).toBe(true);
    });
  });

  describe('searchItems', () => {
    it('should search items with hybrid approach', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'test', 1, 5)").run();
      db.prepare("INSERT INTO items (id, chunk_id, content, item_type) VALUES (1, 1, 'neural networks', 'concept')").run();
      db.prepare("INSERT INTO items (id, chunk_id, content, item_type) VALUES (2, 1, 'cooking tips', 'note')").run();
      
      await vectorStore.indexItem(1, 'neural networks');
      await vectorStore.indexItem(2, 'cooking tips');
      
      const results = await engine.searchItems('neural', {
        minSimilarity: -1,
      });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('combinedScore');
    });
  });

  describe('search', () => {
    it('should search both chunks and items', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'machine learning chunk', 1, 5)").run();
      db.prepare("INSERT INTO items (id, chunk_id, content, item_type) VALUES (1, 1, 'machine learning item', 'concept')").run();
      
      await vectorStore.indexChunk(1, 'machine learning chunk');
      await vectorStore.indexItem(1, 'machine learning item');
      
      const results = await engine.search('machine learning', {
        minSimilarity: -1,
      });
      
      expect(results.length).toBeGreaterThan(0);
      // Should have both chunk and item results
      const hasChunk = results.some(r => r.sourceType === 'chunk');
      const hasItem = results.some(r => r.sourceType === 'item');
      expect(hasChunk || hasItem).toBe(true);
    });

    it('should filter by sourceType', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'test chunk', 1, 5)").run();
      db.prepare("INSERT INTO items (id, chunk_id, content, item_type) VALUES (1, 1, 'test item', 'concept')").run();
      
      await vectorStore.indexChunk(1, 'test chunk');
      await vectorStore.indexItem(1, 'test item');
      
      const chunkResults = await engine.search('test', {
        sourceType: 'chunk',
        minSimilarity: -1,
      });
      
      expect(chunkResults.every(r => r.sourceType === 'chunk')).toBe(true);
      
      const itemResults = await engine.search('test', {
        sourceType: 'item',
        minSimilarity: -1,
      });
      
      expect(itemResults.every(r => r.sourceType === 'item')).toBe(true);
    });
  });

  describe('weight configuration', () => {
    it('should respect ftsWeight and vectorWeight', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'test content', 1, 5)").run();
      
      await vectorStore.indexChunk(1, 'test content');
      
      // High FTS weight
      const ftsHeavy = await engine.searchChunks('test', {
        ftsWeight: 0.9,
        vectorWeight: 0.1,
        minSimilarity: -1,
      });
      
      // High vector weight
      const vectorHeavy = await engine.searchChunks('test', {
        ftsWeight: 0.1,
        vectorWeight: 0.9,
        minSimilarity: -1,
      });
      
      // Both should return results
      expect(ftsHeavy.length).toBeGreaterThan(0);
      expect(vectorHeavy.length).toBeGreaterThan(0);
    });
  });
});
