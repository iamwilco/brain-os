/**
 * Artifacts routes tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Artifacts Routes', () => {
  let server: FastifyInstance;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `brain-artifacts-test-${Date.now()}`);
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

  describe('GET /artifacts', () => {
    it('should return empty list initially', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/artifacts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should support pagination params', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/artifacts?limit=10&offset=0',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /artifacts', () => {
    it('should create a new artifact', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/artifacts',
        payload: {
          type: 'markdown',
          title: 'Test Report',
          content: '# Test\n\nThis is a test artifact.',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toMatch(/^art_/);
      expect(body.type).toBe('markdown');
      expect(body.title).toBe('Test Report');
      expect(body.content).toContain('# Test');
    });

    it('should create artifact with optional fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/artifacts',
        payload: {
          type: 'mindmap',
          title: 'Project Overview',
          scopeRef: 'path:30_Projects/Test',
          agentId: 'agent_admin',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.type).toBe('mindmap');
      expect(body.scopeRef).toBe('path:30_Projects/Test');
      expect(body.agentId).toBe('agent_admin');
    });

    it('should reject invalid type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/artifacts',
        payload: {
          type: 'invalid',
          title: 'Bad Artifact',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /artifacts/:id', () => {
    it('should return artifact by id', async () => {
      // Create an artifact first
      const createResponse = await server.inject({
        method: 'POST',
        url: '/artifacts',
        payload: {
          type: 'report',
          title: 'Monthly Report',
        },
      });
      const created = JSON.parse(createResponse.payload);

      // Get it by ID
      const response = await server.inject({
        method: 'GET',
        url: `/artifacts/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(created.id);
      expect(body.type).toBe('report');
    });

    it('should return 404 for non-existent artifact', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/artifacts/art_nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /artifacts/:id', () => {
    it('should delete an artifact', async () => {
      // Create an artifact
      const createResponse = await server.inject({
        method: 'POST',
        url: '/artifacts',
        payload: {
          type: 'diff',
          title: 'Code Diff',
        },
      });
      const created = JSON.parse(createResponse.payload);

      // Delete it
      const response = await server.inject({
        method: 'DELETE',
        url: `/artifacts/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);

      // Verify it's gone
      const getResponse = await server.inject({
        method: 'GET',
        url: `/artifacts/${created.id}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent artifact', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/artifacts/art_nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /artifacts with filters', () => {
    it('should filter by projectId', async () => {
      // Create artifacts with different project IDs
      await server.inject({
        method: 'POST',
        url: '/artifacts',
        payload: {
          type: 'markdown',
          projectId: 'proj_filter_test',
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/artifacts?projectId=proj_filter_test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.every((a: { projectId: string }) => a.projectId === 'proj_filter_test')).toBe(true);
    });
  });
});
