/**
 * What Changed Log Generation
 * Creates delta reports showing changes since last synthesis
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { DatabaseInstance } from '../db/connection.js';

/**
 * Change types
 */
export type ChangeType = 'added' | 'modified' | 'removed';

/**
 * Change category
 */
export type ChangeCategory = 'source' | 'entity' | 'fact' | 'task' | 'insight' | 'note';

/**
 * Individual change record
 */
export interface ChangeRecord {
  type: ChangeType;
  category: ChangeCategory;
  item: string;
  details?: string;
  timestamp: string;
}

/**
 * Change summary by category
 */
export interface ChangeSummary {
  sources: { added: number; modified: number; removed: number };
  entities: { added: number; modified: number; removed: number };
  facts: { added: number; modified: number; removed: number };
  tasks: { added: number; modified: number; removed: number };
  insights: { added: number; modified: number; removed: number };
}

/**
 * Changelog report
 */
export interface ChangelogReport {
  generatedAt: string;
  since: string;
  summary: ChangeSummary;
  changes: ChangeRecord[];
  highlights: string[];
}

/**
 * Synth state for tracking last run
 */
export interface SynthState {
  lastRun: string;
  lastSourceCount: number;
  lastItemCount: number;
  lastEntityCount: number;
}

/**
 * Load synth state from file
 */
export async function loadSynthState(statePath: string): Promise<SynthState | null> {
  if (!existsSync(statePath)) {
    return null;
  }
  
  try {
    const content = await readFile(statePath, 'utf-8');
    return JSON.parse(content) as SynthState;
  } catch {
    return null;
  }
}

/**
 * Save synth state to file
 */
export async function saveSynthState(statePath: string, state: SynthState): Promise<void> {
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Get default synth state path
 */
export function getSynthStatePath(vaultPath: string): string {
  return join(vaultPath, '40_Brain', '.agent', 'synth-state.json');
}

/**
 * Get sources added since timestamp
 */
export function getSourcesAddedSince(db: DatabaseInstance, since: string): ChangeRecord[] {
  const rows = db.prepare(`
    SELECT path, collection, created_at
    FROM sources
    WHERE created_at >= ?
    ORDER BY created_at DESC
  `).all(since) as Array<{ path: string; collection: string; created_at: string }>;
  
  return rows.map(row => ({
    type: 'added' as ChangeType,
    category: 'source' as ChangeCategory,
    item: row.path,
    details: `Collection: ${row.collection}`,
    timestamp: row.created_at,
  }));
}

/**
 * Get sources modified since timestamp (re-extracted)
 */
export function getSourcesModifiedSince(db: DatabaseInstance, since: string): ChangeRecord[] {
  const rows = db.prepare(`
    SELECT path, extracted_at
    FROM sources
    WHERE extracted_at >= ? AND created_at < ?
    ORDER BY extracted_at DESC
  `).all(since, since) as Array<{ path: string; extracted_at: string }>;
  
  return rows.map(row => ({
    type: 'modified' as ChangeType,
    category: 'source' as ChangeCategory,
    item: row.path,
    details: 'Re-extracted',
    timestamp: row.extracted_at,
  }));
}

/**
 * Get items added since timestamp
 */
export function getItemsAddedSince(
  db: DatabaseInstance,
  since: string,
  itemType: string
): ChangeRecord[] {
  const rows = db.prepare(`
    SELECT content, created_at
    FROM items
    WHERE item_type = ? AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(itemType, since) as Array<{ content: string; created_at: string }>;
  
  const category = itemType as ChangeCategory;
  
  return rows.map(row => ({
    type: 'added' as ChangeType,
    category,
    item: row.content.slice(0, 100) + (row.content.length > 100 ? '...' : ''),
    timestamp: row.created_at,
  }));
}

/**
 * Get counts for change summary
 */
export function getChangeCounts(
  db: DatabaseInstance,
  since: string
): ChangeSummary {
  const sourcesAdded = (db.prepare(`
    SELECT COUNT(*) as count FROM sources WHERE created_at >= ?
  `).get(since) as { count: number }).count;
  
  const sourcesModified = (db.prepare(`
    SELECT COUNT(*) as count FROM sources WHERE extracted_at >= ? AND created_at < ?
  `).get(since, since) as { count: number }).count;
  
  const getItemCount = (type: string) => {
    return (db.prepare(`
      SELECT COUNT(*) as count FROM items WHERE item_type = ? AND created_at >= ?
    `).get(type, since) as { count: number }).count;
  };
  
  return {
    sources: { added: sourcesAdded, modified: sourcesModified, removed: 0 },
    entities: { added: getItemCount('entity'), modified: 0, removed: 0 },
    facts: { added: getItemCount('fact'), modified: 0, removed: 0 },
    tasks: { added: getItemCount('task'), modified: 0, removed: 0 },
    insights: { added: getItemCount('insight'), modified: 0, removed: 0 },
  };
}

/**
 * Generate highlights from changes
 */
export function generateHighlights(
  _changes: ChangeRecord[],
  summary: ChangeSummary
): string[] {
  const highlights: string[] = [];
  
  const totalAdded = summary.sources.added + summary.entities.added + 
    summary.facts.added + summary.tasks.added + summary.insights.added;
  
  if (totalAdded === 0) {
    highlights.push('No new items since last synthesis');
    return highlights;
  }
  
  if (summary.sources.added > 0) {
    highlights.push(`${summary.sources.added} new source${summary.sources.added > 1 ? 's' : ''} ingested`);
  }
  
  if (summary.entities.added > 0) {
    highlights.push(`${summary.entities.added} new entit${summary.entities.added > 1 ? 'ies' : 'y'} discovered`);
  }
  
  if (summary.facts.added > 0) {
    highlights.push(`${summary.facts.added} new fact${summary.facts.added > 1 ? 's' : ''} extracted`);
  }
  
  if (summary.tasks.added > 0) {
    highlights.push(`${summary.tasks.added} new task${summary.tasks.added > 1 ? 's' : ''} identified`);
  }
  
  if (summary.insights.added > 0) {
    highlights.push(`${summary.insights.added} new insight${summary.insights.added > 1 ? 's' : ''} generated`);
  }
  
  return highlights;
}

/**
 * Generate changelog report
 */
export function generateChangelog(
  db: DatabaseInstance,
  since: string
): ChangelogReport {
  const now = new Date().toISOString();
  
  // Get all changes
  const changes: ChangeRecord[] = [];
  
  // Sources
  changes.push(...getSourcesAddedSince(db, since));
  changes.push(...getSourcesModifiedSince(db, since));
  
  // Items by type
  changes.push(...getItemsAddedSince(db, since, 'entity'));
  changes.push(...getItemsAddedSince(db, since, 'fact'));
  changes.push(...getItemsAddedSince(db, since, 'task'));
  changes.push(...getItemsAddedSince(db, since, 'insight'));
  
  // Sort by timestamp descending
  changes.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  
  // Get summary counts
  const summary = getChangeCounts(db, since);
  
  // Generate highlights
  const highlights = generateHighlights(changes, summary);
  
  return {
    generatedAt: now,
    since,
    summary,
    changes,
    highlights,
  };
}

/**
 * Format changelog as markdown
 */
export function formatChangelogMarkdown(report: ChangelogReport): string {
  const lines: string[] = [];
  
  lines.push('# What Changed');
  lines.push('');
  lines.push(`*Generated: ${report.generatedAt.split('T')[0]}*`);
  lines.push(`*Since: ${report.since.split('T')[0]}*`);
  lines.push('');
  
  // Highlights
  lines.push('## Highlights');
  lines.push('');
  for (const highlight of report.highlights) {
    lines.push(`- ${highlight}`);
  }
  lines.push('');
  
  // Summary table
  lines.push('## Summary');
  lines.push('');
  lines.push('| Category | Added | Modified | Removed |');
  lines.push('|----------|-------|----------|---------|');
  lines.push(`| Sources | ${report.summary.sources.added} | ${report.summary.sources.modified} | ${report.summary.sources.removed} |`);
  lines.push(`| Entities | ${report.summary.entities.added} | ${report.summary.entities.modified} | ${report.summary.entities.removed} |`);
  lines.push(`| Facts | ${report.summary.facts.added} | ${report.summary.facts.modified} | ${report.summary.facts.removed} |`);
  lines.push(`| Tasks | ${report.summary.tasks.added} | ${report.summary.tasks.modified} | ${report.summary.tasks.removed} |`);
  lines.push(`| Insights | ${report.summary.insights.added} | ${report.summary.insights.modified} | ${report.summary.insights.removed} |`);
  lines.push('');
  
  // Recent changes by category
  const byCategory = groupChangesByCategory(report.changes);
  
  for (const [category, categoryChanges] of Object.entries(byCategory)) {
    if (categoryChanges.length === 0) continue;
    
    lines.push(`## ${capitalize(category)} Changes`);
    lines.push('');
    
    for (const change of categoryChanges.slice(0, 10)) {
      const icon = change.type === 'added' ? '➕' : change.type === 'modified' ? '✏️' : '➖';
      lines.push(`- ${icon} ${change.item}`);
      if (change.details) {
        lines.push(`  - ${change.details}`);
      }
    }
    
    if (categoryChanges.length > 10) {
      lines.push(`- *...and ${categoryChanges.length - 10} more*`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Group changes by category
 */
function groupChangesByCategory(changes: ChangeRecord[]): Record<string, ChangeRecord[]> {
  const grouped: Record<string, ChangeRecord[]> = {
    source: [],
    entity: [],
    fact: [],
    task: [],
    insight: [],
  };
  
  for (const change of changes) {
    if (grouped[change.category]) {
      grouped[change.category].push(change);
    }
  }
  
  return grouped;
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Save changelog to file
 */
export async function saveChangelog(
  report: ChangelogReport,
  outputPath: string
): Promise<void> {
  const markdown = formatChangelogMarkdown(report);
  await writeFile(outputPath, markdown, 'utf-8');
}

/**
 * Generate and save changelog
 */
export async function generateAndSaveChangelog(
  vaultPath: string,
  db: DatabaseInstance,
  since?: string
): Promise<{ report: ChangelogReport; path: string }> {
  // Load previous state or use default
  const statePath = getSynthStatePath(vaultPath);
  const prevState = await loadSynthState(statePath);
  
  const sinceDate = since || prevState?.lastRun || getDefaultSinceDate();
  
  // Generate report
  const report = generateChangelog(db, sinceDate);
  
  // Save changelog
  const date = new Date().toISOString().split('T')[0];
  const outputPath = join(vaultPath, '40_Brain', 'docs', `changelog-${date}.md`);
  await saveChangelog(report, outputPath);
  
  // Update state
  const newState: SynthState = {
    lastRun: new Date().toISOString(),
    lastSourceCount: (db.prepare('SELECT COUNT(*) as count FROM sources').get() as { count: number }).count,
    lastItemCount: (db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number }).count,
    lastEntityCount: (db.prepare("SELECT COUNT(*) as count FROM items WHERE item_type = 'entity'").get() as { count: number }).count,
  };
  await saveSynthState(statePath, newState);
  
  return { report, path: outputPath };
}

/**
 * Get default since date (7 days ago)
 */
function getDefaultSinceDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString();
}

/**
 * Get changelog since last synth
 */
export async function getChangelogSinceLastSynth(
  vaultPath: string,
  db: DatabaseInstance
): Promise<ChangelogReport | null> {
  const statePath = getSynthStatePath(vaultPath);
  const prevState = await loadSynthState(statePath);
  
  if (!prevState) {
    return null;
  }
  
  return generateChangelog(db, prevState.lastRun);
}
