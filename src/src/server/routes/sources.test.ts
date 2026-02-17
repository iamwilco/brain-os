/**
 * Sources routes tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Sources Routes', () => {
  let server: FastifyInstance;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `brain-sources-test-${Date.now()}`);
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

  describe('GET /sources', () => {
    it('should return empty list initially', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/sources',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('POST /sources/import', () => {
    it('should create a new source collection', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/sources/import',
        payload: {
          type: 'chatgpt',
          path: '/path/to/export.zip',
          name: 'My ChatGPT Export',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toMatch(/^coll_/);
      expect(body.type).toBe('chatgpt');
      expect(body.name).toBe('My ChatGPT Export');
      expect(body.status).toBe('pending');
      expect(body.importPath).toBe('/path/to/export.zip');
    });

    it('should create collection without name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/sources/import',
        payload: {
          type: 'folder',
          path: '/path/to/folder',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.type).toBe('folder');
      expect(body.name).toBeNull();
    });

    it('should reject invalid type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/sources/import',
        payload: {
          type: 'invalid',
          path: '/path',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /sources/:id', () => {
    it('should return source collection by id', async () => {
      // Create a collection first
      const createResponse = await server.inject({
        method: 'POST',
        url: '/sources/import',
        payload: {
          type: 'claude',
          path: '/path/to/claude',
        },
      });
      const created = JSON.parse(createResponse.payload);

      // Get it by ID
      const response = await server.inject({
        method: 'GET',
        url: `/sources/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(created.id);
      expect(body.type).toBe('claude');
    });

    it('should return 404 for non-existent collection', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/sources/coll_nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
