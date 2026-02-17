/**
 * API schemas tests
 */

import { describe, it, expect } from 'vitest';
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ProjectStatusSchema,
  RunCreateSchema,
  RunActionSchema,
  RunStatusSchema,
  ArtifactTypeSchema,
  SourceCollectionTypeSchema,
  ImportRequestSchema,
  AgentSpawnSchema,
  AgentTypeSchema,
  SearchRequestSchema,
  ListParamsSchema,
  IdParamSchema,
  HealthResponseSchema,
  StatsResponseSchema,
  WSEventTypeSchema,
} from './schemas.js';

describe('ProjectSchemas', () => {
  describe('ProjectCreateSchema', () => {
    it('should validate valid project create', () => {
      const result = ProjectCreateSchema.safeParse({
        name: 'Test Project',
        rootPath: '/path/to/project',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const result = ProjectCreateSchema.safeParse({
        name: 'Test Project',
        rootPath: '/path/to/project',
        emoji: '🚀',
        description: 'A test project',
        linkedScopes: ['path:30_Projects/Test/**'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.emoji).toBe('🚀');
      }
    });

    it('should reject empty name', () => {
      const result = ProjectCreateSchema.safeParse({
        name: '',
        rootPath: '/path',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing rootPath', () => {
      const result = ProjectCreateSchema.safeParse({
        name: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ProjectUpdateSchema', () => {
    it('should allow partial updates', () => {
      const result = ProjectUpdateSchema.safeParse({
        name: 'New Name',
      });
      expect(result.success).toBe(true);
    });

    it('should validate status', () => {
      const result = ProjectUpdateSchema.safeParse({
        status: 'archived',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = ProjectUpdateSchema.safeParse({
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ProjectStatusSchema', () => {
    it('should accept valid statuses', () => {
      expect(ProjectStatusSchema.safeParse('active').success).toBe(true);
      expect(ProjectStatusSchema.safeParse('paused').success).toBe(true);
      expect(ProjectStatusSchema.safeParse('archived').success).toBe(true);
    });

    it('should reject invalid status', () => {
      expect(ProjectStatusSchema.safeParse('deleted').success).toBe(false);
    });
  });
});

describe('RunSchemas', () => {
  describe('RunCreateSchema', () => {
    it('should validate valid run create', () => {
      const result = RunCreateSchema.safeParse({
        action: 'extract',
      });
      expect(result.success).toBe(true);
    });

    it('should accept agentId', () => {
      const result = RunCreateSchema.safeParse({
        action: 'skill',
        agentId: 'agent_skill_writer',
      });
      expect(result.success).toBe(true);
    });

    it('should accept params', () => {
      const result = RunCreateSchema.safeParse({
        action: 'ingest',
        params: { path: '/path/to/file.zip' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('RunActionSchema', () => {
    it('should accept all valid actions', () => {
      const actions = ['ingest', 'index', 'extract', 'synth', 'skill', 'brainstorm', 'write', 'export'];
      for (const action of actions) {
        expect(RunActionSchema.safeParse(action).success).toBe(true);
      }
    });

    it('should reject invalid action', () => {
      expect(RunActionSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('RunStatusSchema', () => {
    it('should accept all valid statuses', () => {
      const statuses = ['queued', 'running', 'success', 'fail'];
      for (const status of statuses) {
        expect(RunStatusSchema.safeParse(status).success).toBe(true);
      }
    });
  });
});

describe('ArtifactTypeSchema', () => {
  it('should accept all valid types', () => {
    const types = ['markdown', 'tasks', 'mindmap', 'report', 'diff', 'context-pack'];
    for (const type of types) {
      expect(ArtifactTypeSchema.safeParse(type).success).toBe(true);
    }
  });
});

describe('SourceCollectionSchemas', () => {
  describe('SourceCollectionTypeSchema', () => {
    it('should accept valid types', () => {
      expect(SourceCollectionTypeSchema.safeParse('chatgpt').success).toBe(true);
      expect(SourceCollectionTypeSchema.safeParse('claude').success).toBe(true);
      expect(SourceCollectionTypeSchema.safeParse('folder').success).toBe(true);
    });
  });

  describe('ImportRequestSchema', () => {
    it('should validate valid import request', () => {
      const result = ImportRequestSchema.safeParse({
        type: 'chatgpt',
        path: '/path/to/export.zip',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional name', () => {
      const result = ImportRequestSchema.safeParse({
        type: 'folder',
        path: '/path/to/folder',
        name: 'My Import',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty path', () => {
      const result = ImportRequestSchema.safeParse({
        type: 'chatgpt',
        path: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('AgentSchemas', () => {
  describe('AgentSpawnSchema', () => {
    it('should validate valid spawn request', () => {
      const result = AgentSpawnSchema.safeParse({
        name: 'Writer',
        type: 'skill',
        scope: ['**/*'],
      });
      expect(result.success).toBe(true);
    });

    it('should require at least one scope', () => {
      const result = AgentSpawnSchema.safeParse({
        name: 'Test',
        type: 'project',
        scope: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AgentTypeSchema', () => {
    it('should accept valid types', () => {
      expect(AgentTypeSchema.safeParse('admin').success).toBe(true);
      expect(AgentTypeSchema.safeParse('project').success).toBe(true);
      expect(AgentTypeSchema.safeParse('skill').success).toBe(true);
    });
  });
});

describe('SearchSchemas', () => {
  describe('SearchRequestSchema', () => {
    it('should validate basic search', () => {
      const result = SearchRequestSchema.safeParse({
        query: 'authentication',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
      }
    });

    it('should accept scope and filters', () => {
      const result = SearchRequestSchema.safeParse({
        query: 'auth',
        scope: 'path:30_Projects/Brain/**',
        limit: 50,
        filters: {
          types: ['fact', 'decision'],
          dateFrom: '2026-01-01',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty query', () => {
      const result = SearchRequestSchema.safeParse({
        query: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const result = SearchRequestSchema.safeParse({
        query: 'test',
        limit: 200,
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('CommonSchemas', () => {
  describe('ListParamsSchema', () => {
    it('should provide defaults', () => {
      const result = ListParamsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should accept custom values', () => {
      const result = ListParamsSchema.safeParse({
        limit: 50,
        offset: 100,
        sortBy: 'createdAt',
        sortOrder: 'asc',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('IdParamSchema', () => {
    it('should validate non-empty id', () => {
      expect(IdParamSchema.safeParse({ id: 'abc123' }).success).toBe(true);
      expect(IdParamSchema.safeParse({ id: '' }).success).toBe(false);
    });
  });
});

describe('ResponseSchemas', () => {
  describe('HealthResponseSchema', () => {
    it('should validate health response', () => {
      const result = HealthResponseSchema.safeParse({
        status: 'ok',
        version: '0.1.0',
        uptime: 3600,
        database: {
          connected: true,
          schemaVersion: 2,
        },
        counts: {
          sources: 100,
          items: 500,
          projects: 5,
          agents: 10,
          runs: 50,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('StatsResponseSchema', () => {
    it('should validate stats response', () => {
      const result = StatsResponseSchema.safeParse({
        sources: 100,
        chunks: 1000,
        items: 500,
        entities: 200,
        projects: 5,
        agents: 10,
        runs: 50,
        artifacts: 25,
        collections: 3,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('WSEventSchemas', () => {
  describe('WSEventTypeSchema', () => {
    it('should accept all event types', () => {
      const types = [
        'run:started',
        'run:progress',
        'run:completed',
        'run:failed',
        'agent:status',
        'import:progress',
        'import:completed',
      ];
      for (const type of types) {
        expect(WSEventTypeSchema.safeParse(type).success).toBe(true);
      }
    });
  });
});
