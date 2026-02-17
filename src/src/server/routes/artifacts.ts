/**
 * Artifacts API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { ZodError } from 'zod';
import {
  ArtifactCreateSchema,
  IdParamSchema,
  ListParamsSchema,
} from '../../api/schemas.js';
import type { ArtifactAPI, PaginatedResponse } from '../../api/types.js';
import type { Artifact } from '../../db/schema.js';

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
 * Convert DB artifact to API format
 */
function toArtifactAPI(artifact: Artifact): ArtifactAPI {
  return {
    id: artifact.id,
    type: artifact.type as ArtifactAPI['type'],
    title: artifact.title,
    agentId: artifact.agent_id,
    runId: artifact.run_id,
    projectId: artifact.project_id,
    scopeRef: artifact.scope_ref,
    filePath: artifact.file_path,
    content: artifact.content,
    renderHints: artifact.render_hints ? JSON.parse(artifact.render_hints) : null,
    createdAt: artifact.created_at,
  };
}

/**
 * Register artifacts routes
 */
export async function artifactsRoutes(server: FastifyInstance): Promise<void> {
  const db = () => server.state.db;

  // List all artifacts
  server.get('/artifacts', async (request: FastifyRequest, reply: FastifyReply) => {
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

    // Get optional filters from query
    const query = request.query as Record<string, string>;
    const projectId = query.projectId;
    const runId = query.runId;
    const type = query.type;

    let sql = 'SELECT * FROM artifacts WHERE 1=1';
    const sqlParams: (string | number)[] = [];

    if (projectId) {
      sql += ' AND project_id = ?';
      sqlParams.push(projectId);
    }
    if (runId) {
      sql += ' AND run_id = ?';
      sqlParams.push(runId);
    }
    if (type) {
      sql += ' AND type = ?';
      sqlParams.push(type);
    }

    // Count total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countRow = dbInstance.prepare(countSql).get(...sqlParams) as { total: number };
    const total = countRow.total;

    // Get paginated results
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    sqlParams.push(limit, offset);

    const artifacts = dbInstance.prepare(sql).all(...sqlParams) as Artifact[];

    const response: PaginatedResponse<ArtifactAPI> = {
      data: artifacts.map(toArtifactAPI),
      total,
      limit,
      offset,
      hasMore: offset + artifacts.length < total,
    };

    return response;
  });

  // Get single artifact
  server.get('/artifacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { id } = IdParamSchema.parse(request.params);

    const artifact = dbInstance.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Artifact | undefined;

    if (!artifact) {
      return reply.status(404).send({ error: 'Artifact not found' });
    }

    return toArtifactAPI(artifact);
  });

  // Create artifact (typically called by run completion)
  server.post('/artifacts', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let data;
    try {
      data = ArtifactCreateSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const id = `art_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    dbInstance.prepare(`
      INSERT INTO artifacts (id, type, title, agent_id, run_id, project_id, scope_ref, file_path, content, render_hints, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.type,
      data.title || null,
      data.agentId || null,
      data.runId || null,
      data.projectId || null,
      data.scopeRef || null,
      data.filePath || null,
      data.content || null,
      data.renderHints ? JSON.stringify(data.renderHints) : null,
      now
    );

    const artifact = dbInstance.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Artifact;

    return reply.status(201).send(toArtifactAPI(artifact));
  });

  // Delete artifact
  server.delete('/artifacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { id } = IdParamSchema.parse(request.params);

    const artifact = dbInstance.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Artifact | undefined;

    if (!artifact) {
      return reply.status(404).send({ error: 'Artifact not found' });
    }

    dbInstance.prepare('DELETE FROM artifacts WHERE id = ?').run(id);

    return { success: true, message: 'Artifact deleted' };
  });
}
