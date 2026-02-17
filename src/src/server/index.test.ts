/**
 * Server tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, DEFAULT_SERVER_CONFIG } from './index.js';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Server', () => {
  let server: FastifyInstance;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `brain-server-test-${Date.now()}`);
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

  describe('createServer', () => {
    it('should create a Fastify instance', () => {
      expect(server).toBeDefined();
      expect(server.server).toBeDefined();
    });

    it('should have state decorated', () => {
      expect(server.state).toBeDefined();
      expect(server.state.startTime).toBeGreaterThan(0);
      expect(server.state.vaultPath).toBe(testDir);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.payload);
      expect(body.status).toMatch(/ok|degraded/);
      expect(body.version).toBeDefined();
      expect(body.uptime).toBeGreaterThanOrEqual(0);
      expect(body.database).toBeDefined();
      expect(body.database.connected).toBeDefined();
      expect(body.counts).toBeDefined();
    });

    it('should have correct health response structure', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.payload);
      
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('database');
      expect(body).toHaveProperty('counts');
      expect(body.database).toHaveProperty('connected');
      expect(body.database).toHaveProperty('schemaVersion');
      expect(body.counts).toHaveProperty('sources');
      expect(body.counts).toHaveProperty('items');
      expect(body.counts).toHaveProperty('projects');
      expect(body.counts).toHaveProperty('agents');
      expect(body.counts).toHaveProperty('runs');
    });
  });

  describe('GET /stats', () => {
    it('should return stats', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/stats',
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('sources');
      expect(body).toHaveProperty('chunks');
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('entities');
      expect(body).toHaveProperty('projects');
      expect(body).toHaveProperty('agents');
      expect(body).toHaveProperty('runs');
      expect(body).toHaveProperty('artifacts');
      expect(body).toHaveProperty('collections');
    });
  });

  describe('CORS', () => {
    it('should allow CORS from configured origins', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'Origin': 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});

describe('DEFAULT_SERVER_CONFIG', () => {
  it('should have correct defaults', () => {
    expect(DEFAULT_SERVER_CONFIG.port).toBe(3001);
    expect(DEFAULT_SERVER_CONFIG.host).toBe('127.0.0.1');
    expect(DEFAULT_SERVER_CONFIG.logger).toBe(true);
    expect(DEFAULT_SERVER_CONFIG.corsOrigin).toContain('http://localhost:5173');
  });
});
