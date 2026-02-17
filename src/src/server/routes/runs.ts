/**
 * Runs API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { ZodError } from 'zod';
import {
  RunCreateSchema,
  IdParamSchema,
  ListParamsSchema,
} from '../../api/schemas.js';
import type { RunAPI, PaginatedResponse } from '../../api/types.js';
import type { Run } from '../../db/schema.js';

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
 * Convert DB run to API format
 */
function toRunAPI(run: Run): RunAPI {
  return {
    id: run.id,
    agentId: run.agent_id,
    action: run.action,
    status: run.status as 'queued' | 'running' | 'success' | 'fail',
    progress: run.progress,
    logs: run.logs ? JSON.parse(run.logs) : [],
    artifactIds: run.artifact_ids ? JSON.parse(run.artifact_ids) : [],
    error: run.error,
    startedAt: run.started_at,
    completedAt: run.completed_at,
  };
}

/**
 * In-memory run manager for tracking active runs
 */
class RunManager {
  private activeRuns: Map<string, { 
    progress: number; 
    logs: string[];
    status: 'queued' | 'running' | 'success' | 'fail';
  }> = new Map();

  startRun(runId: string): void {
    this.activeRuns.set(runId, { progress: 0, logs: [], status: 'running' });
  }

  updateProgress(runId: string, progress: number): void {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.progress = Math.min(100, Math.max(0, progress));
    }
  }

  addLog(runId: string, message: string): void {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.logs.push(`[${new Date().toISOString()}] ${message}`);
    }
  }

  completeRun(runId: string, success: boolean, error?: string): void {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.status = success ? 'success' : 'fail';
      run.progress = 100;
      if (error) {
        run.logs.push(`[${new Date().toISOString()}] ERROR: ${error}`);
      }
    }
  }

  getRun(runId: string): { progress: number; logs: string[]; status: string } | undefined {
    return this.activeRuns.get(runId);
  }

  cleanup(runId: string): void {
    this.activeRuns.delete(runId);
  }
}

// Global run manager instance
const runManager = new RunManager();

/**
 * Register runs routes
 */
export async function runsRoutes(server: FastifyInstance): Promise<void> {
  const db = () => server.state.db;

  // List all runs
  server.get('/runs', async (request: FastifyRequest, reply: FastifyReply) => {
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

    const countRow = dbInstance.prepare('SELECT COUNT(*) as total FROM runs').get() as { total: number };
    const total = countRow.total;

    const runs = dbInstance.prepare(`
      SELECT * FROM runs
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Run[];

    // Merge in-memory state for active runs
    const data = runs.map(run => {
      const active = runManager.getRun(run.id);
      if (active) {
        return {
          ...toRunAPI(run),
          progress: active.progress,
          logs: active.logs,
          status: active.status as 'queued' | 'running' | 'success' | 'fail',
        };
      }
      return toRunAPI(run);
    });

    const response: PaginatedResponse<RunAPI> = {
      data,
      total,
      limit,
      offset,
      hasMore: offset + runs.length < total,
    };

    return response;
  });

  // Get single run
  server.get('/runs/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { id } = IdParamSchema.parse(request.params);

    const run = dbInstance.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Run | undefined;

    if (!run) {
      return reply.status(404).send({ error: 'Run not found' });
    }

    // Merge in-memory state if active
    const active = runManager.getRun(id);
    if (active) {
      return {
        ...toRunAPI(run),
        progress: active.progress,
        logs: active.logs,
        status: active.status,
      };
    }

    return toRunAPI(run);
  });

  // Start new run
  server.post('/runs', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let data;
    try {
      data = RunCreateSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const id = `run_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    dbInstance.prepare(`
      INSERT INTO runs (id, agent_id, action, status, progress, logs, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.agentId || null,
      data.action,
      'running',
      0,
      JSON.stringify([`[${now}] Run started`]),
      now
    );

    // Track in run manager
    runManager.startRun(id);
    runManager.addLog(id, 'Run started');

    // Simulate async execution (in real impl, would spawn actual work)
    simulateRunExecution(dbInstance, id, data.action);

    const run = dbInstance.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Run;

    return reply.status(201).send(toRunAPI(run));
  });

  // Cancel run
  server.delete('/runs/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { id } = IdParamSchema.parse(request.params);

    const run = dbInstance.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Run | undefined;

    if (!run) {
      return reply.status(404).send({ error: 'Run not found' });
    }

    if (run.status === 'success' || run.status === 'fail') {
      return reply.status(400).send({ error: 'Cannot cancel completed run' });
    }

    const now = new Date().toISOString();
    dbInstance.prepare(`
      UPDATE runs SET status = 'fail', error = 'Cancelled by user', completed_at = ?
      WHERE id = ?
    `).run(now, id);

    runManager.completeRun(id, false, 'Cancelled by user');
    runManager.cleanup(id);

    return { success: true, message: 'Run cancelled' };
  });
}

/**
 * Simulate run execution (placeholder for actual implementation)
 */
function simulateRunExecution(db: ReturnType<typeof import('better-sqlite3')>, runId: string, action: string): void {
  const steps = [
    { progress: 25, message: `Starting ${action}...` },
    { progress: 50, message: 'Processing...' },
    { progress: 75, message: 'Finalizing...' },
    { progress: 100, message: 'Complete' },
  ];

  let stepIndex = 0;
  const interval = setInterval(() => {
    if (stepIndex >= steps.length) {
      clearInterval(interval);
      
      // Finalize in database
      const now = new Date().toISOString();
      const active = runManager.getRun(runId);
      if (active) {
        db.prepare(`
          UPDATE runs SET status = 'success', progress = 100, logs = ?, completed_at = ?
          WHERE id = ?
        `).run(JSON.stringify(active.logs), now, runId);
      }
      
      runManager.completeRun(runId, true);
      runManager.cleanup(runId);
      return;
    }

    const step = steps[stepIndex];
    runManager.updateProgress(runId, step.progress);
    runManager.addLog(runId, step.message);
    stepIndex++;
  }, 500);
}
