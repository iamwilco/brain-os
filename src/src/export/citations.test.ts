/**
 * Citations and snippets tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getCitationsFromDb,
  getSnippetsForFile,
  buildCitationsIndex,
  formatCitation,
  formatCitationMarkdown,
  generateCitationsMarkdown,
  generateSnippetsMarkdown,
  extractKeySnippets,
  createProvenanceHeader,
  type Citation,
  type Snippet,
} from './citations.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { ensureItemsTable } from '../item/idempotent.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('getCitationsFromDb', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-citations-test-${Date.now()}`);
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
      VALUES (1, 0, 'Test chunk content', 1, 10)
    `).run();
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content, hash, confidence)
      VALUES (1, 'fact', 'This is a test fact', 'hash1', 0.95)
    `).run();
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content, hash)
      VALUES (1, 'entity', 'Test Entity', 'hash2')
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

  it('should get citations from database', () => {
    const citations = getCitationsFromDb(db);

    expect(citations).toHaveLength(2);
    expect(citations[0].sourcePath).toBe('docs/test.md');
    expect(citations[0].type).toBe('fact');
  });

  it('should filter by source paths', () => {
    const citations = getCitationsFromDb(db, ['docs/test.md']);

    expect(citations).toHaveLength(2);
  });

  it('should return empty for non-matching paths', () => {
    const citations = getCitationsFromDb(db, ['nonexistent.md']);

    expect(citations).toHaveLength(0);
  });

  it('should include confidence when present', () => {
    const citations = getCitationsFromDb(db);
    const factCitation = citations.find(c => c.type === 'fact');

    expect(factCitation?.confidence).toBe(0.95);
  });
});

describe('getSnippetsForFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-snippets-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should extract snippets from markdown file', async () => {
    const content = `# Main Title

Introduction paragraph.

## Section One

Content of section one.

## Section Two

Content of section two.
`;
    await writeFile(join(testDir, 'test.md'), content);

    const snippets = await getSnippetsForFile(testDir, 'test.md');

    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].sourcePath).toBe('test.md');
  });

  it('should return empty for non-existent file', async () => {
    const snippets = await getSnippetsForFile(testDir, 'nonexistent.md');

    expect(snippets).toHaveLength(0);
  });

  it('should respect maxSnippets limit', async () => {
    const content = `# One
Content
# Two
Content
# Three
Content
# Four
Content
`;
    await writeFile(join(testDir, 'test.md'), content);

    const snippets = await getSnippetsForFile(testDir, 'test.md', 2);

    expect(snippets.length).toBeLessThanOrEqual(2);
  });
});

describe('buildCitationsIndex', () => {
  it('should build index from citations', () => {
    const citations: Citation[] = [
      { id: 'c1', sourceFile: 'a.md', sourcePath: 'docs/a.md', content: 'Fact 1', type: 'fact' },
      { id: 'c2', sourceFile: 'a.md', sourcePath: 'docs/a.md', content: 'Fact 2', type: 'fact' },
      { id: 'c3', sourceFile: 'b.md', sourcePath: 'docs/b.md', content: 'Entity', type: 'entity' },
    ];

    const index = buildCitationsIndex(citations);

    expect(index.totalCitations).toBe(3);
    expect(Object.keys(index.bySource)).toHaveLength(2);
    expect(index.bySource['docs/a.md']).toHaveLength(2);
    expect(index.byType['fact']).toHaveLength(2);
    expect(index.byType['entity']).toHaveLength(1);
  });
});

describe('formatCitation', () => {
  it('should format citation with line numbers', () => {
    const citation: Citation = {
      id: 'c1',
      sourceFile: 'test.md',
      sourcePath: 'docs/test.md',
      lineStart: 10,
      lineEnd: 15,
      content: 'Content',
      type: 'fact',
    };

    const formatted = formatCitation(citation);

    expect(formatted).toBe('[test.md:L10-15]');
  });

  it('should format citation without line numbers', () => {
    const citation: Citation = {
      id: 'c1',
      sourceFile: 'test.md',
      sourcePath: 'docs/test.md',
      content: 'Content',
      type: 'fact',
    };

    const formatted = formatCitation(citation);

    expect(formatted).toBe('[test.md]');
  });

  it('should format single line citation', () => {
    const citation: Citation = {
      id: 'c1',
      sourceFile: 'test.md',
      sourcePath: 'docs/test.md',
      lineStart: 10,
      lineEnd: 10,
      content: 'Content',
      type: 'fact',
    };

    const formatted = formatCitation(citation);

    expect(formatted).toBe('[test.md:L10]');
  });
});

describe('formatCitationMarkdown', () => {
  it('should format as blockquote', () => {
    const citation: Citation = {
      id: 'c1',
      sourceFile: 'test.md',
      sourcePath: 'docs/test.md',
      content: 'This is important',
      type: 'fact',
    };

    const markdown = formatCitationMarkdown(citation);

    expect(markdown).toContain('> This is important');
    expect(markdown).toContain('[test.md]');
    expect(markdown).toContain('(fact)');
  });

  it('should include confidence when low', () => {
    const citation: Citation = {
      id: 'c1',
      sourceFile: 'test.md',
      sourcePath: 'docs/test.md',
      content: 'Maybe true',
      type: 'fact',
      confidence: 0.7,
    };

    const markdown = formatCitationMarkdown(citation);

    expect(markdown).toContain('Confidence: 70%');
  });
});

describe('generateCitationsMarkdown', () => {
  it('should generate markdown document', () => {
    const index = {
      generatedAt: '2026-02-01T12:00:00Z',
      totalCitations: 2,
      bySource: {
        'docs/test.md': [
          { id: 'c1', sourceFile: 'test.md', sourcePath: 'docs/test.md', content: 'Fact', type: 'fact' as const },
        ],
      },
      byType: {
        fact: [
          { id: 'c1', sourceFile: 'test.md', sourcePath: 'docs/test.md', content: 'Fact', type: 'fact' as const },
        ],
      },
    };

    const markdown = generateCitationsMarkdown(index);

    expect(markdown).toContain('# Citations');
    expect(markdown).toContain('## Summary by Type');
    expect(markdown).toContain('## Citations by Source');
    expect(markdown).toContain('### test.md');
  });
});

describe('generateSnippetsMarkdown', () => {
  it('should generate snippets document', () => {
    const snippets: Snippet[] = [
      {
        id: 'snip-1',
        content: '# Section\n\nContent here',
        context: 'Section',
        sourcePath: 'docs/test.md',
        lineNumbers: { start: 1, end: 5 },
      },
    ];

    const markdown = generateSnippetsMarkdown(snippets, 'docs/test.md');

    expect(markdown).toContain('# Snippets: test.md');
    expect(markdown).toContain('## Section');
    expect(markdown).toContain('Lines 1-5');
    expect(markdown).toContain('```markdown');
  });
});

describe('extractKeySnippets', () => {
  it('should extract sections as snippets', () => {
    const content = `# Title

Intro text.

## Section One

First section content.

## Section Two

Second section content.
`;

    const snippets = extractKeySnippets(content, 500);

    expect(snippets.length).toBeGreaterThan(0);
  });

  it('should respect max length', () => {
    const content = 'A'.repeat(1000) + '\n\n## Section\n\n' + 'B'.repeat(1000);

    const snippets = extractKeySnippets(content, 500);
    const totalLength = snippets.join('').length;

    expect(totalLength).toBeLessThanOrEqual(550); // Some buffer for truncation
  });
});

describe('createProvenanceHeader', () => {
  it('should create YAML frontmatter', () => {
    const header = createProvenanceHeader('docs/test.md', '2026-02-01', 5);

    expect(header).toContain('---');
    expect(header).toContain('source: "docs/test.md"');
    expect(header).toContain('extracted: "2026-02-01"');
    expect(header).toContain('citations: 5');
  });
});
