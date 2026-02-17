/**
 * Context bundle search module
 * Returns search results with citations and file paths
 */

import type { DatabaseInstance } from '../db/connection.js';
import { searchChunks, type ChunkSearchResult, type SearchOptions } from './fts.js';
import { parseScopes, type ParsedScope } from '../scope/parser.js';

/**
 * Citation for a search result
 */
export interface Citation {
  path: string;
  startLine?: number;
  endLine?: number;
  collection?: string;
}

/**
 * Context snippet with citation
 */
export interface ContextSnippet {
  content: string;
  highlights: string[];
  citation: Citation;
  score: number;
  sourceType: 'chunk' | 'item' | 'entity';
}

/**
 * Context bundle from search
 */
export interface ContextBundle {
  query: string;
  snippets: ContextSnippet[];
  totalMatches: number;
  scopes: ParsedScope[];
  searchTime: number;
}

/**
 * Context search options
 */
export interface ContextSearchOptions {
  scope?: string;
  limit?: number;
  minScore?: number;
}

/**
 * Convert chunk search result to context snippet
 */
function chunkToContextSnippet(result: ChunkSearchResult): ContextSnippet {
  return {
    content: result.content,
    highlights: result.highlights,
    citation: {
      path: result.sourcePath,
      startLine: result.startLine,
      endLine: result.endLine,
    },
    score: result.score,
    sourceType: 'chunk',
  };
}

/**
 * Search and return context bundle with citations
 */
export function searchWithContext(
  db: DatabaseInstance,
  query: string,
  options: ContextSearchOptions = {}
): ContextBundle {
  const startTime = Date.now();
  
  const scopes = parseScopes(options.scope || 'all');
  const limit = options.limit ?? 10;
  const minScore = options.minScore ?? 0;
  
  // Build search options
  const searchOpts: SearchOptions = {
    limit: limit * 2, // Fetch more to allow for filtering
    minScore,
  };
  
  // Get collection from scopes if present
  const collectionScopes = scopes.filter(s => s.type === 'collection');
  if (collectionScopes.length > 0) {
    searchOpts.collection = collectionScopes[0].value;
  }
  
  // Search chunks
  let results = searchChunks(db, query, searchOpts);
  
  // Apply path scope filtering (post-query for SQLite GLOB compatibility)
  const pathScopes = scopes.filter(s => s.type === 'path');
  if (pathScopes.length > 0) {
    results = results.filter(result => {
      if (!result.sourcePath) return false;
      return pathScopes.some(scope => {
        if (!scope.pattern) return true;
        return scope.pattern.test(result.sourcePath);
      });
    });
  }
  
  // Sort by score and limit
  results.sort((a, b) => b.score - a.score);
  results = results.slice(0, limit);
  
  // Convert to context snippets
  const snippets = results.map(chunkToContextSnippet);
  
  return {
    query,
    snippets,
    totalMatches: results.length,
    scopes,
    searchTime: Date.now() - startTime,
  };
}

/**
 * Format context bundle as markdown for LLM consumption
 */
export function formatContextAsMarkdown(bundle: ContextBundle): string {
  if (bundle.snippets.length === 0) {
    return `No results found for query: "${bundle.query}"`;
  }
  
  const lines: string[] = [
    `# Search Results for "${bundle.query}"`,
    '',
    `Found ${bundle.totalMatches} matches in ${bundle.searchTime}ms`,
    '',
  ];
  
  for (let i = 0; i < bundle.snippets.length; i++) {
    const snippet = bundle.snippets[i];
    const citation = snippet.citation;
    
    lines.push(`## Result ${i + 1}`);
    lines.push('');
    
    // Citation line
    const citationParts = [`**Source:** \`${citation.path}\``];
    if (citation.startLine !== undefined) {
      citationParts.push(`lines ${citation.startLine}-${citation.endLine}`);
    }
    if (citation.collection) {
      citationParts.push(`(${citation.collection})`);
    }
    lines.push(citationParts.join(' '));
    lines.push('');
    
    // Content
    lines.push('```');
    lines.push(snippet.content);
    lines.push('```');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Format context bundle as JSON for programmatic use
 */
export function formatContextAsJSON(bundle: ContextBundle): string {
  return JSON.stringify({
    query: bundle.query,
    totalMatches: bundle.totalMatches,
    searchTime: bundle.searchTime,
    results: bundle.snippets.map(s => ({
      content: s.content,
      path: s.citation.path,
      lines: s.citation.startLine !== undefined 
        ? `${s.citation.startLine}-${s.citation.endLine}`
        : null,
      collection: s.citation.collection,
      score: s.score,
      type: s.sourceType,
    })),
  }, null, 2);
}

/**
 * Get unique file paths from context bundle
 */
export function getUniquePaths(bundle: ContextBundle): string[] {
  const paths = new Set<string>();
  for (const snippet of bundle.snippets) {
    if (snippet.citation.path) {
      paths.add(snippet.citation.path);
    }
  }
  return Array.from(paths);
}

/**
 * Group snippets by file path
 */
export function groupSnippetsByPath(
  bundle: ContextBundle
): Map<string, ContextSnippet[]> {
  const groups = new Map<string, ContextSnippet[]>();
  
  for (const snippet of bundle.snippets) {
    const path = snippet.citation.path || 'unknown';
    const existing = groups.get(path) || [];
    existing.push(snippet);
    groups.set(path, existing);
  }
  
  return groups;
}

/**
 * Create citation string for a snippet
 */
export function formatCitation(citation: Citation): string {
  let result = citation.path;
  
  if (citation.startLine !== undefined) {
    result += `:${citation.startLine}`;
    if (citation.endLine !== undefined && citation.endLine !== citation.startLine) {
      result += `-${citation.endLine}`;
    }
  }
  
  return result;
}
