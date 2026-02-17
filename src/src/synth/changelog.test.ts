/**
 * Changelog generation tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadSynthState,
  saveSynthState,
  getSynthStatePath,
  getSourcesAddedSince,
  getItemsAddedSince,
  getChangeCounts,
  generateHighlights,
  generateChangelog,
  formatChangelogMarkdown,
  saveChangelog,
  generateAndSaveChangelog,
  type SynthState,
  type ChangeSummary,
  type ChangelogReport,
} from './changelog.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { ensureItemsTable } from '../item/idempotent.js';
import { ensureExtractedAtColumn } from '../pipeline/extract.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('SynthState operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-changelog-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('loadSynthState', () => {
    it('should load state from file', async () => {
      const state: SynthState = {
        lastRun: '2026-02-01T12:00:00Z',
        lastSourceCount: 10,
        lastItemCount: 50,
        lastEntityCount: 20,
      };
      await writeFile(join(testDir, 'state.json'), JSON.stringify(state));

      const loaded = await loadSynthState(join(testDir, 'state.json'));

      expect(loaded).not.toBeNull();
      expect(loaded?.lastRun).toBe('2026-02-01T12:00:00Z');
      expect(loaded?.lastSourceCount).toBe(10);
    });

    it('should return null for non-existent file', async () => {
      const loaded = await loadSynthState('/nonexistent/state.json');
      expect(loaded).toBeNull();
    });
  });

  describe('saveSynthState', () => {
    it('should save state to file', async () => {
      const state: SynthState = {
        lastRun: '2026-02-01T12:00:00Z',
        lastSourceCount: 10,
        lastItemCount: 50,
        lastEntityCount: 20,
      };
      const path = join(testDir, 'state.json');

      await saveSynthState(path, state);

      expect(existsSync(path)).toBe(true);
      const content = await readFile(path, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.lastSourceCount).toBe(10);
    });
  });

  describe('getSynthStatePath', () => {
    it('should return correct path', () => {
      const path = getSynthStatePath('/vault');
      expect(path).toBe('/vault/40_Brain/.agent/synth-state.json');
    });
  });
});

describe('Database change detection', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-changelog-db-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);
    ensureExtractedAtColumn(db);

    // Add test data
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size, created_at)
      VALUES ('old.md', 'test', 'markdown', 'hash1', 100, '2026-01-01')
    `).run();
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size, created_at)
      VALUES ('new.md', 'test', 'markdown', 'hash2', 100, '2026-02-01')
    `).run();

    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'Content', 1, 10)
    `).run();

    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content, hash, created_at)
      VALUES (1, 'entity', 'Old Entity', 'hash1', '2026-01-01')
    `).run();
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content, hash, created_at)
      VALUES (1, 'entity', 'New Entity', 'hash2', '2026-02-01')
    `).run();
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content, hash, created_at)
      VALUES (1, 'fact', 'New Fact', 'hash3', '2026-02-01')
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

  describe('getSourcesAddedSince', () => {
    it('should return sources added after date', () => {
      const sources = getSourcesAddedSince(db, '2026-01-15');

      expect(sources).toHaveLength(1);
      expect(sources[0].item).toBe('new.md');
      expect(sources[0].type).toBe('added');
      expect(sources[0].category).toBe('source');
    });

    it('should return empty for future date', () => {
      const sources = getSourcesAddedSince(db, '2026-12-01');
      expect(sources).toHaveLength(0);
    });
  });

  describe('getItemsAddedSince', () => {
    it('should return items of specified type', () => {
      const entities = getItemsAddedSince(db, '2026-01-15', 'entity');

      expect(entities).toHaveLength(1);
      expect(entities[0].item).toContain('New Entity');
      expect(entities[0].category).toBe('entity');
    });

    it('should return facts', () => {
      const facts = getItemsAddedSince(db, '2026-01-15', 'fact');

      expect(facts).toHaveLength(1);
      expect(facts[0].item).toContain('New Fact');
    });
  });

  describe('getChangeCounts', () => {
    it('should count changes by category', () => {
      const counts = getChangeCounts(db, '2026-01-15');

      expect(counts.sources.added).toBe(1);
      expect(counts.entities.added).toBe(1);
      expect(counts.facts.added).toBe(1);
    });
  });

  describe('generateChangelog', () => {
    it('should generate complete changelog', () => {
      const report = generateChangelog(db, '2026-01-15');

      expect(report.since).toBe('2026-01-15');
      expect(report.changes.length).toBeGreaterThan(0);
      expect(report.summary.sources.added).toBe(1);
      expect(report.highlights.length).toBeGreaterThan(0);
    });
  });
});

describe('generateHighlights', () => {
  it('should generate highlights from summary', () => {
    const summary: ChangeSummary = {
      sources: { added: 5, modified: 2, removed: 0 },
      entities: { added: 10, modified: 0, removed: 0 },
      facts: { added: 3, modified: 0, removed: 0 },
      tasks: { added: 0, modified: 0, removed: 0 },
      insights: { added: 1, modified: 0, removed: 0 },
    };

    const highlights = generateHighlights([], summary);

    expect(highlights).toContain('5 new sources ingested');
    expect(highlights).toContain('10 new entities discovered');
    expect(highlights).toContain('3 new facts extracted');
    expect(highlights).toContain('1 new insight generated');
  });

  it('should handle no changes', () => {
    const summary: ChangeSummary = {
      sources: { added: 0, modified: 0, removed: 0 },
      entities: { added: 0, modified: 0, removed: 0 },
      facts: { added: 0, modified: 0, removed: 0 },
      tasks: { added: 0, modified: 0, removed: 0 },
      insights: { added: 0, modified: 0, removed: 0 },
    };

    const highlights = generateHighlights([], summary);

    expect(highlights).toContain('No new items since last synthesis');
  });

  it('should use correct pluralization', () => {
    const summary: ChangeSummary = {
      sources: { added: 1, modified: 0, removed: 0 },
      entities: { added: 1, modified: 0, removed: 0 },
      facts: { added: 1, modified: 0, removed: 0 },
      tasks: { added: 1, modified: 0, removed: 0 },
      insights: { added: 1, modified: 0, removed: 0 },
    };

    const highlights = generateHighlights([], summary);

    expect(highlights).toContain('1 new source ingested');
    expect(highlights).toContain('1 new entity discovered');
    expect(highlights).toContain('1 new fact extracted');
    expect(highlights).toContain('1 new task identified');
    expect(highlights).toContain('1 new insight generated');
  });
});

describe('formatChangelogMarkdown', () => {
  it('should format changelog as markdown', () => {
    const report: ChangelogReport = {
      generatedAt: '2026-02-01T12:00:00Z',
      since: '2026-01-25T00:00:00Z',
      summary: {
        sources: { added: 2, modified: 1, removed: 0 },
        entities: { added: 5, modified: 0, removed: 0 },
        facts: { added: 3, modified: 0, removed: 0 },
        tasks: { added: 0, modified: 0, removed: 0 },
        insights: { added: 1, modified: 0, removed: 0 },
      },
      changes: [
        { type: 'added', category: 'source', item: 'doc.md', timestamp: '2026-02-01' },
        { type: 'added', category: 'entity', item: 'Test Entity', timestamp: '2026-02-01' },
      ],
      highlights: ['2 new sources ingested', '5 new entities discovered'],
    };

    const markdown = formatChangelogMarkdown(report);

    expect(markdown).toContain('# What Changed');
    expect(markdown).toContain('## Highlights');
    expect(markdown).toContain('2 new sources ingested');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('| Sources | 2 | 1 | 0 |');
    expect(markdown).toContain('## Source Changes');
    expect(markdown).toContain('➕ doc.md');
  });
});

describe('File operations', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-changelog-file-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '40_Brain', '.agent'), { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'docs'), { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);
    ensureExtractedAtColumn(db);

    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('test.md', 'test', 'markdown', 'hash', 100)
    `).run();
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'Content', 1, 10)
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

  describe('saveChangelog', () => {
    it('should save changelog to file', async () => {
      const report: ChangelogReport = {
        generatedAt: new Date().toISOString(),
        since: '2026-01-01',
        summary: {
          sources: { added: 0, modified: 0, removed: 0 },
          entities: { added: 0, modified: 0, removed: 0 },
          facts: { added: 0, modified: 0, removed: 0 },
          tasks: { added: 0, modified: 0, removed: 0 },
          insights: { added: 0, modified: 0, removed: 0 },
        },
        changes: [],
        highlights: ['No changes'],
      };

      const outputPath = join(testDir, 'changelog.md');
      await saveChangelog(report, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('# What Changed');
    });
  });

  describe('generateAndSaveChangelog', () => {
    it('should generate and save changelog', async () => {
      const result = await generateAndSaveChangelog(testDir, db, '2026-01-01');

      expect(result.report).toBeDefined();
      expect(existsSync(result.path)).toBe(true);

      // Should also save state
      const statePath = getSynthStatePath(testDir);
      expect(existsSync(statePath)).toBe(true);
    });
  });
});
