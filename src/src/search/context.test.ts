/**
 * Context search tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  searchWithContext,
  formatContextAsMarkdown,
  formatContextAsJSON,
  getUniquePaths,
  groupSnippetsByPath,
  formatCitation,
  type ContextBundle,
  type ContextSnippet,
} from './context.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import type { DatabaseInstance } from '../db/connection.js';

describe('Context search integration', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-context-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    
    // Insert test data
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('30_Projects/Brain/readme.md', 'projects', 'markdown', 'abc123', 100)
    `).run();
    
    const sourceId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
    
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (?, 0, 'This is a test document about artificial intelligence and machine learning.', 1, 5)
    `).run(sourceId);
    
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (?, 1, 'Natural language processing is a branch of AI.', 6, 10)
    `).run(sourceId);
    
    // Second source
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('70_Sources/chatgpt/conversation.md', 'chatgpt', 'markdown', 'def456', 200)
    `).run();
    
    const source2Id = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
    
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (?, 0, 'ChatGPT conversation about machine learning models.', 1, 3)
    `).run(source2Id);
  });

  afterEach(async () => {
    closeDatabase(db);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('searchWithContext', () => {
    it('should return context bundle with snippets', () => {
      const bundle = searchWithContext(db, 'machine learning');
      
      expect(bundle.query).toBe('machine learning');
      expect(bundle.snippets.length).toBeGreaterThan(0);
      expect(bundle.searchTime).toBeGreaterThanOrEqual(0);
    });

    it('should include citations in snippets', () => {
      const bundle = searchWithContext(db, 'artificial intelligence');
      
      expect(bundle.snippets.length).toBeGreaterThan(0);
      expect(bundle.snippets[0].citation.path).toBeDefined();
      expect(bundle.snippets[0].citation.startLine).toBeDefined();
    });

    it('should respect limit option', () => {
      const bundle = searchWithContext(db, 'learning', { limit: 1 });
      
      expect(bundle.snippets.length).toBeLessThanOrEqual(1);
    });

    it('should filter by collection scope', () => {
      const bundle = searchWithContext(db, 'learning', { 
        scope: 'collection:chatgpt' 
      });
      
      // Should only find results from chatgpt collection
      for (const snippet of bundle.snippets) {
        expect(snippet.citation.path).toContain('chatgpt');
      }
    });

    it('should filter by path scope', () => {
      const bundle = searchWithContext(db, 'learning', { 
        scope: 'path:30_Projects/**' 
      });
      
      // Should only find results from Projects
      for (const snippet of bundle.snippets) {
        expect(snippet.citation.path).toContain('30_Projects');
      }
    });

    it('should return empty for no matches', () => {
      const bundle = searchWithContext(db, 'xyznonexistent');
      
      expect(bundle.snippets).toHaveLength(0);
      expect(bundle.totalMatches).toBe(0);
    });
  });
});

describe('formatContextAsMarkdown', () => {
  it('should format bundle as markdown', () => {
    const bundle: ContextBundle = {
      query: 'test query',
      snippets: [{
        content: 'Test content here',
        highlights: ['<mark>test</mark> content'],
        citation: {
          path: 'test/file.md',
          startLine: 1,
          endLine: 5,
        },
        score: 1.0,
        sourceType: 'chunk',
      }],
      totalMatches: 1,
      scopes: [{ type: 'all', value: '' }],
      searchTime: 10,
    };
    
    const markdown = formatContextAsMarkdown(bundle);
    
    expect(markdown).toContain('test query');
    expect(markdown).toContain('test/file.md');
    expect(markdown).toContain('Test content here');
  });

  it('should handle empty results', () => {
    const bundle: ContextBundle = {
      query: 'no results',
      snippets: [],
      totalMatches: 0,
      scopes: [{ type: 'all', value: '' }],
      searchTime: 5,
    };
    
    const markdown = formatContextAsMarkdown(bundle);
    
    expect(markdown).toContain('No results found');
  });
});

describe('formatContextAsJSON', () => {
  it('should format bundle as JSON', () => {
    const bundle: ContextBundle = {
      query: 'test',
      snippets: [{
        content: 'Content',
        highlights: [],
        citation: { path: 'file.md', startLine: 1, endLine: 2 },
        score: 0.9,
        sourceType: 'chunk',
      }],
      totalMatches: 1,
      scopes: [{ type: 'all', value: '' }],
      searchTime: 5,
    };
    
    const json = formatContextAsJSON(bundle);
    const parsed = JSON.parse(json);
    
    expect(parsed.query).toBe('test');
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].path).toBe('file.md');
  });
});

describe('getUniquePaths', () => {
  it('should return unique file paths', () => {
    const bundle: ContextBundle = {
      query: 'test',
      snippets: [
        { content: '', highlights: [], citation: { path: 'a.md' }, score: 1, sourceType: 'chunk' },
        { content: '', highlights: [], citation: { path: 'b.md' }, score: 1, sourceType: 'chunk' },
        { content: '', highlights: [], citation: { path: 'a.md' }, score: 1, sourceType: 'chunk' },
      ],
      totalMatches: 3,
      scopes: [],
      searchTime: 0,
    };
    
    const paths = getUniquePaths(bundle);
    
    expect(paths).toHaveLength(2);
    expect(paths).toContain('a.md');
    expect(paths).toContain('b.md');
  });
});

describe('groupSnippetsByPath', () => {
  it('should group snippets by file path', () => {
    const bundle: ContextBundle = {
      query: 'test',
      snippets: [
        { content: '1', highlights: [], citation: { path: 'a.md' }, score: 1, sourceType: 'chunk' },
        { content: '2', highlights: [], citation: { path: 'b.md' }, score: 1, sourceType: 'chunk' },
        { content: '3', highlights: [], citation: { path: 'a.md' }, score: 1, sourceType: 'chunk' },
      ],
      totalMatches: 3,
      scopes: [],
      searchTime: 0,
    };
    
    const groups = groupSnippetsByPath(bundle);
    
    expect(groups.size).toBe(2);
    expect(groups.get('a.md')).toHaveLength(2);
    expect(groups.get('b.md')).toHaveLength(1);
  });
});

describe('formatCitation', () => {
  it('should format citation with lines', () => {
    const citation = { path: 'file.md', startLine: 10, endLine: 20 };
    expect(formatCitation(citation)).toBe('file.md:10-20');
  });

  it('should format citation with single line', () => {
    const citation = { path: 'file.md', startLine: 5, endLine: 5 };
    expect(formatCitation(citation)).toBe('file.md:5');
  });

  it('should format citation without lines', () => {
    const citation = { path: 'file.md' };
    expect(formatCitation(citation)).toBe('file.md');
  });
});
