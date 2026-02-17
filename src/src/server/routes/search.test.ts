/**
 * Search routes tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Search Routes', () => {
  let server: FastifyInstance;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `brain-search-test-${Date.now()}`);
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

  describe('GET /search', () => {
    it('should return search response structure', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/search?query=test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('query');
      expect(body).toHaveProperty('scope');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('results');
      expect(body).toHaveProperty('took');
      expect(body.query).toBe('test');
    });

    it('should return empty results for no matches', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/search?query=nonexistentqueryterm12345',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('should accept scope parameter', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/search?query=test&scope=collection:chatgpt',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.scope).toBe('collection:chatgpt');
    });

    it('should accept limit and offset', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/search?query=test&limit=10&offset=5',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject empty query', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/search?query=',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing query', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/search',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should include took time in milliseconds', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/search?query=test',
      });

      const body = JSON.parse(response.payload);
      expect(typeof body.took).toBe('number');
      expect(body.took).toBeGreaterThanOrEqual(0);
    });
  });
});
