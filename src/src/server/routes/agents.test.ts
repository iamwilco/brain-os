/**
 * Agents routes tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../index.js';
import type { FastifyInstance } from 'fastify';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Agents Routes', () => {
  let server: FastifyInstance;
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `brain-agents-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'admin'), { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'skills', 'writer'), { recursive: true });
    await mkdir(join(testDir, '30_Projects'), { recursive: true });
    
    // Create admin agent
    await writeFile(
      join(testDir, '40_Brain', 'agents', 'admin', 'AGENT.md'),
      `---
name: Wilco
id: agent_admin
type: admin
scope: **/*
---

# Admin Agent
`
    );

    // Create skill agent
    await writeFile(
      join(testDir, '40_Brain', 'agents', 'skills', 'writer', 'AGENT.md'),
      `---
name: Writer
id: agent_skill_writer
type: skill
scope: **/*
---

# Writer Skill
`
    );

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

  describe('GET /agents', () => {
    it('should return list of agents', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data).toBeDefined();
      expect(body.total).toBeGreaterThan(0);
    });

    it('should include admin and skill agents', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents',
      });

      const body = JSON.parse(response.payload);
      const ids = body.data.map((a: { id: string }) => a.id);
      expect(ids).toContain('agent_admin');
      expect(ids).toContain('agent_skill_writer');
    });
  });

  describe('GET /agents/:id', () => {
    it('should return agent by id', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents/agent_admin',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe('agent_admin');
      expect(body.name).toBe('Wilco');
      expect(body.type).toBe('admin');
    });

    it('should return 404 for non-existent agent', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/agents/agent_nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /agents/spawn', () => {
    it('should spawn a new agent', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/agents/spawn',
        payload: {
          name: 'SEO Expert',
          type: 'skill',
          scope: ['**/*'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toContain('agent_skill_seo');
      expect(body.name).toBe('SEO Expert');
      expect(body.type).toBe('skill');
    });

    it('should reject invalid agent type', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/agents/spawn',
        payload: {
          name: 'Test',
          type: 'invalid',
          scope: ['**/*'],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /agents/:id/restart', () => {
    it('should restart an agent', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/agents/agent_admin/restart',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe('agent_admin');
      expect(body.status).toBe('idle');
    });

    it('should return 404 for non-existent agent', async () => {
      const response = await server.inject({
        method: 'PUT',
        url: '/agents/agent_nonexistent/restart',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
