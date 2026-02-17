/**
 * Agent refresh command tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import {
  refreshAgentContext,
  refreshAgentById,
  refreshAgentsByType,
  refreshAllAgents,
  needsRefresh,
  refreshStaleAgents,
  formatRefreshResult,
  formatRefreshSummary,
  type RefreshResult,
  type RefreshSummary,
} from './refresh.js';

describe('formatRefreshResult', () => {
  it('should format successful result', () => {
    const result: RefreshResult = {
      agentId: 'agent_test',
      agentPath: '/path/to/agent',
      success: true,
      itemCount: 10,
      duration: 50,
    };

    const formatted = formatRefreshResult(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('agent_test');
    expect(formatted).toContain('10 items');
    expect(formatted).toContain('50ms');
  });

  it('should format failed result', () => {
    const result: RefreshResult = {
      agentId: 'agent_test',
      agentPath: '/path/to/agent',
      success: false,
      itemCount: 0,
      error: 'Database error',
      duration: 10,
    };

    const formatted = formatRefreshResult(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('agent_test');
    expect(formatted).toContain('Database error');
  });
});

describe('formatRefreshSummary', () => {
  it('should format summary', () => {
    const summary: RefreshSummary = {
      total: 3,
      successful: 2,
      failed: 1,
      results: [
        { agentId: 'a1', agentPath: '/p1', success: true, itemCount: 5, duration: 10 },
        { agentId: 'a2', agentPath: '/p2', success: true, itemCount: 3, duration: 15 },
        { agentId: 'a3', agentPath: '/p3', success: false, itemCount: 0, error: 'err', duration: 5 },
      ],
      duration: 100,
    };

    const formatted = formatRefreshSummary(summary);

    expect(formatted).toContain('Total: 3');
    expect(formatted).toContain('Successful: 2');
    expect(formatted).toContain('Failed: 1');
    expect(formatted).toContain('Duration: 100ms');
    expect(formatted).toContain('a1');
    expect(formatted).toContain('a2');
    expect(formatted).toContain('a3');
  });

  it('should handle empty results', () => {
    const summary: RefreshSummary = {
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
      duration: 10,
    };

    const formatted = formatRefreshSummary(summary);

    expect(formatted).toContain('Total: 0');
  });
});

describe('needsRefresh', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-refresh-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should return true if no context file', async () => {
    expect(await needsRefresh(testDir)).toBe(true);
  });

  it('should return false if context file is fresh', async () => {
    await writeFile(join(testDir, 'CONTEXT.md'), '# Context');
    
    expect(await needsRefresh(testDir, 60000)).toBe(false);
  });

  it('should return true if context file is stale', async () => {
    await writeFile(join(testDir, 'CONTEXT.md'), '# Context');
    
    // Wait a bit and check with very short max age
    await new Promise(r => setTimeout(r, 10));
    expect(await needsRefresh(testDir, 1)).toBe(true);
  });
});

describe('Database operations', () => {
  let testDir: string;
  let db: Database.Database;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-refresh-db-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create vault structure
    await mkdir(join(testDir, '40_Brain', 'agents', 'admin'), { recursive: true });
    await mkdir(join(testDir, '30_Projects', 'TestProject', 'agent', 'sessions'), { recursive: true });
    
    // Create in-memory database with schema
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE sources (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL,
        collection TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE chunks (
        id INTEGER PRIMARY KEY,
        source_id INTEGER,
        content TEXT,
        FOREIGN KEY (source_id) REFERENCES sources(id)
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        chunk_id INTEGER,
        item_type TEXT,
        content TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (chunk_id) REFERENCES chunks(id)
      );
    `);
    
    // Insert test data
    db.exec(`
      INSERT INTO sources (id, path, collection) VALUES (1, '30_Projects/TestProject/notes.md', 'chatgpt');
      INSERT INTO chunks (id, source_id, content) VALUES (1, 1, 'Test chunk');
      INSERT INTO items (id, chunk_id, item_type, content) VALUES (1, 1, 'fact', 'Test fact content');
    `);
  });

  afterEach(async () => {
    db.close();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  async function createAgent(path: string, name: string, type: string, id: string, scope: string) {
    await mkdir(join(path, 'sessions'), { recursive: true });
    
    const agentMd = `---
name: ${name}
id: ${id}
type: ${type}
scope: "${scope}"
created: 2026-02-01
updated: 2026-02-01
---

# ${name}
`;
    await writeFile(join(path, 'AGENT.md'), agentMd);
  }

  describe('refreshAgentContext', () => {
    it('should refresh agent context', async () => {
      const agentPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(agentPath, 'Test', 'project', 'agent_project_test', '30_Projects/TestProject/**');

      const result = await refreshAgentContext(db, agentPath);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('agent_project_test');
      expect(existsSync(join(agentPath, 'CONTEXT.md'))).toBe(true);
    });

    it('should return error for missing agent', async () => {
      const result = await refreshAgentContext(db, join(testDir, 'nonexistent'));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load');
    });
  });

  describe('refreshAgentById', () => {
    it('should refresh specific agent by ID', async () => {
      const agentPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(agentPath, 'Test', 'project', 'agent_project_test', '30_Projects/**');

      const result = await refreshAgentById(db, testDir, 'agent_project_test');

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });

    it('should return null for unknown ID', async () => {
      const result = await refreshAgentById(db, testDir, 'unknown_agent');
      expect(result).toBeNull();
    });
  });

  describe('refreshAgentsByType', () => {
    it('should refresh agents of specific type', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin',
        '**/*'
      );
      await createAgent(
        join(testDir, '30_Projects', 'TestProject', 'agent'),
        'Test',
        'project',
        'agent_project_test',
        '30_Projects/**'
      );

      const summary = await refreshAgentsByType(db, testDir, 'project');

      expect(summary.total).toBe(1);
      expect(summary.results[0].agentId).toBe('agent_project_test');
    });
  });

  describe('refreshAllAgents', () => {
    it('should refresh all agents', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin',
        '**/*'
      );
      await createAgent(
        join(testDir, '30_Projects', 'TestProject', 'agent'),
        'Test',
        'project',
        'agent_project_test',
        '30_Projects/**'
      );

      const summary = await refreshAllAgents(db, testDir);

      expect(summary.total).toBe(2);
      expect(summary.successful).toBe(2);
    });
  });

  describe('refreshStaleAgents', () => {
    it('should only refresh stale agents', async () => {
      const agentPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(agentPath, 'Test', 'project', 'agent_project_test', '30_Projects/**');

      // First refresh
      await refreshAgentContext(db, agentPath);

      // With high max age, should not refresh
      const summary = await refreshStaleAgents(db, testDir, 24 * 60 * 60 * 1000);

      expect(summary.total).toBe(0);
    });

    it('should refresh all if all are stale', async () => {
      const agentPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(agentPath, 'Test', 'project', 'agent_project_test', '30_Projects/**');

      // With 0ms max age, all are stale
      const summary = await refreshStaleAgents(db, testDir, 0);

      expect(summary.total).toBe(1);
    });
  });
});
