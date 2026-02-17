/**
 * Sources API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { ZodError } from 'zod';
import {
  ImportRequestSchema,
  ListParamsSchema,
  IdParamSchema,
} from '../../api/schemas.js';
import type { SourceCollectionAPI, PaginatedResponse } from '../../api/types.js';
import type { SourceCollection } from '../../db/schema.js';

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
 * Convert DB source collection to API format
 */
function toSourceCollectionAPI(collection: SourceCollection): SourceCollectionAPI {
  return {
    id: collection.id,
    type: collection.type,
    name: collection.name,
    status: collection.status,
    counts: {
      conversations: collection.conversation_count,
      messages: collection.message_count,
      items: collection.item_count,
    },
    errors: collection.errors ? JSON.parse(collection.errors) : [],
    importPath: collection.import_path,
    lastImportedAt: collection.last_imported_at,
    createdAt: collection.created_at,
    updatedAt: collection.updated_at,
  };
}

/**
 * Register sources routes
 */
export async function sourcesRoutes(server: FastifyInstance): Promise<void> {
  const db = () => server.state.db;

  // List all source collections
  server.get('/sources', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = ListParamsSchema.parse(request.query);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }
    const { limit, offset } = params;

    const countRow = dbInstance.prepare('SELECT COUNT(*) as total FROM source_collections').get() as { total: number };
    const total = countRow.total;

    const collections = dbInstance.prepare(`
      SELECT * FROM source_collections
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as SourceCollection[];

    const response: PaginatedResponse<SourceCollectionAPI> = {
      data: collections.map(toSourceCollectionAPI),
      total,
      limit,
      offset,
      hasMore: offset + collections.length < total,
    };

    return response;
  });

  // Get single source collection
  server.get('/sources/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { id } = IdParamSchema.parse(request.params);

    const collection = dbInstance.prepare('SELECT * FROM source_collections WHERE id = ?').get(id) as SourceCollection | undefined;

    if (!collection) {
      return reply.status(404).send({ error: 'Source collection not found' });
    }

    return toSourceCollectionAPI(collection);
  });

  // Import new source (creates collection record)
  server.post('/sources/import', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let data;
    try {
      data = ImportRequestSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const id = `coll_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    dbInstance.prepare(`
      INSERT INTO source_collections (id, type, name, status, import_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.type,
      data.name || null,
      'pending',
      data.path,
      now,
      now
    );

    const collection = dbInstance.prepare('SELECT * FROM source_collections WHERE id = ?').get(id) as SourceCollection;

    return reply.status(201).send(toSourceCollectionAPI(collection));
  });
}
