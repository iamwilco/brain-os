/**
 * Hybrid Search Module
 * 
 * Combines vector similarity search with FTS5 keyword search
 * for improved relevance ranking.
 */

import type { DatabaseInstance } from '../db/connection.js';
import { 
  searchChunks as ftsSearchChunks,
  searchItems as ftsSearchItems,
  type ChunkSearchResult,
  type ItemSearchResult,
  type CombinedSearchResult,
} from './fts.js';
import {
  VectorStore,
  type ChunkVectorResult,
  type ItemVectorResult,
  type EmbeddingProvider,
} from './vector.js';

/**
 * Hybrid search result combining FTS and vector scores
 */
export interface HybridSearchResult {
  id: number;
  content: string;
  ftsScore: number;
  vectorScore: number;
  combinedScore: number;
  sourceType: 'chunk' | 'item';
  metadata: Record<string, unknown>;
}

/**
 * Hybrid chunk result
 */
export interface HybridChunkResult extends HybridSearchResult {
  sourceType: 'chunk';
  sourceId: number;
  sourcePath: string;
  startLine: number;
  endLine: number;
  highlights: string[];
}

/**
 * Hybrid item result
 */
export interface HybridItemResult extends HybridSearchResult {
  sourceType: 'item';
  itemType: string;
  chunkId: number;
  highlights: string[];
}

/**
 * Hybrid search options
 */
export interface HybridSearchOptions {
  limit?: number;
  /** Weight for FTS score (0-1) */
  ftsWeight?: number;
  /** Weight for vector score (0-1) */
  vectorWeight?: number;
  /** Minimum combined score threshold */
  minScore?: number;
  /** Source type filter */
  sourceType?: 'chunk' | 'item' | 'all';
  /** Collection filter */
  collection?: string;
  /** Minimum vector similarity */
  minSimilarity?: number;
}

const DEFAULT_OPTIONS: Required<HybridSearchOptions> = {
  limit: 20,
  ftsWeight: 0.4,
  vectorWeight: 0.6,
  minScore: 0,
  sourceType: 'all',
  collection: '',
  minSimilarity: 0.3,
};

/**
 * Normalize scores to 0-1 range
 */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = max - min;
  
  if (range === 0) return scores.map(() => 1);
  
  return scores.map(s => (s - min) / range);
}

/**
 * Hybrid Search Engine
 */
export class HybridSearchEngine {
  private db: DatabaseInstance;
  private vectorStore: VectorStore;
  
  constructor(db: DatabaseInstance, vectorStore: VectorStore) {
    this.db = db;
    this.vectorStore = vectorStore;
  }
  
  /**
   * Search chunks using hybrid approach
   */
  async searchChunks(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<HybridChunkResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    // Get FTS results
    const ftsResults = ftsSearchChunks(this.db, query, {
      limit: opts.limit * 2, // Get more to ensure overlap
      collection: opts.collection,
    });
    
    // Get vector results
    const vectorResults = await this.vectorStore.searchChunks(query, {
      limit: opts.limit * 2,
      collection: opts.collection,
      minSimilarity: opts.minSimilarity,
    });
    
    // Build result map by ID
    const resultMap = new Map<number, {
      fts?: ChunkSearchResult;
      vector?: ChunkVectorResult;
    }>();
    
    for (const r of ftsResults) {
      resultMap.set(r.id, { fts: r });
    }
    
    for (const r of vectorResults) {
      const existing = resultMap.get(r.id);
      if (existing) {
        existing.vector = r;
      } else {
        resultMap.set(r.id, { vector: r });
      }
    }
    
    // Normalize scores
    const ftsScores = ftsResults.map(r => r.score);
    const vectorScores = vectorResults.map(r => r.similarity);
    const normalizedFts = normalizeScores(ftsScores);
    const normalizedVector = normalizeScores(vectorScores);
    
    // Create score lookup maps
    const ftsScoreMap = new Map<number, number>();
    const vectorScoreMap = new Map<number, number>();
    
    ftsResults.forEach((r, i) => ftsScoreMap.set(r.id, normalizedFts[i]));
    vectorResults.forEach((r, i) => vectorScoreMap.set(r.id, normalizedVector[i]));
    
    // Combine results
    const hybridResults: HybridChunkResult[] = [];
    
    for (const [id, { fts, vector }] of resultMap) {
      const ftsScore = ftsScoreMap.get(id) ?? 0;
      const vectorScore = vectorScoreMap.get(id) ?? 0;
      const combinedScore = (ftsScore * opts.ftsWeight) + (vectorScore * opts.vectorWeight);
      
      if (combinedScore < opts.minScore) continue;
      
      // Use FTS result for metadata if available, otherwise vector
      const source = fts ?? vector!;
      
      hybridResults.push({
        id,
        content: source.content,
        ftsScore: fts?.score ?? 0,
        vectorScore: vector?.similarity ?? 0,
        combinedScore,
        sourceType: 'chunk',
        sourceId: 'sourceId' in source ? source.sourceId : 0,
        sourcePath: 'sourcePath' in source ? source.sourcePath : '',
        startLine: 'startLine' in source ? source.startLine : 0,
        endLine: 'endLine' in source ? source.endLine : 0,
        highlights: fts?.highlights ?? [],
        metadata: {},
      });
    }
    
    // Sort by combined score and limit
    hybridResults.sort((a, b) => b.combinedScore - a.combinedScore);
    return hybridResults.slice(0, opts.limit);
  }
  
  /**
   * Search items using hybrid approach
   */
  async searchItems(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<HybridItemResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    // Get FTS results
    const ftsResults = ftsSearchItems(this.db, query, {
      limit: opts.limit * 2,
    });
    
    // Get vector results
    const vectorResults = await this.vectorStore.searchItems(query, {
      limit: opts.limit * 2,
      minSimilarity: opts.minSimilarity,
    });
    
    // Build result map by ID
    const resultMap = new Map<number, {
      fts?: ItemSearchResult;
      vector?: ItemVectorResult;
    }>();
    
    for (const r of ftsResults) {
      resultMap.set(r.id, { fts: r });
    }
    
    for (const r of vectorResults) {
      const existing = resultMap.get(r.id);
      if (existing) {
        existing.vector = r;
      } else {
        resultMap.set(r.id, { vector: r });
      }
    }
    
    // Normalize scores
    const ftsScores = ftsResults.map(r => r.score);
    const vectorScores = vectorResults.map(r => r.similarity);
    const normalizedFts = normalizeScores(ftsScores);
    const normalizedVector = normalizeScores(vectorScores);
    
    const ftsScoreMap = new Map<number, number>();
    const vectorScoreMap = new Map<number, number>();
    
    ftsResults.forEach((r, i) => ftsScoreMap.set(r.id, normalizedFts[i]));
    vectorResults.forEach((r, i) => vectorScoreMap.set(r.id, normalizedVector[i]));
    
    // Combine results
    const hybridResults: HybridItemResult[] = [];
    
    for (const [id, { fts, vector }] of resultMap) {
      const ftsScore = ftsScoreMap.get(id) ?? 0;
      const vectorScore = vectorScoreMap.get(id) ?? 0;
      const combinedScore = (ftsScore * opts.ftsWeight) + (vectorScore * opts.vectorWeight);
      
      if (combinedScore < opts.minScore) continue;
      
      const source = fts ?? vector!;
      
      hybridResults.push({
        id,
        content: source.content,
        ftsScore: fts?.score ?? 0,
        vectorScore: vector?.similarity ?? 0,
        combinedScore,
        sourceType: 'item',
        itemType: 'itemType' in source ? source.itemType : '',
        chunkId: 'chunkId' in source ? source.chunkId : 0,
        highlights: fts?.highlights ?? [],
        metadata: {},
      });
    }
    
    hybridResults.sort((a, b) => b.combinedScore - a.combinedScore);
    return hybridResults.slice(0, opts.limit);
  }
  
  /**
   * Combined hybrid search across chunks and items
   */
  async search(
    query: string,
    options: HybridSearchOptions = {}
  ): Promise<(HybridChunkResult | HybridItemResult)[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    if (opts.sourceType === 'chunk') {
      return this.searchChunks(query, opts);
    }
    
    if (opts.sourceType === 'item') {
      return this.searchItems(query, opts);
    }
    
    // Search both and merge
    const perTypeLimit = Math.ceil(opts.limit / 2);
    const [chunkResults, itemResults] = await Promise.all([
      this.searchChunks(query, { ...opts, limit: perTypeLimit }),
      this.searchItems(query, { ...opts, limit: perTypeLimit }),
    ]);
    
    const combined = [...chunkResults, ...itemResults];
    combined.sort((a, b) => b.combinedScore - a.combinedScore);
    
    return combined.slice(0, opts.limit);
  }
  
  /**
   * Rerank results using vector similarity
   * Useful for reranking FTS-only results
   */
  async rerankWithVector(
    query: string,
    results: CombinedSearchResult[],
    options: { vectorWeight?: number } = {}
  ): Promise<CombinedSearchResult[]> {
    const vectorWeight = options.vectorWeight ?? 0.5;
    const ftsWeight = 1 - vectorWeight;
    
    // Get vector scores for each result
    const vectorStore = this.vectorStore;
    
    const reranked = await Promise.all(
      results.map(async (result) => {
        let vectorScore = 0;
        
        if (result.sourceType === 'chunk') {
          const vectorResults = await vectorStore.searchChunks(query, {
            limit: 1,
            minSimilarity: 0,
          });
          const match = vectorResults.find(v => v.id === result.id);
          vectorScore = match?.similarity ?? 0;
        } else if (result.sourceType === 'item') {
          const vectorResults = await vectorStore.searchItems(query, {
            limit: 1,
            minSimilarity: 0,
          });
          const match = vectorResults.find(v => v.id === result.id);
          vectorScore = match?.similarity ?? 0;
        }
        
        // Normalize FTS score (assuming max ~10)
        const normalizedFts = Math.min(result.score / 10, 1);
        const combinedScore = (normalizedFts * ftsWeight) + (vectorScore * vectorWeight);
        
        return {
          ...result,
          score: combinedScore,
        };
      })
    );
    
    reranked.sort((a, b) => b.score - a.score);
    return reranked;
  }
}

/**
 * Create a hybrid search engine
 */
export function createHybridSearchEngine(
  db: DatabaseInstance,
  vectorStore: VectorStore
): HybridSearchEngine {
  return new HybridSearchEngine(db, vectorStore);
}

/**
 * Create hybrid search engine with new vector store
 */
export async function createHybridSearch(
  db: DatabaseInstance,
  embeddingProvider?: EmbeddingProvider
): Promise<{ engine: HybridSearchEngine; vectorStore: VectorStore }> {
  const { createVectorStore } = await import('./vector.js');
  const vectorStore = createVectorStore(db, embeddingProvider);
  const engine = new HybridSearchEngine(db, vectorStore);

  return { engine, vectorStore };
}
