/**
 * Tag filter module
 * Filters content by frontmatter tags with AND/OR logic
 */

import type { ParsedScope } from './parser.js';

/**
 * Tag match mode
 */
export type TagMatchMode = 'any' | 'all';

/**
 * Parsed tag filter
 */
export interface ParsedTagFilter {
  tags: string[];
  mode: TagMatchMode;
}

/**
 * Parse tag value from scope
 * Supports:
 * - Single tag: "tag:moneta"
 * - Multiple with OR (any): "tag:moneta|project"
 * - Multiple with AND (all): "tag:moneta+project"
 */
export function parseTagValue(value: string): ParsedTagFilter {
  // Check for AND mode (+)
  if (value.includes('+')) {
    return {
      tags: value.split('+').map(t => t.trim()).filter(t => t.length > 0),
      mode: 'all',
    };
  }
  
  // Check for OR mode (|)
  if (value.includes('|')) {
    return {
      tags: value.split('|').map(t => t.trim()).filter(t => t.length > 0),
      mode: 'any',
    };
  }
  
  // Single tag
  return {
    tags: [value.trim()].filter(t => t.length > 0),
    mode: 'any',
  };
}

/**
 * Extract tags from frontmatter YAML
 * Handles both array and string formats
 */
export function extractTagsFromFrontmatter(frontmatter: string): string[] {
  const tags: string[] = [];
  
  // Match tags: [...] or tags: tag1, tag2
  const tagsMatch = frontmatter.match(/^tags:\s*(.+)$/m);
  if (tagsMatch) {
    const value = tagsMatch[1].trim();
    
    // Array format: [tag1, tag2]
    if (value.startsWith('[')) {
      const arrayContent = value.slice(1, -1);
      tags.push(...arrayContent.split(',').map(t => t.trim().replace(/["']/g, '')));
    } else {
      // Inline format: tag1, tag2 or single tag
      tags.push(...value.split(',').map(t => t.trim()));
    }
  }
  
  // Also match YAML list format:
  // tags:
  //   - tag1
  //   - tag2
  const listMatch = frontmatter.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m);
  if (listMatch) {
    const items = listMatch[1].match(/-\s+(.+)/g);
    if (items) {
      tags.push(...items.map(item => item.replace(/^-\s+/, '').trim()));
    }
  }
  
  // Remove # prefix if present
  return tags.map(t => t.replace(/^#/, '')).filter(t => t.length > 0);
}

/**
 * Extract frontmatter from markdown content
 */
export function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

/**
 * Get tags from markdown content
 */
export function getTagsFromContent(content: string): string[] {
  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) {
    return [];
  }
  return extractTagsFromFrontmatter(frontmatter);
}

/**
 * Check if content matches tag filter
 */
export function matchesTagFilter(
  contentTags: string[],
  filter: ParsedTagFilter
): boolean {
  if (filter.tags.length === 0) {
    return true;
  }
  
  // Normalize tags for comparison (lowercase)
  const normalizedContentTags = contentTags.map(t => t.toLowerCase());
  const normalizedFilterTags = filter.tags.map(t => t.toLowerCase());
  
  if (filter.mode === 'all') {
    // All filter tags must be present
    return normalizedFilterTags.every(tag => normalizedContentTags.includes(tag));
  } else {
    // At least one filter tag must be present
    return normalizedFilterTags.some(tag => normalizedContentTags.includes(tag));
  }
}

/**
 * Check if content matches tag scope
 */
export function matchesTagScope(content: string, scope: ParsedScope): boolean {
  if (scope.type !== 'tag') {
    return true; // Non-tag scopes don't filter by tags
  }
  
  const contentTags = getTagsFromContent(content);
  const filter = parseTagValue(scope.value);
  
  return matchesTagFilter(contentTags, filter);
}

/**
 * Get tag scopes from parsed scopes
 */
export function getTagScopes(scopes: ParsedScope[]): ParsedScope[] {
  return scopes.filter(s => s.type === 'tag');
}

/**
 * Check if content matches any tag scope
 */
export function matchesAnyTagScope(content: string, scopes: ParsedScope[]): boolean {
  const tagScopes = getTagScopes(scopes);
  
  if (tagScopes.length === 0) {
    return true; // No tag filters means all content matches
  }
  
  return tagScopes.some(scope => matchesTagScope(content, scope));
}

/**
 * Filter contents by tag scopes
 */
export function filterByTagScopes(
  items: Array<{ content: string; [key: string]: unknown }>,
  scopes: ParsedScope[]
): Array<{ content: string; [key: string]: unknown }> {
  const tagScopes = getTagScopes(scopes);
  
  if (tagScopes.length === 0) {
    return items;
  }
  
  return items.filter(item => matchesAnyTagScope(item.content, scopes));
}

/**
 * Build description of tag filter
 */
export function describeTagFilter(filter: ParsedTagFilter): string {
  if (filter.tags.length === 0) {
    return 'No tags';
  }
  
  if (filter.tags.length === 1) {
    return `Tag: #${filter.tags[0]}`;
  }
  
  const operator = filter.mode === 'all' ? ' AND ' : ' OR ';
  return `Tags: ${filter.tags.map(t => `#${t}`).join(operator)}`;
}
