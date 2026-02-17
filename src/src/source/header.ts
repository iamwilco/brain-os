/**
 * Source markdown header update module
 * Adds extraction summaries to source file headers while preserving content
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

/**
 * Extracted item reference
 */
export interface ExtractedItemRef {
  type: 'entity' | 'fact' | 'task' | 'insight';
  name: string;
  id?: string;
}

/**
 * Extraction summary for header
 */
export interface ExtractionSummary {
  summary: string;
  entities: ExtractedItemRef[];
  facts: ExtractedItemRef[];
  tasks: ExtractedItemRef[];
  insights: ExtractedItemRef[];
  extractedAt: string;
  chunkCount?: number;
}

/**
 * Header update options
 */
export interface HeaderUpdateOptions {
  preserveExisting?: boolean;
  addTimestamp?: boolean;
  maxItems?: number;
}

/**
 * Existing frontmatter data
 */
export interface FrontmatterData {
  [key: string]: unknown;
}

/**
 * Parse markdown file into frontmatter and content
 */
export function parseMarkdownFile(content: string): {
  frontmatter: FrontmatterData | null;
  body: string;
  hasFrontmatter: boolean;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  
  if (!frontmatterMatch) {
    return { frontmatter: null, body: content, hasFrontmatter: false };
  }
  
  const frontmatterYaml = frontmatterMatch[1];
  const body = content.slice(frontmatterMatch[0].length);
  
  // Simple YAML parsing
  const frontmatter: FrontmatterData = {};
  const lines = frontmatterYaml.split('\n');
  let currentKey = '';
  let currentArray: string[] = [];
  let inArray = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed.startsWith('- ')) {
      if (inArray && currentKey) {
        currentArray.push(trimmed.slice(2).replace(/^["']|["']$/g, ''));
      }
    } else if (trimmed.includes(':')) {
      // Save previous array
      if (inArray && currentKey) {
        frontmatter[currentKey] = currentArray;
        currentArray = [];
        inArray = false;
      }
      
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();
      
      if (value === '' || value === '[]') {
        currentKey = key;
        inArray = true;
        if (value === '[]') {
          frontmatter[key] = [];
          inArray = false;
        }
      } else {
        frontmatter[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
  
  // Save last array
  if (inArray && currentKey) {
    frontmatter[currentKey] = currentArray;
  }
  
  return { frontmatter, body, hasFrontmatter: true };
}

/**
 * Generate frontmatter YAML from data
 */
export function generateFrontmatterYaml(data: FrontmatterData): string {
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          if (typeof item === 'string') {
            lines.push(`  - "${escapeYamlString(item)}"`);
          } else {
            lines.push(`  - ${JSON.stringify(item)}`);
          }
        }
      }
    } else if (typeof value === 'string') {
      // Check if value needs quoting
      if (value.includes(':') || value.includes('#') || value.includes('\n')) {
        lines.push(`${key}: "${escapeYamlString(value)}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else if (value === null || value === undefined) {
      lines.push(`${key}: null`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Escape special characters in YAML strings
 */
function escapeYamlString(str: string): string {
  return str.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Generate extraction header section
 */
export function generateExtractionHeader(summary: ExtractionSummary, options: HeaderUpdateOptions = {}): string {
  const maxItems = options.maxItems ?? 10;
  const lines: string[] = [];
  
  lines.push('## Brain Extraction');
  lines.push('');
  
  // Summary
  if (summary.summary) {
    lines.push(`> ${summary.summary}`);
    lines.push('');
  }
  
  // Entities
  if (summary.entities.length > 0) {
    lines.push('### Entities');
    for (const entity of summary.entities.slice(0, maxItems)) {
      lines.push(`- [[${entity.name}]]`);
    }
    if (summary.entities.length > maxItems) {
      lines.push(`- *...and ${summary.entities.length - maxItems} more*`);
    }
    lines.push('');
  }
  
  // Facts
  if (summary.facts.length > 0) {
    lines.push('### Facts');
    for (const fact of summary.facts.slice(0, maxItems)) {
      lines.push(`- ${fact.name}`);
    }
    if (summary.facts.length > maxItems) {
      lines.push(`- *...and ${summary.facts.length - maxItems} more*`);
    }
    lines.push('');
  }
  
  // Tasks
  if (summary.tasks.length > 0) {
    lines.push('### Tasks');
    for (const task of summary.tasks.slice(0, maxItems)) {
      lines.push(`- [ ] ${task.name}`);
    }
    if (summary.tasks.length > maxItems) {
      lines.push(`- *...and ${summary.tasks.length - maxItems} more*`);
    }
    lines.push('');
  }
  
  // Insights
  if (summary.insights.length > 0) {
    lines.push('### Insights');
    for (const insight of summary.insights.slice(0, maxItems)) {
      lines.push(`- 💡 ${insight.name}`);
    }
    if (summary.insights.length > maxItems) {
      lines.push(`- *...and ${summary.insights.length - maxItems} more*`);
    }
    lines.push('');
  }
  
  // Metadata
  if (options.addTimestamp !== false) {
    lines.push(`*Extracted: ${summary.extractedAt}*`);
    if (summary.chunkCount) {
      lines.push(`*Chunks processed: ${summary.chunkCount}*`);
    }
    lines.push('');
  }
  
  lines.push('---');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Update source markdown with extraction results
 */
export function updateSourceHeader(
  content: string,
  summary: ExtractionSummary,
  options: HeaderUpdateOptions = {}
): string {
  const { frontmatter, body } = parseMarkdownFile(content);
  
  // Remove existing extraction header if present
  const cleanBody = removeExistingExtractionHeader(body);
  
  // Generate new extraction header
  const extractionHeader = generateExtractionHeader(summary, options);
  
  // Update frontmatter with extraction metadata
  const updatedFrontmatter: FrontmatterData = {
    ...frontmatter,
    brain_extracted: summary.extractedAt,
    brain_entities: summary.entities.map(e => e.name),
    brain_facts_count: summary.facts.length,
    brain_tasks_count: summary.tasks.length,
    brain_insights_count: summary.insights.length,
  };
  
  // Reconstruct file
  const parts: string[] = [];
  
  // Frontmatter
  parts.push('---');
  parts.push(generateFrontmatterYaml(updatedFrontmatter));
  parts.push('---');
  parts.push('');
  
  // Extraction header
  parts.push(extractionHeader);
  
  // Original content
  parts.push(cleanBody.trim());
  
  return parts.join('\n');
}

/**
 * Remove existing extraction header from body
 */
function removeExistingExtractionHeader(body: string): string {
  // Find and remove ## Brain Extraction section
  const extractionStart = body.indexOf('## Brain Extraction');
  if (extractionStart === -1) return body;
  
  // Find the end (next --- or ## heading)
  const afterExtraction = body.slice(extractionStart);
  const lines = afterExtraction.split('\n');
  let endIndex = 0;
  let foundStart = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '## Brain Extraction') {
      foundStart = true;
      continue;
    }
    if (foundStart && (line === '---' || (line.startsWith('## ') && !line.startsWith('## Brain')))) {
      // Include the --- separator
      if (line === '---') {
        endIndex = extractionStart + lines.slice(0, i + 1).join('\n').length + 1;
      } else {
        endIndex = extractionStart + lines.slice(0, i).join('\n').length;
      }
      break;
    }
  }
  
  if (endIndex === 0) {
    // Extraction header goes to end of content
    return body.slice(0, extractionStart).trim();
  }
  
  return (body.slice(0, extractionStart) + body.slice(endIndex)).trim();
}

/**
 * Update source file with extraction results
 */
export async function updateSourceFile(
  filePath: string,
  summary: ExtractionSummary,
  options: HeaderUpdateOptions = {}
): Promise<{ success: boolean; error?: string }> {
  if (!existsSync(filePath)) {
    return { success: false, error: 'File not found' };
  }
  
  try {
    const content = await readFile(filePath, 'utf-8');
    const updatedContent = updateSourceHeader(content, summary, options);
    await writeFile(filePath, updatedContent, 'utf-8');
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Check if file has extraction header
 */
export function hasExtractionHeader(content: string): boolean {
  return content.includes('## Brain Extraction');
}

/**
 * Get extraction date from file
 */
export function getExtractionDate(content: string): string | null {
  const { frontmatter } = parseMarkdownFile(content);
  if (!frontmatter) return null;
  
  const extracted = frontmatter.brain_extracted;
  return typeof extracted === 'string' ? extracted : null;
}

/**
 * Create summary from extraction results
 */
export function createSummaryFromResults(
  summary: string,
  entities: Array<{ name: string; id?: string }>,
  facts: Array<{ content: string; id?: string }>,
  tasks: Array<{ content: string; id?: string }>,
  insights: Array<{ content: string; id?: string }>,
  chunkCount?: number
): ExtractionSummary {
  return {
    summary,
    entities: entities.map(e => ({ type: 'entity' as const, name: e.name, id: e.id })),
    facts: facts.map(f => ({ type: 'fact' as const, name: f.content, id: f.id })),
    tasks: tasks.map(t => ({ type: 'task' as const, name: t.content, id: t.id })),
    insights: insights.map(i => ({ type: 'insight' as const, name: i.content, id: i.id })),
    extractedAt: new Date().toISOString().split('T')[0],
    chunkCount,
  };
}
