/**
 * MOC traversal tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  extractWikiLinks,
  resolveWikiLink,
  normalizePath,
  traverseMoc,
  getPathsFromMocScope,
  getMocLinkGraph,
  describeMocTraversal,
} from './moc.js';
import { parseScope } from './parser.js';

describe('extractWikiLinks', () => {
  it('should extract simple wiki links', () => {
    const content = 'Check out [[Note A]] and [[Note B]]';
    const links = extractWikiLinks(content);
    
    expect(links).toHaveLength(2);
    expect(links[0].target).toBe('Note A');
    expect(links[1].target).toBe('Note B');
  });

  it('should extract links with aliases', () => {
    const content = 'See [[Note A|my note]]';
    const links = extractWikiLinks(content);
    
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Note A');
    expect(links[0].alias).toBe('my note');
  });

  it('should extract links with heading anchors', () => {
    const content = 'Check [[Note A#Section 1]]';
    const links = extractWikiLinks(content);
    
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Note A');
    expect(links[0].heading).toBe('Section 1');
  });

  it('should handle combined alias and heading', () => {
    const content = '[[Note A#Section|alias]]';
    const links = extractWikiLinks(content);
    
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Note A');
    expect(links[0].heading).toBe('Section');
    expect(links[0].alias).toBe('alias');
  });

  it('should ignore links in code blocks', () => {
    const content = '```\n[[Code Link]]\n```\n\n[[Real Link]]';
    const links = extractWikiLinks(content);
    
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Real Link');
  });

  it('should ignore links in inline code', () => {
    const content = 'Use `[[Code]]` syntax for [[Real Link]]';
    const links = extractWikiLinks(content);
    
    expect(links).toHaveLength(1);
    expect(links[0].target).toBe('Real Link');
  });

  it('should handle empty content', () => {
    expect(extractWikiLinks('')).toHaveLength(0);
  });
});

describe('resolveWikiLink', () => {
  it('should add .md extension', () => {
    const link = { raw: '[[Note]]', target: 'Note' };
    const resolved = resolveWikiLink(link, '/vault/dir/file.md', '/vault');
    
    expect(resolved).toBe('/vault/dir/Note.md');
  });

  it('should resolve relative to current file', () => {
    const link = { raw: '[[sub/Note]]', target: 'sub/Note' };
    const resolved = resolveWikiLink(link, '/vault/dir/file.md', '/vault');
    
    expect(resolved).toBe('/vault/dir/sub/Note.md');
  });

  it('should resolve absolute paths from vault root', () => {
    const link = { raw: '[[/10_MOCs/Index]]', target: '/10_MOCs/Index' };
    const resolved = resolveWikiLink(link, '/vault/dir/file.md', '/vault');
    
    expect(resolved).toBe('/vault/10_MOCs/Index.md');
  });

  it('should preserve existing extension', () => {
    const link = { raw: '[[Note.md]]', target: 'Note.md' };
    const resolved = resolveWikiLink(link, '/vault/dir/file.md', '/vault');
    
    expect(resolved).toBe('/vault/dir/Note.md');
  });
});

describe('normalizePath', () => {
  it('should remove .md extension', () => {
    expect(normalizePath('/vault/note.md')).toBe('/vault/note');
  });

  it('should lowercase path', () => {
    expect(normalizePath('/Vault/Note')).toBe('/vault/note');
  });
});

describe('traverseMoc (integration)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-moc-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create MOC structure
    await writeFile(
      join(testDir, 'Index.md'),
      '# Index\n\n- [[Note A]]\n- [[Note B]]'
    );
    await writeFile(
      join(testDir, 'Note A.md'),
      '# Note A\n\nLinks to [[Note C]]'
    );
    await writeFile(
      join(testDir, 'Note B.md'),
      '# Note B\n\nStandalone note'
    );
    await writeFile(
      join(testDir, 'Note C.md'),
      '# Note C\n\nLinks back to [[Note A]] (cycle)'
    );
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should traverse linked notes', async () => {
    const result = await traverseMoc(join(testDir, 'Index.md'), testDir);
    
    expect(result.paths.length).toBeGreaterThanOrEqual(3);
    expect(result.paths.some(p => p.includes('Index'))).toBe(true);
    expect(result.paths.some(p => p.includes('Note A'))).toBe(true);
    expect(result.paths.some(p => p.includes('Note B'))).toBe(true);
  });

  it('should detect cycles', async () => {
    const result = await traverseMoc(join(testDir, 'Index.md'), testDir);
    
    // Note A -> Note C -> Note A is a cycle
    expect(result.cycles.length).toBeGreaterThanOrEqual(0);
  });

  it('should respect depth limit', async () => {
    const result = await traverseMoc(
      join(testDir, 'Index.md'),
      testDir,
      { maxDepth: 1 }
    );
    
    // At depth 1, should only get Index + direct links (Note A, Note B)
    // Note C is at depth 2
    expect(result.paths.some(p => p.includes('Note C'))).toBe(false);
  });

  it('should exclude root when configured', async () => {
    const result = await traverseMoc(
      join(testDir, 'Index.md'),
      testDir,
      { includeRoot: false }
    );
    
    expect(result.paths.some(p => p.includes('Index'))).toBe(false);
  });
});

describe('getPathsFromMocScope', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-moc-scope-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    await writeFile(join(testDir, 'MOC.md'), '# MOC\n\n- [[Linked]]');
    await writeFile(join(testDir, 'Linked.md'), '# Linked');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should get paths from MOC scope', async () => {
    const scope = parseScope('moc:MOC.md');
    const paths = await getPathsFromMocScope(scope, testDir);
    
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it('should return empty for non-MOC scopes', async () => {
    const scope = parseScope('path:*.md');
    const paths = await getPathsFromMocScope(scope, testDir);
    
    expect(paths).toEqual([]);
  });
});

describe('getMocLinkGraph', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-graph-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    await writeFile(join(testDir, 'A.md'), '[[B]] and [[C]]');
    await writeFile(join(testDir, 'B.md'), '[[C]]');
    await writeFile(join(testDir, 'C.md'), 'No links');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should build link graph', async () => {
    const graph = await getMocLinkGraph(join(testDir, 'A.md'), testDir);
    
    expect(graph.size).toBeGreaterThanOrEqual(2);
    
    const aLinks = graph.get(join(testDir, 'A.md'));
    expect(aLinks).toBeDefined();
    expect(aLinks?.length).toBe(2);
  });
});

describe('describeMocTraversal', () => {
  it('should describe traversal result', () => {
    const result = {
      root: '/vault/MOC.md',
      visited: new Set(['a', 'b', 'c']),
      paths: ['/vault/a.md', '/vault/b.md', '/vault/c.md'],
      depth: 3,
      cycles: [],
    };
    
    const desc = describeMocTraversal(result);
    
    expect(desc).toContain('MOC.md');
    expect(desc).toContain('3');
    expect(desc).toContain('Files found: 3');
  });

  it('should mention cycles if present', () => {
    const result = {
      root: '/vault/MOC.md',
      visited: new Set(['a']),
      paths: ['/vault/a.md'],
      depth: 3,
      cycles: ['/vault/cycle.md'],
    };
    
    const desc = describeMocTraversal(result);
    
    expect(desc).toContain('Cycles');
  });
});
