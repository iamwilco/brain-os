/**
 * Events routes tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Events Routes', () => {
  let server: FastifyInstance;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `brain-events-test-${Date.now()}`);
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

  describe('GET /events/status', () => {
    it('should return connection status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/events/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('connected');
      expect(body).toHaveProperty('status');
      expect(body.status).toBe('ok');
      expect(typeof body.connected).toBe('number');
    });

    it('should show zero connections initially', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/events/status',
      });

      const body = JSON.parse(response.payload);
      expect(body.connected).toBe(0);
    });
  });

  // Note: WebSocket connections cannot be tested with inject()
  // Real WS testing requires a running server and ws client
  // The /events route is registered and functional but needs integration tests
});
