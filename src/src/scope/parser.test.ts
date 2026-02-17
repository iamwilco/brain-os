/**
 * Scope parser tests
 */

import { describe, it, expect } from 'vitest';
import {
  globToRegex,
  parseScope,
  matchesScope,
  filterByScope,
  parseScopes,
  matchesAnyScope,
  expandScopeAlias,
  isValidScope,
  describeSope,
  getCollectionsFromScopes,
  parseCollectionValue,
  matchesCollectionScope,
  buildCollectionWhereClause,
  buildPathWhereClause,
  buildScopeWhereClause,
} from './parser.js';

describe('globToRegex', () => {
  it('should match exact paths', () => {
    const regex = globToRegex('foo/bar.md');
    expect(regex.test('foo/bar.md')).toBe(true);
    expect(regex.test('foo/baz.md')).toBe(false);
  });

  it('should match single wildcard (*)', () => {
    const regex = globToRegex('*.md');
    expect(regex.test('file.md')).toBe(true);
    expect(regex.test('test.md')).toBe(true);
    expect(regex.test('file.txt')).toBe(false);
    expect(regex.test('dir/file.md')).toBe(false); // * doesn't match /
  });

  it('should match double wildcard (**)', () => {
    const regex = globToRegex('**/*.md');
    expect(regex.test('file.md')).toBe(true);
    expect(regex.test('dir/file.md')).toBe(true);
    expect(regex.test('a/b/c/file.md')).toBe(true);
    expect(regex.test('file.txt')).toBe(false);
  });

  it('should match question mark (?)', () => {
    const regex = globToRegex('file?.md');
    expect(regex.test('file1.md')).toBe(true);
    expect(regex.test('fileA.md')).toBe(true);
    expect(regex.test('file.md')).toBe(false);
    expect(regex.test('file12.md')).toBe(false);
  });

  it('should escape special regex characters', () => {
    const regex = globToRegex('file.name+test.md');
    expect(regex.test('file.name+test.md')).toBe(true);
    expect(regex.test('fileXname+test.md')).toBe(false);
  });

  it('should handle complex patterns', () => {
    const regex = globToRegex('30_Projects/*/docs/*.md');
    expect(regex.test('30_Projects/Brain/docs/readme.md')).toBe(true);
    expect(regex.test('30_Projects/Other/docs/guide.md')).toBe(true);
    expect(regex.test('30_Projects/Brain/readme.md')).toBe(false);
  });
});

describe('parseScope', () => {
  it('should parse "all" scope', () => {
    expect(parseScope('all')).toEqual({ type: 'all', value: '' });
    expect(parseScope('')).toEqual({ type: 'all', value: '' });
  });

  it('should parse path scope', () => {
    const scope = parseScope('path:30_Projects/*');
    expect(scope.type).toBe('path');
    expect(scope.value).toBe('30_Projects/*');
    expect(scope.pattern).toBeDefined();
  });

  it('should parse collection scope', () => {
    const scope = parseScope('collection:chatgpt');
    expect(scope.type).toBe('collection');
    expect(scope.value).toBe('chatgpt');
  });

  it('should parse tag scope', () => {
    const scope = parseScope('tag:important');
    expect(scope.type).toBe('tag');
    expect(scope.value).toBe('important');
  });

  it('should parse moc scope', () => {
    const scope = parseScope('moc:10_MOCs/Brain.md');
    expect(scope.type).toBe('moc');
    expect(scope.value).toBe('10_MOCs/Brain.md');
  });

  it('should default to path for unprefixed patterns', () => {
    const scope = parseScope('*.md');
    expect(scope.type).toBe('path');
    expect(scope.value).toBe('*.md');
  });
});

describe('matchesScope', () => {
  it('should match all scope', () => {
    const scope = parseScope('all');
    expect(matchesScope('any/path.md', scope)).toBe(true);
  });

  it('should match path patterns', () => {
    const scope = parseScope('path:30_Projects/**/*.md');
    expect(matchesScope('30_Projects/Brain/readme.md', scope)).toBe(true);
    expect(matchesScope('30_Projects/Other/docs/guide.md', scope)).toBe(true);
    expect(matchesScope('40_Brain/readme.md', scope)).toBe(false);
  });

  it('should match simple wildcards', () => {
    const scope = parseScope('path:*.md');
    expect(matchesScope('readme.md', scope)).toBe(true);
    expect(matchesScope('dir/readme.md', scope)).toBe(false);
  });
});

describe('filterByScope', () => {
  it('should filter paths by scope', () => {
    const paths = [
      '30_Projects/Brain/readme.md',
      '30_Projects/Other/guide.md',
      '40_Brain/config.ts',
      '70_Sources/data.json',
    ];
    
    const scope = parseScope('path:30_Projects/**');
    const filtered = filterByScope(paths, scope);
    
    expect(filtered).toHaveLength(2);
    expect(filtered).toContain('30_Projects/Brain/readme.md');
    expect(filtered).toContain('30_Projects/Other/guide.md');
  });

  it('should return all for "all" scope', () => {
    const paths = ['a.md', 'b.md', 'c.md'];
    const scope = parseScope('all');
    
    expect(filterByScope(paths, scope)).toEqual(paths);
  });
});

describe('parseScopes', () => {
  it('should parse single scope', () => {
    const scopes = parseScopes('path:*.md');
    expect(scopes).toHaveLength(1);
    expect(scopes[0].type).toBe('path');
  });

  it('should parse multiple comma-separated scopes', () => {
    const scopes = parseScopes('path:*.md, collection:chatgpt');
    expect(scopes).toHaveLength(2);
    expect(scopes[0].type).toBe('path');
    expect(scopes[1].type).toBe('collection');
  });

  it('should handle empty string', () => {
    const scopes = parseScopes('');
    expect(scopes).toHaveLength(1);
    expect(scopes[0].type).toBe('all');
  });
});

describe('matchesAnyScope', () => {
  it('should match if any scope matches', () => {
    const scopes = parseScopes('path:30_Projects/**, path:40_Brain/**');
    
    expect(matchesAnyScope('30_Projects/test.md', scopes)).toBe(true);
    expect(matchesAnyScope('40_Brain/config.ts', scopes)).toBe(true);
    expect(matchesAnyScope('70_Sources/data.json', scopes)).toBe(false);
  });
});

describe('expandScopeAlias', () => {
  it('should expand known aliases', () => {
    expect(expandScopeAlias('projects')).toBe('path:30_Projects/**');
    expect(expandScopeAlias('sources')).toBe('path:70_Sources/**');
    expect(expandScopeAlias('chatgpt')).toBe('collection:chatgpt');
  });

  it('should return unknown aliases unchanged', () => {
    expect(expandScopeAlias('path:custom/*')).toBe('path:custom/*');
    expect(expandScopeAlias('unknown')).toBe('unknown');
  });

  it('should be case-insensitive', () => {
    expect(expandScopeAlias('PROJECTS')).toBe('path:30_Projects/**');
    expect(expandScopeAlias('Projects')).toBe('path:30_Projects/**');
  });
});

describe('isValidScope', () => {
  it('should validate correct scopes', () => {
    expect(isValidScope('all')).toBe(true);
    expect(isValidScope('path:*.md')).toBe(true);
    expect(isValidScope('collection:test')).toBe(true);
    expect(isValidScope('30_Projects/**')).toBe(true);
  });
});

describe('describeSope', () => {
  it('should describe scopes', () => {
    expect(describeSope(parseScope('all'))).toBe('All files');
    expect(describeSope(parseScope('path:*.md'))).toContain('*.md');
    expect(describeSope(parseScope('collection:chatgpt'))).toContain('chatgpt');
    expect(describeSope(parseScope('tag:important'))).toContain('#important');
  });
});

describe('getCollectionsFromScopes', () => {
  it('should extract collection names', () => {
    const scopes = parseScopes('collection:chatgpt, path:*.md');
    const collections = getCollectionsFromScopes(scopes);
    
    expect(collections).toEqual(['chatgpt']);
  });

  it('should return empty for non-collection scopes', () => {
    const scopes = parseScopes('path:*.md');
    expect(getCollectionsFromScopes(scopes)).toEqual([]);
  });
});

describe('parseCollectionValue', () => {
  it('should parse single collection', () => {
    expect(parseCollectionValue('chatgpt')).toEqual(['chatgpt']);
  });

  it('should parse multiple collections with +', () => {
    expect(parseCollectionValue('chatgpt+claude')).toEqual(['chatgpt', 'claude']);
    expect(parseCollectionValue('a+b+c')).toEqual(['a', 'b', 'c']);
  });

  it('should handle whitespace', () => {
    expect(parseCollectionValue('chatgpt + claude')).toEqual(['chatgpt', 'claude']);
  });

  it('should filter empty values', () => {
    expect(parseCollectionValue('chatgpt++')).toEqual(['chatgpt']);
  });
});

describe('matchesCollectionScope', () => {
  it('should match single collection', () => {
    const scope = parseScope('collection:chatgpt');
    
    expect(matchesCollectionScope('chatgpt', scope)).toBe(true);
    expect(matchesCollectionScope('claude', scope)).toBe(false);
  });

  it('should match multiple collections', () => {
    const scope = parseScope('collection:chatgpt+claude');
    
    expect(matchesCollectionScope('chatgpt', scope)).toBe(true);
    expect(matchesCollectionScope('claude', scope)).toBe(true);
    expect(matchesCollectionScope('other', scope)).toBe(false);
  });

  it('should return true for non-collection scopes', () => {
    const scope = parseScope('path:*.md');
    expect(matchesCollectionScope('anything', scope)).toBe(true);
  });
});

describe('buildCollectionWhereClause', () => {
  it('should build single collection clause', () => {
    const scopes = [parseScope('collection:chatgpt')];
    const result = buildCollectionWhereClause(scopes);
    
    expect(result.clause).toBe('s.collection = ?');
    expect(result.params).toEqual(['chatgpt']);
  });

  it('should build multiple collection clause', () => {
    const scopes = [parseScope('collection:chatgpt+claude')];
    const result = buildCollectionWhereClause(scopes);
    
    expect(result.clause).toBe('s.collection IN (?, ?)');
    expect(result.params).toEqual(['chatgpt', 'claude']);
  });

  it('should return empty for no collection scopes', () => {
    const scopes = [parseScope('path:*.md')];
    const result = buildCollectionWhereClause(scopes);
    
    expect(result.clause).toBe('');
    expect(result.params).toEqual([]);
  });

  it('should support custom table alias', () => {
    const scopes = [parseScope('collection:test')];
    const result = buildCollectionWhereClause(scopes, 'sources');
    
    expect(result.clause).toBe('sources.collection = ?');
  });
});

describe('buildPathWhereClause', () => {
  it('should build path glob clause', () => {
    const scopes = [parseScope('path:30_Projects/*')];
    const result = buildPathWhereClause(scopes);
    
    expect(result.clause).toBe('s.path GLOB ?');
    expect(result.params).toEqual(['30_Projects/*']);
  });

  it('should handle multiple path scopes with OR', () => {
    const scopes = parseScopes('path:30_Projects/*, path:40_Brain/*');
    const result = buildPathWhereClause(scopes);
    
    expect(result.clause).toBe('(s.path GLOB ? OR s.path GLOB ?)');
    expect(result.params).toHaveLength(2);
  });

  it('should convert ** to * for SQLite GLOB', () => {
    const scopes = [parseScope('path:30_Projects/**/*.md')];
    const result = buildPathWhereClause(scopes);
    
    expect(result.params[0]).toBe('30_Projects/*/*.md');
  });
});

describe('buildScopeWhereClause', () => {
  it('should combine collection and path scopes', () => {
    const scopes = parseScopes('collection:chatgpt, path:*.md');
    const result = buildScopeWhereClause(scopes);
    
    expect(result.clause).toContain('collection');
    expect(result.clause).toContain('AND');
    expect(result.clause).toContain('GLOB');
  });

  it('should return empty for "all" scope', () => {
    const scopes = [parseScope('all')];
    const result = buildScopeWhereClause(scopes);
    
    expect(result.clause).toBe('');
    expect(result.params).toEqual([]);
  });

  it('should handle collection-only scope', () => {
    const scopes = [parseScope('collection:test')];
    const result = buildScopeWhereClause(scopes);
    
    expect(result.clause).toBe('s.collection = ?');
    expect(result.params).toEqual(['test']);
  });
});
