/**
 * Vector Search Module
 * 
 * Provides embeddings-based semantic search for memory chunks and items.
 * Uses cosine similarity for vector comparison.
 */

import type { DatabaseInstance } from '../db/connection.js';

/**
 * Embedding vector type (array of floats)
 */
export type EmbeddingVector = number[];

/**
 * Embedding provider interface
 */
export interface EmbeddingProvider {
  /** Generate embedding for text */
  embed(text: string): Promise<EmbeddingVector>;
  /** Generate embeddings for multiple texts */
  embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
  /** Dimension of embeddings */
  dimension: number;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  id: number;
  content: string;
  similarity: number;
  sourceType: 'chunk' | 'item' | 'memory';
  metadata?: Record<string, unknown>;
}

/**
 * Chunk vector result
 */
export interface ChunkVectorResult extends VectorSearchResult {
  sourceType: 'chunk';
  sourceId: number;
  sourcePath: string;
  startLine: number;
  endLine: number;
}

/**
 * Item vector result
 */
export interface ItemVectorResult extends VectorSearchResult {
  sourceType: 'item';
  itemType: string;
  chunkId: number;
}

/**
 * Memory vector result
 */
export interface MemoryVectorResult extends VectorSearchResult {
  sourceType: 'memory';
  agentId: string;
  section: string;
}

/**
 * Vector search options
 */
export interface VectorSearchOptions {
  limit?: number;
  minSimilarity?: number;
  sourceType?: 'chunk' | 'item' | 'memory' | 'all';
  collection?: string;
}

const DEFAULT_OPTIONS: Required<VectorSearchOptions> = {
  limit: 20,
  minSimilarity: 0.5,
  sourceType: 'all',
  collection: '',
};

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  
  return dotProduct / magnitude;
}

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(v: EmbeddingVector): EmbeddingVector {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return v;
  return v.map(x => x / norm);
}

/**
 * Serialize embedding vector to blob for storage
 */
export function serializeEmbedding(embedding: EmbeddingVector): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

/**
 * Deserialize embedding vector from blob
 */
export function deserializeEmbedding(buffer: Buffer): EmbeddingVector {
  const embedding: EmbeddingVector = [];
  for (let i = 0; i < buffer.length; i += 4) {
    embedding.push(buffer.readFloatLE(i));
  }
  return embedding;
}

/**
 * Simple mock embedding provider for testing
 * In production, replace with OpenAI, Cohere, or local model
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  dimension = 384;
  
  async embed(text: string): Promise<EmbeddingVector> {
    // Generate deterministic pseudo-random embedding based on text hash
    const hash = this.hashString(text);
    const embedding: EmbeddingVector = [];
    
    for (let i = 0; i < this.dimension; i++) {
      // Use hash to seed pseudo-random values
      const seed = (hash * (i + 1)) % 2147483647;
      embedding.push((seed / 2147483647) * 2 - 1);
    }
    
    return normalizeVector(embedding);
  }
  
  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
  
  private hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Vector Store for managing embeddings
 */
export class VectorStore {
  private db: DatabaseInstance;
  private provider: EmbeddingProvider;
  
  constructor(db: DatabaseInstance, provider: EmbeddingProvider) {
    this.db = db;
    this.provider = provider;
  }
  
  /**
   * Initialize vector tables
   */
  initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
        embedding BLOB NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS item_embeddings (
        item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
        embedding BLOB NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS memory_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        section TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, section, content)
      );
    `);
  }
  
  /**
   * Generate and store embedding for a chunk
   */
  async indexChunk(chunkId: number, content: string): Promise<void> {
    const embedding = await this.provider.embed(content);
    const blob = serializeEmbedding(embedding);
    
    this.db.prepare(`
      INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding)
      VALUES (?, ?)
    `).run(chunkId, blob);
  }
  
  /**
   * Generate and store embedding for an item
   */
  async indexItem(itemId: number, content: string): Promise<void> {
    const embedding = await this.provider.embed(content);
    const blob = serializeEmbedding(embedding);
    
    this.db.prepare(`
      INSERT OR REPLACE INTO item_embeddings (item_id, embedding)
      VALUES (?, ?)
    `).run(itemId, blob);
  }
  
  /**
   * Index a memory section
   */
  async indexMemory(agentId: string, section: string, content: string): Promise<void> {
    const embedding = await this.provider.embed(content);
    const blob = serializeEmbedding(embedding);
    
    this.db.prepare(`
      INSERT OR REPLACE INTO memory_embeddings (agent_id, section, content, embedding)
      VALUES (?, ?, ?, ?)
    `).run(agentId, section, content, blob);
  }
  
  /**
   * Batch index chunks
   */
  async indexChunksBatch(chunks: Array<{ id: number; content: string }>): Promise<void> {
    const embeddings = await this.provider.embedBatch(chunks.map(c => c.content));
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding)
      VALUES (?, ?)
    `);
    
    const insertMany = this.db.transaction((items: Array<{ id: number; embedding: EmbeddingVector }>) => {
      for (const item of items) {
        stmt.run(item.id, serializeEmbedding(item.embedding));
      }
    });
    
    insertMany(chunks.map((c, i) => ({ id: c.id, embedding: embeddings[i] })));
  }
  
  /**
   * Search chunks by vector similarity
   */
  async searchChunks(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<ChunkVectorResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const queryEmbedding = await this.provider.embed(query);
    
    let sql = `
      SELECT 
        c.id,
        c.content,
        c.source_id,
        c.start_line,
        c.end_line,
        s.path as source_path,
        ce.embedding
      FROM chunk_embeddings ce
      JOIN chunks c ON ce.chunk_id = c.id
      JOIN sources s ON c.source_id = s.id
    `;
    
    const params: string[] = [];
    
    if (opts.collection) {
      sql += ' WHERE s.collection = ?';
      params.push(opts.collection);
    }
    
    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      content: string;
      source_id: number;
      start_line: number;
      end_line: number;
      source_path: string;
      embedding: Buffer;
    }>;
    
    // Calculate similarities and filter/sort
    const results: ChunkVectorResult[] = rows
      .map(row => {
        const embedding = deserializeEmbedding(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        return {
          id: row.id,
          content: row.content,
          similarity,
          sourceType: 'chunk' as const,
          sourceId: row.source_id,
          sourcePath: row.source_path,
          startLine: row.start_line,
          endLine: row.end_line,
        };
      })
      .filter(r => r.similarity >= opts.minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts.limit);
    
    return results;
  }
  
  /**
   * Search items by vector similarity
   */
  async searchItems(
    query: string,
    options: VectorSearchOptions = {}
  ): Promise<ItemVectorResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const queryEmbedding = await this.provider.embed(query);
    
    const rows = this.db.prepare(`
      SELECT 
        i.id,
        i.content,
        i.item_type,
        i.chunk_id,
        ie.embedding
      FROM item_embeddings ie
      JOIN items i ON ie.item_id = i.id
    `).all() as Array<{
      id: number;
      content: string;
      item_type: string;
      chunk_id: number;
      embedding: Buffer;
    }>;
    
    const results: ItemVectorResult[] = rows
      .map(row => {
        const embedding = deserializeEmbedding(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        return {
          id: row.id,
          content: row.content,
          similarity,
          sourceType: 'item' as const,
          itemType: row.item_type,
          chunkId: row.chunk_id,
        };
      })
      .filter(r => r.similarity >= opts.minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts.limit);
    
    return results;
  }
  
  /**
   * Search memory by vector similarity
   */
  async searchMemory(
    query: string,
    agentId?: string,
    options: VectorSearchOptions = {}
  ): Promise<MemoryVectorResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const queryEmbedding = await this.provider.embed(query);
    
    let sql = `
      SELECT id, agent_id, section, content, embedding
      FROM memory_embeddings
    `;
    
    const params: string[] = [];
    
    if (agentId) {
      sql += ' WHERE agent_id = ?';
      params.push(agentId);
    }
    
    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: number;
      agent_id: string;
      section: string;
      content: string;
      embedding: Buffer;
    }>;
    
    const results: MemoryVectorResult[] = rows
      .map(row => {
        const embedding = deserializeEmbedding(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        return {
          id: row.id,
          content: row.content,
          similarity,
          sourceType: 'memory' as const,
          agentId: row.agent_id,
          section: row.section,
        };
      })
      .filter(r => r.similarity >= opts.minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts.limit);
    
    return results;
  }
  
  /**
   * Get embedding stats
   */
  getStats(): {
    chunkEmbeddings: number;
    itemEmbeddings: number;
    memoryEmbeddings: number;
  } {
    const chunks = this.db.prepare('SELECT COUNT(*) as count FROM chunk_embeddings').get() as { count: number };
    const items = this.db.prepare('SELECT COUNT(*) as count FROM item_embeddings').get() as { count: number };
    const memory = this.db.prepare('SELECT COUNT(*) as count FROM memory_embeddings').get() as { count: number };
    
    return {
      chunkEmbeddings: chunks.count,
      itemEmbeddings: items.count,
      memoryEmbeddings: memory.count,
    };
  }
  
  /**
   * Delete embedding for a chunk
   */
  deleteChunkEmbedding(chunkId: number): void {
    this.db.prepare('DELETE FROM chunk_embeddings WHERE chunk_id = ?').run(chunkId);
  }
  
  /**
   * Delete embedding for an item
   */
  deleteItemEmbedding(itemId: number): void {
    this.db.prepare('DELETE FROM item_embeddings WHERE item_id = ?').run(itemId);
  }
  
  /**
   * Clear all embeddings
   */
  clearAll(): void {
    this.db.exec(`
      DELETE FROM chunk_embeddings;
      DELETE FROM item_embeddings;
      DELETE FROM memory_embeddings;
    `);
  }
}

/**
 * Create a vector store instance
 */
export function createVectorStore(
  db: DatabaseInstance,
  provider?: EmbeddingProvider
): VectorStore {
  return new VectorStore(db, provider ?? new MockEmbeddingProvider());
}
