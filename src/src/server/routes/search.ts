/**
 * Search API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { SearchRequestSchema } from '../../api/schemas.js';
import type { SearchResponse, SearchResult } from '../../api/types.js';
import { search, countMatches } from '../../search/fts.js';
import type { CombinedSearchResult, ChunkSearchResult } from '../../search/fts.js';

/**
 * Handle Zod validation errors
 */
function handleZodError(error: ZodError, reply: FastifyReply) {
  return reply.status(400).send({
    error: 'Validation error',
    message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
    details: error.errors,
  });
}

/**
 * Convert internal search result to API format
 */
function toSearchResultAPI(result: CombinedSearchResult): SearchResult {
  const base = {
    id: String(result.id),
    type: result.sourceType,
    snippet: result.content.slice(0, 200),
    score: result.score,
    highlights: result.highlights,
  };

  if (result.sourceType === 'chunk') {
    const chunk = result as ChunkSearchResult;
    return {
      ...base,
      title: `Chunk from ${chunk.sourcePath}`,
      path: chunk.sourcePath,
      source: {
        id: String(chunk.sourceId),
        collection: chunk.sourcePath.split('/')[0] || 'unknown',
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      },
    };
  }

  if (result.sourceType === 'item') {
    return {
      ...base,
      title: result.content.split('\n')[0].slice(0, 100),
      path: '',
      source: {
        id: String(result.id),
        collection: 'items',
      },
    };
  }

  // Entity
  return {
    ...base,
    title: (result as { name: string }).name,
    path: '',
    source: {
      id: String(result.id),
      collection: 'entities',
    },
  };
}

/**
 * Register search routes
 */
export async function searchRoutes(server: FastifyInstance): Promise<void> {
  const db = () => server.state.db;

  // Search endpoint
  server.get('/search', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = SearchRequestSchema.parse(request.query);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { query, scope, limit, offset, filters } = params;
    const startTime = Date.now();

    // Map scope to collection filter if provided
    let collection: string | undefined;
    if (scope) {
      // Extract collection from scope patterns like "collection:chatgpt"
      const collMatch = scope.match(/collection:(\w+)/);
      if (collMatch) {
        collection = collMatch[1];
      }
    }

    // Determine source type from filters
    let sourceType: 'chunk' | 'item' | 'entity' | 'all' = 'all';
    if (filters?.types?.length === 1) {
      const type = filters.types[0];
      if (type === 'chunk' || type === 'item' || type === 'entity') {
        sourceType = type;
      }
    }

    // Execute search
    const results = search(dbInstance, query, {
      limit,
      offset,
      sourceType,
      collection,
    });

    // Get total counts (approximate for combined search)
    let total = 0;
    if (sourceType === 'all') {
      total = countMatches(dbInstance, query, 'chunk') +
              countMatches(dbInstance, query, 'item') +
              countMatches(dbInstance, query, 'entity');
    } else {
      total = countMatches(dbInstance, query, sourceType);
    }

    const took = Date.now() - startTime;

    const response: SearchResponse = {
      query,
      scope: scope || null,
      total,
      results: results.map(toSearchResultAPI),
      took,
    };

    return response;
  });
}
