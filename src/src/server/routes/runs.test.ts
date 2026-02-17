/**
 * Runs routes tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Runs Routes', () => {
  let server: FastifyInstance;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `brain-runs-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '40_Brain'), { recursive: true });
    
    server = await createServer({
      vaultPath: testDir,
      logger: false,
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('GET /runs', () => {
    it('should return empty list initially', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/runs',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should support pagination params', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/runs?limit=10&offset=0',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /runs', () => {
    it('should start a new run', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          action: 'ingest',
          agentId: 'agent_admin',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toMatch(/^run_/);
      expect(body.action).toBe('ingest');
      expect(body.status).toBe('running');
      expect(body.progress).toBe(0);
      expect(body.logs).toBeDefined();
    });

    it('should start run without agentId', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          action: 'index',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.agentId).toBeNull();
    });

    it('should reject missing action', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/runs',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /runs/:id', () => {
    it('should return run by id', async () => {
      // Create a run first
      const createResponse = await server.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          action: 'extract',
        },
      });
      const created = JSON.parse(createResponse.payload);

      // Get it by ID
      const response = await server.inject({
        method: 'GET',
        url: `/runs/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(created.id);
      expect(body.action).toBe('extract');
    });

    it('should return 404 for non-existent run', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/runs/run_nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /runs/:id', () => {
    it('should cancel a running run', async () => {
      // Create a run
      const createResponse = await server.inject({
        method: 'POST',
        url: '/runs',
        payload: {
          action: 'synth',
        },
      });
      const created = JSON.parse(createResponse.payload);

      // Cancel it immediately
      const response = await server.inject({
        method: 'DELETE',
        url: `/runs/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should return 404 for non-existent run', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/runs/run_nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
