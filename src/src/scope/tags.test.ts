/**
 * Tag filter tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseTagValue,
  extractTagsFromFrontmatter,
  extractFrontmatter,
  getTagsFromContent,
  matchesTagFilter,
  matchesTagScope,
  describeTagFilter,
} from './tags.js';
import { parseScope } from './parser.js';

describe('parseTagValue', () => {
  it('should parse single tag', () => {
    const result = parseTagValue('moneta');
    expect(result.tags).toEqual(['moneta']);
    expect(result.mode).toBe('any');
  });

  it('should parse multiple tags with OR (|)', () => {
    const result = parseTagValue('moneta|project');
    expect(result.tags).toEqual(['moneta', 'project']);
    expect(result.mode).toBe('any');
  });

  it('should parse multiple tags with AND (+)', () => {
    const result = parseTagValue('moneta+important');
    expect(result.tags).toEqual(['moneta', 'important']);
    expect(result.mode).toBe('all');
  });

  it('should handle whitespace', () => {
    const result = parseTagValue('moneta | project');
    expect(result.tags).toEqual(['moneta', 'project']);
  });

  it('should filter empty tags', () => {
    const result = parseTagValue('moneta||');
    expect(result.tags).toEqual(['moneta']);
  });
});

describe('extractFrontmatter', () => {
  it('should extract frontmatter from markdown', () => {
    const content = `---
title: Test
tags: [foo, bar]
---

# Content here`;
    
    const fm = extractFrontmatter(content);
    expect(fm).toContain('title: Test');
    expect(fm).toContain('tags: [foo, bar]');
  });

  it('should return null for no frontmatter', () => {
    const content = '# Just a heading\n\nSome content';
    expect(extractFrontmatter(content)).toBeNull();
  });
});

describe('extractTagsFromFrontmatter', () => {
  it('should extract array format tags', () => {
    const fm = 'title: Test\ntags: [foo, bar, baz]';
    const tags = extractTagsFromFrontmatter(fm);
    
    expect(tags).toEqual(['foo', 'bar', 'baz']);
  });

  it('should extract inline format tags', () => {
    const fm = 'title: Test\ntags: foo, bar';
    const tags = extractTagsFromFrontmatter(fm);
    
    expect(tags).toEqual(['foo', 'bar']);
  });

  it('should extract YAML list format tags', () => {
    const fm = `title: Test
tags:
  - foo
  - bar
  - baz`;
    const tags = extractTagsFromFrontmatter(fm);
    
    expect(tags).toContain('foo');
    expect(tags).toContain('bar');
    expect(tags).toContain('baz');
  });

  it('should remove # prefix from tags', () => {
    const fm = 'tags: [#foo, #bar]';
    const tags = extractTagsFromFrontmatter(fm);
    
    expect(tags).toEqual(['foo', 'bar']);
  });

  it('should handle quoted tags', () => {
    const fm = 'tags: ["foo", \'bar\']';
    const tags = extractTagsFromFrontmatter(fm);
    
    expect(tags).toEqual(['foo', 'bar']);
  });
});

describe('getTagsFromContent', () => {
  it('should get tags from markdown content', () => {
    const content = `---
tags: [moneta, project]
---

# My Note`;
    
    const tags = getTagsFromContent(content);
    expect(tags).toEqual(['moneta', 'project']);
  });

  it('should return empty for content without frontmatter', () => {
    const content = '# Just a heading';
    expect(getTagsFromContent(content)).toEqual([]);
  });
});

describe('matchesTagFilter', () => {
  it('should match single tag', () => {
    const filter = parseTagValue('moneta');
    
    expect(matchesTagFilter(['moneta', 'other'], filter)).toBe(true);
    expect(matchesTagFilter(['other'], filter)).toBe(false);
  });

  it('should match any tag (OR mode)', () => {
    const filter = parseTagValue('moneta|project');
    
    expect(matchesTagFilter(['moneta'], filter)).toBe(true);
    expect(matchesTagFilter(['project'], filter)).toBe(true);
    expect(matchesTagFilter(['other'], filter)).toBe(false);
  });

  it('should match all tags (AND mode)', () => {
    const filter = parseTagValue('moneta+important');
    
    expect(matchesTagFilter(['moneta', 'important', 'other'], filter)).toBe(true);
    expect(matchesTagFilter(['moneta'], filter)).toBe(false);
    expect(matchesTagFilter(['important'], filter)).toBe(false);
  });

  it('should be case-insensitive', () => {
    const filter = parseTagValue('Moneta');
    
    expect(matchesTagFilter(['moneta'], filter)).toBe(true);
    expect(matchesTagFilter(['MONETA'], filter)).toBe(true);
  });

  it('should return true for empty filter', () => {
    const filter = { tags: [], mode: 'any' as const };
    expect(matchesTagFilter(['anything'], filter)).toBe(true);
  });
});

describe('matchesTagScope', () => {
  it('should match content with tag scope', () => {
    const content = `---
tags: [moneta, project]
---
# Note`;
    
    const scope = parseScope('tag:moneta');
    expect(matchesTagScope(content, scope)).toBe(true);
  });

  it('should not match content without tag', () => {
    const content = `---
tags: [other]
---
# Note`;
    
    const scope = parseScope('tag:moneta');
    expect(matchesTagScope(content, scope)).toBe(false);
  });

  it('should return true for non-tag scopes', () => {
    const content = '# No tags';
    const scope = parseScope('path:*.md');
    
    expect(matchesTagScope(content, scope)).toBe(true);
  });
});

describe('describeTagFilter', () => {
  it('should describe single tag', () => {
    const filter = parseTagValue('moneta');
    expect(describeTagFilter(filter)).toBe('Tag: #moneta');
  });

  it('should describe OR tags', () => {
    const filter = parseTagValue('moneta|project');
    expect(describeTagFilter(filter)).toContain('#moneta');
    expect(describeTagFilter(filter)).toContain('OR');
    expect(describeTagFilter(filter)).toContain('#project');
  });

  it('should describe AND tags', () => {
    const filter = parseTagValue('moneta+important');
    expect(describeTagFilter(filter)).toContain('AND');
  });

  it('should describe empty filter', () => {
    const filter = { tags: [], mode: 'any' as const };
    expect(describeTagFilter(filter)).toBe('No tags');
  });
});
