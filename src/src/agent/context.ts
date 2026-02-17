/**
 * Agent context auto-generation
 * Generates CONTEXT.md from extractions with hot/warm/cold sections
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { DatabaseInstance } from '../db/connection.js';
import { SECTION_THRESHOLDS } from '../synth/recency.js';

/**
 * Context item from database
 */
export interface ContextItem {
  id: number;
  content: string;
  itemType: string;
  entityName: string | null;
  createdAt: string;
  sourcePath: string;
}

/**
 * Categorized context items
 */
export interface CategorizedContext {
  hot: ContextItem[];
  warm: ContextItem[];
  cold: ContextItem[];
}

/**
 * Generated context document
 */
export interface GeneratedContext {
  agentId: string;
  generatedAt: string;
  itemCount: number;
  sections: CategorizedContext;
}

/**
 * Get context file path for agent
 */
export function getContextPath(agentPath: string): string {
  return join(agentPath, 'CONTEXT.md');
}

/**
 * Get items for agent scope from database
 */
export function getItemsForScope(
  db: DatabaseInstance,
  scope: string,
  limit: number = 100
): ContextItem[] {
  // Parse scope to determine filter
  let sql = `
    SELECT 
      i.id,
      i.content,
      i.item_type as itemType,
      i.created_at as createdAt,
      s.path as sourcePath
    FROM items i
    JOIN chunks c ON i.chunk_id = c.id
    JOIN sources s ON c.source_id = s.id
  `;
  
  const params: string[] = [];
  
  // Apply scope filter
  if (scope && scope !== '**/*' && scope !== 'all') {
    if (scope.includes('*')) {
      // Glob pattern - convert to LIKE
      const pattern = scope.replace(/\*\*/g, '%').replace(/\*/g, '%');
      sql += ` WHERE s.path LIKE ?`;
      params.push(pattern);
    } else {
      // Exact path prefix
      sql += ` WHERE s.path LIKE ?`;
      params.push(`${scope}%`);
    }
  }
  
  sql += ` ORDER BY i.created_at DESC LIMIT ?`;
  params.push(String(limit));
  
  try {
    const rows = db.prepare(sql).all(...params) as ContextItem[];
    return rows;
  } catch {
    return [];
  }
}

/**
 * Calculate age in days from timestamp
 */
function calculateAgeDays(timestamp: string): number {
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Categorize items by recency
 */
export function categorizeByRecency(items: ContextItem[]): CategorizedContext {
  const hot: ContextItem[] = [];
  const warm: ContextItem[] = [];
  const cold: ContextItem[] = [];
  
  for (const item of items) {
    const ageDays = calculateAgeDays(item.createdAt);
    
    if (ageDays <= SECTION_THRESHOLDS.hot) {
      hot.push(item);
    } else if (ageDays <= SECTION_THRESHOLDS.warm) {
      warm.push(item);
    } else {
      cold.push(item);
    }
  }
  
  return { hot, warm, cold };
}

/**
 * Format item for display
 */
function formatItem(item: ContextItem): string {
  const entity = item.entityName ? `**${item.entityName}**: ` : '';
  const type = `[${item.itemType}]`;
  return `- ${entity}${item.content} ${type}`;
}

/**
 * Generate context markdown
 */
export function generateContextMarkdown(context: GeneratedContext): string {
  const lines: string[] = [];
  
  // Header
  lines.push('---');
  lines.push('type: agent-context');
  lines.push(`agent: ${context.agentId}`);
  lines.push(`generated: ${context.generatedAt}`);
  lines.push(`items: ${context.itemCount}`);
  lines.push('---');
  lines.push('');
  lines.push('# Context');
  lines.push('');
  lines.push('> This file is auto-generated. Do not edit manually.');
  lines.push('');
  
  // Hot section (recent)
  lines.push('## 🔥 Hot (Last 7 Days)');
  lines.push('');
  if (context.sections.hot.length > 0) {
    for (const item of context.sections.hot.slice(0, 20)) {
      lines.push(formatItem(item));
    }
    if (context.sections.hot.length > 20) {
      lines.push(`- *...and ${context.sections.hot.length - 20} more*`);
    }
  } else {
    lines.push('*No recent items*');
  }
  lines.push('');
  
  // Warm section
  lines.push('## 🌤 Warm (Last 30 Days)');
  lines.push('');
  if (context.sections.warm.length > 0) {
    for (const item of context.sections.warm.slice(0, 15)) {
      lines.push(formatItem(item));
    }
    if (context.sections.warm.length > 15) {
      lines.push(`- *...and ${context.sections.warm.length - 15} more*`);
    }
  } else {
    lines.push('*No items in this period*');
  }
  lines.push('');
  
  // Cold section
  lines.push('## ❄️ Cold (Older)');
  lines.push('');
  if (context.sections.cold.length > 0) {
    for (const item of context.sections.cold.slice(0, 10)) {
      lines.push(formatItem(item));
    }
    if (context.sections.cold.length > 10) {
      lines.push(`- *...and ${context.sections.cold.length - 10} more*`);
    }
  } else {
    lines.push('*No older items*');
  }
  lines.push('');
  
  // Stats
  lines.push('## Stats');
  lines.push('');
  lines.push(`- **Hot:** ${context.sections.hot.length} items`);
  lines.push(`- **Warm:** ${context.sections.warm.length} items`);
  lines.push(`- **Cold:** ${context.sections.cold.length} items`);
  lines.push(`- **Total:** ${context.itemCount} items`);
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generate context for agent
 */
export async function generateAgentContext(
  _agentPath: string,
  agentId: string,
  scope: string,
  db: DatabaseInstance
): Promise<GeneratedContext> {
  const items = getItemsForScope(db, scope);
  const categorized = categorizeByRecency(items);
  
  return {
    agentId,
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    sections: categorized,
  };
}

/**
 * Save context to file
 */
export async function saveContext(
  agentPath: string,
  context: GeneratedContext
): Promise<void> {
  const contextPath = getContextPath(agentPath);
  const markdown = generateContextMarkdown(context);
  await writeFile(contextPath, markdown, 'utf-8');
}

/**
 * Generate and save context for agent
 */
export async function regenerateContext(
  agentPath: string,
  agentId: string,
  scope: string,
  db: DatabaseInstance
): Promise<GeneratedContext> {
  const context = await generateAgentContext(agentPath, agentId, scope, db);
  await saveContext(agentPath, context);
  return context;
}

/**
 * Load existing context (if any)
 */
export async function loadContext(agentPath: string): Promise<string | null> {
  const contextPath = getContextPath(agentPath);
  
  if (!existsSync(contextPath)) {
    return null;
  }
  
  try {
    return await readFile(contextPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Check if context needs regeneration
 */
export async function contextNeedsRegeneration(
  agentPath: string,
  maxAgeHours: number = 24
): Promise<boolean> {
  const contextPath = getContextPath(agentPath);
  
  if (!existsSync(contextPath)) {
    return true;
  }
  
  try {
    const content = await readFile(contextPath, 'utf-8');
    const match = content.match(/generated:\s*(.+)/);
    
    if (!match) {
      return true;
    }
    
    const generatedAt = new Date(match[1]);
    const now = new Date();
    const ageHours = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60);
    
    return ageHours > maxAgeHours;
  } catch {
    return true;
  }
}

/**
 * Regenerate context if stale
 */
export async function ensureFreshContext(
  agentPath: string,
  agentId: string,
  scope: string,
  db: DatabaseInstance,
  maxAgeHours: number = 24
): Promise<GeneratedContext | null> {
  const needsRegen = await contextNeedsRegeneration(agentPath, maxAgeHours);
  
  if (needsRegen) {
    return regenerateContext(agentPath, agentId, scope, db);
  }
  
  return null;
}
