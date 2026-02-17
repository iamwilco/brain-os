/**
 * Agent context auto-generation tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getContextPath,
  getItemsForScope,
  categorizeByRecency,
  generateContextMarkdown,
  generateAgentContext,
  saveContext,
  regenerateContext,
  loadContext,
  contextNeedsRegeneration,
  type ContextItem,
  type GeneratedContext,
} from './context.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { ensureItemsTable } from '../item/idempotent.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('getContextPath', () => {
  it('should return CONTEXT.md path', () => {
    const path = getContextPath('/agent/path');
    expect(path).toBe('/agent/path/CONTEXT.md');
  });
});

describe('categorizeByRecency', () => {
  it('should categorize items by age', () => {
    const now = new Date();
    const items: ContextItem[] = [
      {
        id: 1,
        content: 'Hot item',
        itemType: 'fact',
        entityName: null,
        createdAt: now.toISOString(),
        sourcePath: 'test.md',
      },
      {
        id: 2,
        content: 'Warm item',
        itemType: 'fact',
        entityName: null,
        createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        sourcePath: 'test.md',
      },
      {
        id: 3,
        content: 'Cold item',
        itemType: 'fact',
        entityName: null,
        createdAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        sourcePath: 'test.md',
      },
    ];

    const categorized = categorizeByRecency(items);

    expect(categorized.hot).toHaveLength(1);
    expect(categorized.warm).toHaveLength(1);
    expect(categorized.cold).toHaveLength(1);
  });

  it('should handle empty items', () => {
    const categorized = categorizeByRecency([]);

    expect(categorized.hot).toHaveLength(0);
    expect(categorized.warm).toHaveLength(0);
    expect(categorized.cold).toHaveLength(0);
  });
});

describe('generateContextMarkdown', () => {
  it('should generate valid markdown', () => {
    const context: GeneratedContext = {
      agentId: 'agent_test',
      generatedAt: '2026-02-01T12:00:00Z',
      itemCount: 3,
      sections: {
        hot: [
          { id: 1, content: 'Hot fact', itemType: 'fact', entityName: 'Entity1', createdAt: '', sourcePath: '' },
        ],
        warm: [
          { id: 2, content: 'Warm insight', itemType: 'insight', entityName: null, createdAt: '', sourcePath: '' },
        ],
        cold: [],
      },
    };

    const markdown = generateContextMarkdown(context);

    expect(markdown).toContain('type: agent-context');
    expect(markdown).toContain('agent: agent_test');
    expect(markdown).toContain('## 🔥 Hot');
    expect(markdown).toContain('## 🌤 Warm');
    expect(markdown).toContain('## ❄️ Cold');
    expect(markdown).toContain('**Entity1**');
    expect(markdown).toContain('[fact]');
    expect(markdown).toContain('## Stats');
  });

  it('should show empty messages for empty sections', () => {
    const context: GeneratedContext = {
      agentId: 'agent_test',
      generatedAt: '2026-02-01T12:00:00Z',
      itemCount: 0,
      sections: { hot: [], warm: [], cold: [] },
    };

    const markdown = generateContextMarkdown(context);

    expect(markdown).toContain('*No recent items*');
    expect(markdown).toContain('*No items in this period*');
    expect(markdown).toContain('*No older items*');
  });

  it('should truncate long sections', () => {
    const hotItems = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      content: `Item ${i}`,
      itemType: 'fact',
      entityName: null,
      createdAt: '',
      sourcePath: '',
    }));

    const context: GeneratedContext = {
      agentId: 'agent_test',
      generatedAt: '2026-02-01T12:00:00Z',
      itemCount: 30,
      sections: { hot: hotItems, warm: [], cold: [] },
    };

    const markdown = generateContextMarkdown(context);

    expect(markdown).toContain('...and 10 more');
  });
});

describe('Database operations', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-context-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);

    // Add test data
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('docs/test.md', 'test', 'markdown', 'hash1', 100)
    `).run();
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'Test chunk', 1, 10)
    `).run();
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content)
      VALUES (1, 'fact', 'Test fact content')
    `).run();
  });

  afterEach(async () => {
    closeDatabase(db);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('getItemsForScope', () => {
    it('should get items from database', () => {
      const items = getItemsForScope(db, '**/*');

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].content).toBe('Test fact content');
    });

    it('should filter by scope', () => {
      const items = getItemsForScope(db, 'docs/**');

      expect(items.length).toBeGreaterThan(0);
    });

    it('should return empty for non-matching scope', () => {
      const items = getItemsForScope(db, 'other/**');

      expect(items).toHaveLength(0);
    });
  });

  describe('generateAgentContext', () => {
    it('should generate context from database', async () => {
      const context = await generateAgentContext(testDir, 'agent_test', '**/*', db);

      expect(context.agentId).toBe('agent_test');
      expect(context.itemCount).toBeGreaterThan(0);
    });
  });
});

describe('File operations', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-context-file-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);
  });

  afterEach(async () => {
    closeDatabase(db);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('saveContext', () => {
    it('should save context to file', async () => {
      const context: GeneratedContext = {
        agentId: 'agent_test',
        generatedAt: '2026-02-01T12:00:00Z',
        itemCount: 0,
        sections: { hot: [], warm: [], cold: [] },
      };

      await saveContext(testDir, context);

      expect(existsSync(join(testDir, 'CONTEXT.md'))).toBe(true);
    });
  });

  describe('regenerateContext', () => {
    it('should generate and save context', async () => {
      const context = await regenerateContext(testDir, 'agent_test', '**/*', db);

      expect(context).toBeDefined();
      expect(existsSync(join(testDir, 'CONTEXT.md'))).toBe(true);
    });
  });

  describe('loadContext', () => {
    it('should load existing context', async () => {
      await regenerateContext(testDir, 'agent_test', '**/*', db);

      const content = await loadContext(testDir);

      expect(content).not.toBeNull();
      expect(content).toContain('agent: agent_test');
    });

    it('should return null for non-existent', async () => {
      const content = await loadContext(testDir);

      expect(content).toBeNull();
    });
  });

  describe('contextNeedsRegeneration', () => {
    it('should return true if no context exists', async () => {
      const needs = await contextNeedsRegeneration(testDir);

      expect(needs).toBe(true);
    });

    it('should return false for fresh context', async () => {
      await regenerateContext(testDir, 'agent_test', '**/*', db);

      const needs = await contextNeedsRegeneration(testDir, 24);

      expect(needs).toBe(false);
    });
  });
});
