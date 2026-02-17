/**
 * Citations and snippets for context packs
 * Provides provenance information and formatted references for AI consumption
 */

import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import type { DatabaseInstance } from '../db/connection.js';

/**
 * Citation reference
 */
export interface Citation {
  id: string;
  sourceFile: string;
  sourcePath: string;
  lineStart?: number;
  lineEnd?: number;
  content: string;
  type: 'fact' | 'entity' | 'insight' | 'task' | 'quote';
  confidence?: number;
  extractedAt?: string;
}

/**
 * Snippet with context
 */
export interface Snippet {
  id: string;
  content: string;
  context: string;
  sourcePath: string;
  lineNumbers?: { start: number; end: number };
}

/**
 * Citations index for context pack
 */
export interface CitationsIndex {
  generatedAt: string;
  totalCitations: number;
  bySource: Record<string, Citation[]>;
  byType: Record<string, Citation[]>;
}

/**
 * Get citations from database
 */
export function getCitationsFromDb(
  db: DatabaseInstance,
  sourcePaths?: string[]
): Citation[] {
  let sql = `
    SELECT 
      i.id,
      i.content,
      i.item_type,
      i.confidence,
      i.created_at,
      c.content as chunk_content,
      c.start_line,
      c.end_line,
      s.path as source_path
    FROM items i
    JOIN chunks c ON i.chunk_id = c.id
    JOIN sources s ON c.source_id = s.id
  `;
  
  const params: string[] = [];
  
  if (sourcePaths && sourcePaths.length > 0) {
    const placeholders = sourcePaths.map(() => '?').join(',');
    sql += ` WHERE s.path IN (${placeholders})`;
    params.push(...sourcePaths);
  }
  
  sql += ' ORDER BY s.path, c.start_line';
  
  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    content: string;
    item_type: string;
    confidence: number | null;
    created_at: string;
    chunk_content: string;
    start_line: number;
    end_line: number;
    source_path: string;
  }>;
  
  return rows.map(row => ({
    id: `cite-${row.id}`,
    sourceFile: basename(row.source_path),
    sourcePath: row.source_path,
    lineStart: row.start_line,
    lineEnd: row.end_line,
    content: row.content,
    type: row.item_type as Citation['type'],
    confidence: row.confidence ?? undefined,
    extractedAt: row.created_at,
  }));
}

/**
 * Get snippets for a file
 */
export async function getSnippetsForFile(
  vaultPath: string,
  filePath: string,
  maxSnippets: number = 5
): Promise<Snippet[]> {
  try {
    const fullPath = join(vaultPath, filePath);
    const content = await readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    
    const snippets: Snippet[] = [];
    let currentSnippet: string[] = [];
    let snippetStart = 0;
    
    for (let i = 0; i < lines.length && snippets.length < maxSnippets; i++) {
      const line = lines[i];
      
      // Start new snippet at headings
      if (line.startsWith('#')) {
        if (currentSnippet.length > 0) {
          snippets.push({
            id: `snip-${filePath}-${snippetStart}`,
            content: currentSnippet.join('\n').trim(),
            context: extractContext(lines, snippetStart),
            sourcePath: filePath,
            lineNumbers: { start: snippetStart + 1, end: i },
          });
        }
        currentSnippet = [line];
        snippetStart = i;
      } else {
        currentSnippet.push(line);
      }
    }
    
    // Add last snippet
    if (currentSnippet.length > 0 && snippets.length < maxSnippets) {
      snippets.push({
        id: `snip-${filePath}-${snippetStart}`,
        content: currentSnippet.join('\n').trim(),
        context: extractContext(lines, snippetStart),
        sourcePath: filePath,
        lineNumbers: { start: snippetStart + 1, end: lines.length },
      });
    }
    
    return snippets;
  } catch {
    return [];
  }
}

/**
 * Extract context around a line
 */
function extractContext(lines: string[], lineIndex: number): string {
  // Find the nearest heading above
  for (let i = lineIndex; i >= 0; i--) {
    if (lines[i].startsWith('#')) {
      return lines[i].replace(/^#+\s*/, '');
    }
  }
  return 'Document';
}

/**
 * Build citations index
 */
export function buildCitationsIndex(citations: Citation[]): CitationsIndex {
  const bySource: Record<string, Citation[]> = {};
  const byType: Record<string, Citation[]> = {};
  
  for (const citation of citations) {
    // Group by source
    if (!bySource[citation.sourcePath]) {
      bySource[citation.sourcePath] = [];
    }
    bySource[citation.sourcePath].push(citation);
    
    // Group by type
    if (!byType[citation.type]) {
      byType[citation.type] = [];
    }
    byType[citation.type].push(citation);
  }
  
  return {
    generatedAt: new Date().toISOString(),
    totalCitations: citations.length,
    bySource,
    byType,
  };
}

/**
 * Format citation for display
 */
export function formatCitation(citation: Citation): string {
  const location = citation.lineStart 
    ? `L${citation.lineStart}${citation.lineEnd !== citation.lineStart ? `-${citation.lineEnd}` : ''}`
    : '';
  
  return `[${citation.sourceFile}${location ? ':' + location : ''}]`;
}

/**
 * Format citation as markdown reference
 */
export function formatCitationMarkdown(citation: Citation): string {
  const lines: string[] = [];
  
  lines.push(`> ${citation.content}`);
  lines.push(`>`);
  lines.push(`> — *${formatCitation(citation)}* (${citation.type})`);
  
  if (citation.confidence && citation.confidence < 1) {
    lines.push(`> Confidence: ${Math.round(citation.confidence * 100)}%`);
  }
  
  return lines.join('\n');
}

/**
 * Generate citations markdown file
 */
export function generateCitationsMarkdown(index: CitationsIndex): string {
  const lines: string[] = [];
  
  lines.push('# Citations');
  lines.push('');
  lines.push('This file contains source citations for extracted knowledge.');
  lines.push('');
  lines.push(`*Generated: ${index.generatedAt.split('T')[0]}*`);
  lines.push(`*Total citations: ${index.totalCitations}*`);
  lines.push('');
  
  // By type summary
  lines.push('## Summary by Type');
  lines.push('');
  lines.push('| Type | Count |');
  lines.push('|------|-------|');
  for (const [type, citations] of Object.entries(index.byType)) {
    lines.push(`| ${type} | ${citations.length} |`);
  }
  lines.push('');
  
  // Citations by source
  lines.push('## Citations by Source');
  lines.push('');
  
  for (const [source, citations] of Object.entries(index.bySource)) {
    lines.push(`### ${basename(source)}`);
    lines.push('');
    lines.push(`*Path: \`${source}\`*`);
    lines.push('');
    
    for (const citation of citations.slice(0, 10)) {
      lines.push(formatCitationMarkdown(citation));
      lines.push('');
    }
    
    if (citations.length > 10) {
      lines.push(`*...and ${citations.length - 10} more citations*`);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Generate snippets markdown file
 */
export function generateSnippetsMarkdown(
  snippets: Snippet[],
  sourcePath: string
): string {
  const lines: string[] = [];
  
  lines.push(`# Snippets: ${basename(sourcePath)}`);
  lines.push('');
  lines.push(`*Source: \`${sourcePath}\`*`);
  lines.push('');
  
  for (const snippet of snippets) {
    lines.push(`## ${snippet.context}`);
    lines.push('');
    if (snippet.lineNumbers) {
      lines.push(`*Lines ${snippet.lineNumbers.start}-${snippet.lineNumbers.end}*`);
      lines.push('');
    }
    lines.push('```markdown');
    lines.push(snippet.content);
    lines.push('```');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Extract key snippets from content for AI consumption
 */
export function extractKeySnippets(
  content: string,
  maxLength: number = 2000
): string[] {
  const snippets: string[] = [];
  const sections = content.split(/^##?\s+/m);
  
  let totalLength = 0;
  
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    
    if (totalLength + trimmed.length > maxLength) {
      // Truncate this section
      const remaining = maxLength - totalLength;
      if (remaining > 100) {
        snippets.push(trimmed.slice(0, remaining) + '...');
      }
      break;
    }
    
    snippets.push(trimmed);
    totalLength += trimmed.length;
  }
  
  return snippets;
}

/**
 * Create provenance header for exported file
 */
export function createProvenanceHeader(
  sourcePath: string,
  extractedAt: string,
  citationCount: number
): string {
  const lines: string[] = [];
  
  lines.push('---');
  lines.push('# Provenance');
  lines.push(`source: "${sourcePath}"`);
  lines.push(`extracted: "${extractedAt}"`);
  lines.push(`citations: ${citationCount}`);
  lines.push('---');
  lines.push('');
  
  return lines.join('\n');
}
