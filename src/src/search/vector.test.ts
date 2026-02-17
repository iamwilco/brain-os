/**
 * Tests for Vector Search Module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  cosineSimilarity,
  normalizeVector,
  serializeEmbedding,
  deserializeEmbedding,
  MockEmbeddingProvider,
  VectorStore,
  createVectorStore,
  type EmbeddingVector,
} from './vector.js';

describe('Vector Search', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const v = [1, 2, 3];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should throw for mismatched dimensions', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => cosineSimilarity(a, b)).toThrow('dimension mismatch');
    });
  });

  describe('normalizeVector', () => {
    it('should normalize to unit length', () => {
      const v = [3, 4];
      const normalized = normalizeVector(v);
      const length = Math.sqrt(normalized.reduce((sum, x) => sum + x * x, 0));
      expect(length).toBeCloseTo(1, 5);
    });

    it('should handle zero vector', () => {
      const v = [0, 0, 0];
      const normalized = normalizeVector(v);
      expect(normalized).toEqual([0, 0, 0]);
    });
  });

  describe('serializeEmbedding / deserializeEmbedding', () => {
    it('should round-trip embedding', () => {
      const embedding: EmbeddingVector = [0.1, 0.2, -0.3, 0.4];
      const serialized = serializeEmbedding(embedding);
      const deserialized = deserializeEmbedding(serialized);
      
      expect(deserialized.length).toBe(embedding.length);
      for (let i = 0; i < embedding.length; i++) {
        expect(deserialized[i]).toBeCloseTo(embedding[i], 5);
      }
    });
  });

  describe('MockEmbeddingProvider', () => {
    it('should generate consistent embeddings', async () => {
      const provider = new MockEmbeddingProvider();
      const text = 'hello world';
      
      const embedding1 = await provider.embed(text);
      const embedding2 = await provider.embed(text);
      
      expect(embedding1).toEqual(embedding2);
    });

    it('should generate normalized embeddings', async () => {
      const provider = new MockEmbeddingProvider();
      const embedding = await provider.embed('test');
      
      const length = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
      expect(length).toBeCloseTo(1, 5);
    });

    it('should generate different embeddings for different text', async () => {
      const provider = new MockEmbeddingProvider();
      const e1 = await provider.embed('hello');
      const e2 = await provider.embed('world');
      
      expect(e1).not.toEqual(e2);
    });

    it('should batch embed', async () => {
      const provider = new MockEmbeddingProvider();
      const texts = ['hello', 'world', 'test'];
      const embeddings = await provider.embedBatch(texts);
      
      expect(embeddings.length).toBe(3);
      expect(embeddings[0]).toEqual(await provider.embed('hello'));
    });
  });

  describe('VectorStore', () => {
    let db: Database.Database;
    let store: VectorStore;

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
      `);
      
      store = createVectorStore(db as unknown as import('../db/connection.js').DatabaseInstance);
      store.initTables();
    });

    afterEach(() => {
      db.close();
    });

    it('should initialize tables', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%embeddings'
      `).all() as Array<{ name: string }>;
      
      expect(tables.map(t => t.name)).toContain('chunk_embeddings');
      expect(tables.map(t => t.name)).toContain('item_embeddings');
      expect(tables.map(t => t.name)).toContain('memory_embeddings');
    });

    it('should index and search chunks', async () => {
      // Insert test data
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'machine learning algorithms', 1, 5)").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (2, 1, 'cooking recipes for dinner', 6, 10)").run();
      
      await store.indexChunk(1, 'machine learning algorithms');
      await store.indexChunk(2, 'cooking recipes for dinner');
      
      const results = await store.searchChunks('machine learning', { minSimilarity: 0 });
      
      expect(results.length).toBeGreaterThan(0);
      // The ML chunk should rank higher for ML query
      const mlResult = results.find(r => r.id === 1);
      const cookingResult = results.find(r => r.id === 2);
      
      if (mlResult && cookingResult) {
        expect(mlResult.similarity).toBeGreaterThan(cookingResult.similarity);
      }
    });

    it('should index and search items', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'test', 1, 5)").run();
      db.prepare("INSERT INTO items (id, chunk_id, content, item_type) VALUES (1, 1, 'neural networks', 'concept')").run();
      
      await store.indexItem(1, 'neural networks');
      
      // Use negative threshold to get all results (mock embeddings are pseudo-random)
      const results = await store.searchItems('query', { minSimilarity: -1 });
      expect(results.length).toBe(1);
      expect(results[0].itemType).toBe('concept');
    });

    it('should index and search memory', async () => {
      await store.indexMemory('admin', 'preferences', 'User prefers dark mode');
      await store.indexMemory('admin', 'context', 'Working on Brain project');
      
      // Search with negative threshold to get all results (mock embeddings are pseudo-random)
      const results = await store.searchMemory('test query', 'admin', { minSimilarity: -1, limit: 10 });
      
      // Should return both memories
      expect(results.length).toBe(2);
      expect(results.some(r => r.section === 'preferences')).toBe(true);
      expect(results.some(r => r.section === 'context')).toBe(true);
    });

    it('should batch index chunks', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'chunk 1', 1, 5)").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (2, 1, 'chunk 2', 6, 10)").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (3, 1, 'chunk 3', 11, 15)").run();
      
      await store.indexChunksBatch([
        { id: 1, content: 'chunk 1' },
        { id: 2, content: 'chunk 2' },
        { id: 3, content: 'chunk 3' },
      ]);
      
      const stats = store.getStats();
      expect(stats.chunkEmbeddings).toBe(3);
    });

    it('should get stats', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'test', 1, 5)").run();
      db.prepare("INSERT INTO items (id, chunk_id, content, item_type) VALUES (1, 1, 'test', 'concept')").run();
      
      await store.indexChunk(1, 'test chunk');
      await store.indexItem(1, 'test item');
      await store.indexMemory('admin', 'test', 'test memory');
      
      const stats = store.getStats();
      
      expect(stats.chunkEmbeddings).toBe(1);
      expect(stats.itemEmbeddings).toBe(1);
      expect(stats.memoryEmbeddings).toBe(1);
    });

    it('should delete embeddings', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'test', 1, 5)").run();
      
      await store.indexChunk(1, 'test');
      expect(store.getStats().chunkEmbeddings).toBe(1);
      
      store.deleteChunkEmbedding(1);
      expect(store.getStats().chunkEmbeddings).toBe(0);
    });

    it('should clear all embeddings', async () => {
      db.prepare("INSERT INTO sources (id, path, collection) VALUES (1, '/test.md', 'test')").run();
      db.prepare("INSERT INTO chunks (id, source_id, content, start_line, end_line) VALUES (1, 1, 'test', 1, 5)").run();
      db.prepare("INSERT INTO items (id, chunk_id, content, item_type) VALUES (1, 1, 'test', 'concept')").run();
      
      await store.indexChunk(1, 'test');
      await store.indexItem(1, 'test');
      await store.indexMemory('admin', 'test', 'test');
      
      store.clearAll();
      
      const stats = store.getStats();
      expect(stats.chunkEmbeddings).toBe(0);
      expect(stats.itemEmbeddings).toBe(0);
      expect(stats.memoryEmbeddings).toBe(0);
    });
  });
});
