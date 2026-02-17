/**
 * Project status snapshot generation
 * Creates status reports with tasks, decisions, and blockers
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { DatabaseInstance } from '../db/connection.js';

/**
 * Task status types
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

/**
 * Task from task queue
 */
export interface Task {
  id: string;
  milestone: string;
  priority: number;
  status: TaskStatus;
  description: string;
  acceptance_criteria: string[];
  created: string;
  completed: string | null;
  blocked_by: string[];
}

/**
 * Task queue structure
 */
export interface TaskQueue {
  project: string;
  version: string;
  milestones: Array<{ id: string; name: string; status: string }>;
  tasks: Task[];
}

/**
 * Decision record
 */
export interface Decision {
  date: string;
  summary: string;
  context?: string;
  outcome?: string;
}

/**
 * Blocker information
 */
export interface Blocker {
  taskId: string;
  description: string;
  blockedBy: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Project status snapshot
 */
export interface ProjectStatus {
  projectName: string;
  generatedAt: string;
  summary: StatusSummary;
  openTasks: Task[];
  recentlyCompleted: Task[];
  blockers: Blocker[];
  decisions: Decision[];
  milestoneProgress: MilestoneProgress[];
}

/**
 * Status summary
 */
export interface StatusSummary {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  completionPercentage: number;
}

/**
 * Milestone progress
 */
export interface MilestoneProgress {
  id: string;
  name: string;
  totalTasks: number;
  completedTasks: number;
  percentage: number;
}

/**
 * Load task queue from file
 */
export async function loadTaskQueue(taskQueuePath: string): Promise<TaskQueue | null> {
  if (!existsSync(taskQueuePath)) {
    return null;
  }
  
  try {
    const content = await readFile(taskQueuePath, 'utf-8');
    return JSON.parse(content) as TaskQueue;
  } catch {
    return null;
  }
}

/**
 * Get open tasks (pending or in_progress)
 */
export function getOpenTasks(tasks: Task[]): Task[] {
  return tasks
    .filter(t => t.status === 'pending' || t.status === 'in_progress')
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Get recently completed tasks (last 7 days)
 */
export function getRecentlyCompleted(tasks: Task[], days: number = 7): Task[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  
  return tasks
    .filter(t => t.status === 'completed' && t.completed && t.completed >= cutoffStr)
    .sort((a, b) => (b.completed || '').localeCompare(a.completed || ''));
}

/**
 * Identify blockers
 */
export function identifyBlockers(tasks: Task[]): Blocker[] {
  const blockers: Blocker[] = [];
  const completedIds = new Set(tasks.filter(t => t.status === 'completed').map(t => t.id));
  
  for (const task of tasks) {
    if (task.status === 'pending' || task.status === 'in_progress') {
      const unresolvedBlockers = task.blocked_by.filter(id => !completedIds.has(id));
      
      if (unresolvedBlockers.length > 0) {
        blockers.push({
          taskId: task.id,
          description: task.description,
          blockedBy: unresolvedBlockers,
          severity: task.priority <= 10 ? 'critical' : task.priority <= 20 ? 'high' : 'medium',
        });
      }
    }
  }
  
  return blockers.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Calculate status summary
 */
export function calculateSummary(tasks: Task[]): StatusSummary {
  const completed = tasks.filter(t => t.status === 'completed').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  
  return {
    totalTasks: tasks.length,
    completedTasks: completed,
    pendingTasks: pending,
    blockedTasks: blocked,
    completionPercentage: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
  };
}

/**
 * Calculate milestone progress
 */
export function calculateMilestoneProgress(
  tasks: Task[],
  milestones: TaskQueue['milestones']
): MilestoneProgress[] {
  const progress: MilestoneProgress[] = [];
  
  for (const milestone of milestones) {
    const milestoneTasks = tasks.filter(t => t.milestone === milestone.id);
    const completed = milestoneTasks.filter(t => t.status === 'completed').length;
    
    progress.push({
      id: milestone.id,
      name: milestone.name,
      totalTasks: milestoneTasks.length,
      completedTasks: completed,
      percentage: milestoneTasks.length > 0 ? Math.round((completed / milestoneTasks.length) * 100) : 0,
    });
  }
  
  return progress;
}

/**
 * Extract decisions from items in database
 */
export function extractDecisions(
  db: DatabaseInstance,
  since?: string
): Decision[] {
  let sql = `
    SELECT content, created_at
    FROM items
    WHERE item_type = 'insight'
    AND (content LIKE '%decided%' OR content LIKE '%decision%' OR content LIKE '%chose%' OR content LIKE '%will%')
  `;
  const params: string[] = [];
  
  if (since) {
    sql += ' AND created_at >= ?';
    params.push(since);
  }
  
  sql += ' ORDER BY created_at DESC LIMIT 10';
  
  const rows = db.prepare(sql).all(...params) as Array<{ content: string; created_at: string }>;
  
  return rows.map(row => ({
    date: row.created_at.split('T')[0],
    summary: row.content.slice(0, 200) + (row.content.length > 200 ? '...' : ''),
  }));
}

/**
 * Generate project status snapshot
 */
export async function generateProjectStatus(
  taskQueuePath: string,
  db?: DatabaseInstance
): Promise<ProjectStatus | null> {
  const taskQueue = await loadTaskQueue(taskQueuePath);
  
  if (!taskQueue) {
    return null;
  }
  
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const decisions = db ? extractDecisions(db, sevenDaysAgo.toISOString()) : [];
  
  return {
    projectName: taskQueue.project,
    generatedAt: now.toISOString(),
    summary: calculateSummary(taskQueue.tasks),
    openTasks: getOpenTasks(taskQueue.tasks),
    recentlyCompleted: getRecentlyCompleted(taskQueue.tasks),
    blockers: identifyBlockers(taskQueue.tasks),
    decisions,
    milestoneProgress: calculateMilestoneProgress(taskQueue.tasks, taskQueue.milestones),
  };
}

/**
 * Format status as markdown
 */
export function formatStatusMarkdown(status: ProjectStatus): string {
  const lines: string[] = [];
  
  lines.push(`# ${status.projectName} - Status Snapshot`);
  lines.push('');
  lines.push(`*Generated: ${status.generatedAt.split('T')[0]}*`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Tasks | ${status.summary.totalTasks} |`);
  lines.push(`| Completed | ${status.summary.completedTasks} |`);
  lines.push(`| Pending | ${status.summary.pendingTasks} |`);
  lines.push(`| Blocked | ${status.summary.blockedTasks} |`);
  lines.push(`| Progress | ${status.summary.completionPercentage}% |`);
  lines.push('');
  
  // Milestone Progress
  if (status.milestoneProgress.length > 0) {
    lines.push('## Milestone Progress');
    lines.push('');
    for (const m of status.milestoneProgress) {
      const bar = generateProgressBar(m.percentage);
      lines.push(`- **${m.id}** ${m.name}: ${bar} ${m.percentage}% (${m.completedTasks}/${m.totalTasks})`);
    }
    lines.push('');
  }
  
  // Blockers
  if (status.blockers.length > 0) {
    lines.push('## ⚠️ Blockers');
    lines.push('');
    for (const blocker of status.blockers) {
      const severity = blocker.severity === 'critical' ? '🔴' : blocker.severity === 'high' ? '🟠' : '🟡';
      lines.push(`- ${severity} **${blocker.taskId}**: ${blocker.description}`);
      lines.push(`  - Blocked by: ${blocker.blockedBy.join(', ')}`);
    }
    lines.push('');
  }
  
  // Open Tasks
  if (status.openTasks.length > 0) {
    lines.push('## Open Tasks');
    lines.push('');
    const topTasks = status.openTasks.slice(0, 10);
    for (const task of topTasks) {
      const statusIcon = task.status === 'in_progress' ? '🔄' : '⏳';
      lines.push(`- ${statusIcon} **${task.id}** (${task.milestone}): ${task.description}`);
    }
    if (status.openTasks.length > 10) {
      lines.push(`- *...and ${status.openTasks.length - 10} more*`);
    }
    lines.push('');
  }
  
  // Recently Completed
  if (status.recentlyCompleted.length > 0) {
    lines.push('## ✅ Recently Completed');
    lines.push('');
    for (const task of status.recentlyCompleted.slice(0, 5)) {
      lines.push(`- **${task.id}**: ${task.description} (${task.completed})`);
    }
    lines.push('');
  }
  
  // Decisions
  if (status.decisions.length > 0) {
    lines.push('## 📋 Recent Decisions');
    lines.push('');
    for (const decision of status.decisions) {
      lines.push(`- **${decision.date}**: ${decision.summary}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Generate ASCII progress bar
 */
function generateProgressBar(percentage: number, width: number = 10): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Save status snapshot to file
 */
export async function saveStatusSnapshot(
  status: ProjectStatus,
  outputPath: string
): Promise<void> {
  const markdown = formatStatusMarkdown(status);
  await writeFile(outputPath, markdown, 'utf-8');
}

/**
 * Generate and save project status
 */
export async function generateAndSaveStatus(
  vaultPath: string,
  db?: DatabaseInstance
): Promise<{ status: ProjectStatus; path: string } | null> {
  const taskQueuePath = join(vaultPath, '40_Brain', '.agent', 'tasks', 'tasks.json');
  const status = await generateProjectStatus(taskQueuePath, db);
  
  if (!status) {
    return null;
  }
  
  const date = new Date().toISOString().split('T')[0];
  const outputPath = join(vaultPath, '40_Brain', 'docs', `status-${date}.md`);
  
  await saveStatusSnapshot(status, outputPath);
  
  return { status, path: outputPath };
}
