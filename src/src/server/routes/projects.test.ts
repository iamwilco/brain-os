/**
 * Projects routes tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Projects Routes', () => {
  let server: FastifyInstance;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `brain-projects-test-${Date.now()}`);
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

  describe('GET /projects', () => {
    it('should return empty list initially', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/projects',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('should support pagination params', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/projects?limit=10&offset=0',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.limit).toBe(10);
      expect(body.offset).toBe(0);
    });
  });

  describe('POST /projects', () => {
    it('should create a new project', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Test Project',
          rootPath: '/path/to/project',
          description: 'A test project',
          emoji: '🚀',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toMatch(/^proj_/);
      expect(body.name).toBe('Test Project');
      expect(body.rootPath).toBe('/path/to/project');
      expect(body.description).toBe('A test project');
      expect(body.emoji).toBe('🚀');
      expect(body.status).toBe('active');
      expect(body.linkedScopes).toEqual([]);
      expect(body.agentIds).toEqual([]);
    });

    it('should create project with minimal fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Minimal Project',
          rootPath: '/minimal',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('Minimal Project');
      expect(body.emoji).toBeNull();
      expect(body.description).toBeNull();
    });

    it('should reject empty name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/projects',
        payload: {
          name: '',
          rootPath: '/path',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /projects/:id', () => {
    it('should return project by id', async () => {
      // Create a project first
      const createResponse = await server.inject({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Get Test Project',
          rootPath: '/get-test',
        },
      });
      const created = JSON.parse(createResponse.payload);

      // Get it by ID
      const response = await server.inject({
        method: 'GET',
        url: `/projects/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(created.id);
      expect(body.name).toBe('Get Test Project');
    });

    it('should return 404 for non-existent project', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/projects/proj_nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /projects/:id', () => {
    it('should update project fields', async () => {
      // Create a project first
      const createResponse = await server.inject({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Update Test',
          rootPath: '/update-test',
        },
      });
      const created = JSON.parse(createResponse.payload);

      // Update it
      const response = await server.inject({
        method: 'PUT',
        url: `/projects/${created.id}`,
        payload: {
          name: 'Updated Name',
          description: 'New description',
          status: 'paused',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('Updated Name');
      expect(body.description).toBe('New description');
      expect(body.status).toBe('paused');
    });

    it('should update linkedScopes', async () => {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Scopes Test',
          rootPath: '/scopes-test',
        },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await server.inject({
        method: 'PUT',
        url: `/projects/${created.id}`,
        payload: {
          linkedScopes: ['path:30_Projects/**', 'tag:important'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.linkedScopes).toEqual(['path:30_Projects/**', 'tag:important']);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/projects/proj_nonexistent',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /projects/:id', () => {
    it('should delete project', async () => {
      // Create a project first
      const createResponse = await server.inject({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Delete Test',
          rootPath: '/delete-test',
        },
      });
      const created = JSON.parse(createResponse.payload);

      // Delete it
      const deleteResponse = await server.inject({
        method: 'DELETE',
        url: `/projects/${created.id}`,
      });

      expect(deleteResponse.statusCode).toBe(204);

      // Verify it's gone
      const getResponse = await server.inject({
        method: 'GET',
        url: `/projects/${created.id}`,
      });

      expect(getResponse.statusCode).toBe(404);
    });

    it('should return 404 for non-existent project', async () => {
      const response = await server.inject({
        method: 'DELETE',
        url: '/projects/proj_nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
