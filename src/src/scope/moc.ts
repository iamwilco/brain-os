/**
 * MOC (Map of Content) traversal module
 * Parses wiki links and traverses linked notes
 */

import { readFile } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import type { ParsedScope } from './parser.js';

/**
 * Wiki link match result
 */
export interface WikiLink {
  raw: string;
  target: string;
  alias?: string;
  heading?: string;
}

/**
 * MOC traversal options
 */
export interface TraversalOptions {
  maxDepth?: number;
  includeRoot?: boolean;
  followBacklinks?: boolean;
}

/**
 * MOC traversal result
 */
export interface TraversalResult {
  root: string;
  visited: Set<string>;
  paths: string[];
  depth: number;
  cycles: string[];
}

/**
 * Extract wiki links from markdown content
 * Handles: [[link]], [[link|alias]], [[link#heading]]
 */
export function extractWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  
  // Match [[...]] patterns, excluding code blocks
  const codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;
  const cleanContent = content.replace(codeBlockRegex, '');
  
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  let match;
  
  while ((match = wikiLinkRegex.exec(cleanContent)) !== null) {
    const raw = match[0];
    const inner = match[1];
    
    // Parse inner content: target|alias or target#heading
    let target = inner;
    let alias: string | undefined;
    let heading: string | undefined;
    
    // Check for alias
    if (inner.includes('|')) {
      const parts = inner.split('|');
      target = parts[0].trim();
      alias = parts[1].trim();
    }
    
    // Check for heading anchor
    if (target.includes('#')) {
      const parts = target.split('#');
      target = parts[0].trim();
      heading = parts[1].trim();
    }
    
    // Skip empty targets
    if (target) {
      links.push({ raw, target, alias, heading });
    }
  }
  
  return links;
}

/**
 * Resolve wiki link target to file path
 * Handles relative paths and .md extension
 */
export function resolveWikiLink(
  link: WikiLink,
  fromPath: string,
  basePath: string
): string {
  let target = link.target;
  
  // Add .md extension if not present
  if (!extname(target)) {
    target = `${target}.md`;
  }
  
  // If target starts with /, it's relative to vault root
  if (target.startsWith('/')) {
    return join(basePath, target.slice(1));
  }
  
  // Otherwise, resolve relative to current file's directory
  const fromDir = dirname(fromPath);
  return join(fromDir, target);
}

/**
 * Normalize path for comparison (remove .md extension, lowercase)
 */
export function normalizePath(path: string): string {
  let normalized = path;
  if (normalized.endsWith('.md')) {
    normalized = normalized.slice(0, -3);
  }
  return normalized.toLowerCase();
}

/**
 * Read file content safely
 */
async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Traverse MOC and collect all linked paths
 */
export async function traverseMoc(
  rootPath: string,
  basePath: string,
  options: TraversalOptions = {}
): Promise<TraversalResult> {
  const maxDepth = options.maxDepth ?? 3;
  const includeRoot = options.includeRoot ?? true;
  
  const visited = new Set<string>();
  const cycles: string[] = [];
  const paths: string[] = [];
  
  // Track current traversal path for cycle detection
  const currentPath: string[] = [];
  
  async function traverse(filePath: string, depth: number): Promise<void> {
    const normalizedPath = normalizePath(filePath);
    
    // Check for cycle
    if (currentPath.includes(normalizedPath)) {
      cycles.push(filePath);
      return;
    }
    
    // Check if already visited
    if (visited.has(normalizedPath)) {
      return;
    }
    
    // Check depth limit
    if (depth > maxDepth) {
      return;
    }
    
    // Mark as visited
    visited.add(normalizedPath);
    currentPath.push(normalizedPath);
    
    // Add to paths
    paths.push(filePath);
    
    // Read file content
    const content = await readFileSafe(filePath);
    if (!content) {
      currentPath.pop();
      return;
    }
    
    // Extract and follow links
    const links = extractWikiLinks(content);
    
    for (const link of links) {
      const targetPath = resolveWikiLink(link, filePath, basePath);
      await traverse(targetPath, depth + 1);
    }
    
    currentPath.pop();
  }
  
  await traverse(rootPath, 0);
  
  // Remove root from paths if not included
  if (!includeRoot && paths.length > 0) {
    paths.shift();
  }
  
  return {
    root: rootPath,
    visited,
    paths,
    depth: maxDepth,
    cycles,
  };
}

/**
 * Get paths matching MOC scope
 */
export async function getPathsFromMocScope(
  scope: ParsedScope,
  basePath: string,
  options: TraversalOptions = {}
): Promise<string[]> {
  if (scope.type !== 'moc') {
    return [];
  }
  
  // Resolve MOC path
  let mocPath = scope.value;
  if (!extname(mocPath)) {
    mocPath = `${mocPath}.md`;
  }
  if (!mocPath.startsWith('/')) {
    mocPath = join(basePath, mocPath);
  }
  
  const result = await traverseMoc(mocPath, basePath, options);
  return result.paths;
}

/**
 * Check if path is linked from MOC
 */
export async function isLinkedFromMoc(
  path: string,
  mocPath: string,
  basePath: string,
  options: TraversalOptions = {}
): Promise<boolean> {
  const result = await traverseMoc(mocPath, basePath, options);
  const normalizedPath = normalizePath(path);
  
  return result.visited.has(normalizedPath);
}

/**
 * Get link graph from MOC
 */
export async function getMocLinkGraph(
  rootPath: string,
  basePath: string,
  options: TraversalOptions = {}
): Promise<Map<string, string[]>> {
  const maxDepth = options.maxDepth ?? 3;
  const graph = new Map<string, string[]>();
  const visited = new Set<string>();
  
  async function traverse(filePath: string, depth: number): Promise<void> {
    const normalizedPath = normalizePath(filePath);
    
    if (visited.has(normalizedPath) || depth > maxDepth) {
      return;
    }
    
    visited.add(normalizedPath);
    
    const content = await readFileSafe(filePath);
    if (!content) {
      return;
    }
    
    const links = extractWikiLinks(content);
    const targets = links.map(l => resolveWikiLink(l, filePath, basePath));
    
    graph.set(filePath, targets);
    
    for (const target of targets) {
      await traverse(target, depth + 1);
    }
  }
  
  await traverse(rootPath, 0);
  
  return graph;
}

/**
 * Describe MOC traversal result
 */
export function describeMocTraversal(result: TraversalResult): string {
  const lines = [
    `MOC: ${basename(result.root)}`,
    `Depth: ${result.depth}`,
    `Files found: ${result.paths.length}`,
  ];
  
  if (result.cycles.length > 0) {
    lines.push(`Cycles detected: ${result.cycles.length}`);
  }
  
  return lines.join('\n');
}
