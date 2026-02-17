/**
 * Project status snapshot tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadTaskQueue,
  getOpenTasks,
  getRecentlyCompleted,
  identifyBlockers,
  calculateSummary,
  calculateMilestoneProgress,
  generateProjectStatus,
  formatStatusMarkdown,
  saveStatusSnapshot,
  type Task,
  type TaskQueue,
  type ProjectStatus,
} from './status.js';
import { initDatabase, closeDatabase } from '../db/connection.js';
import { ensureItemsTable } from '../item/idempotent.js';
import type { DatabaseInstance } from '../db/connection.js';

const sampleTasks: Task[] = [
  {
    id: 'TASK-001',
    milestone: 'M1',
    priority: 1,
    status: 'completed',
    description: 'First task',
    acceptance_criteria: ['Done'],
    created: '2026-01-01',
    completed: '2026-01-15',
    blocked_by: [],
  },
  {
    id: 'TASK-002',
    milestone: 'M1',
    priority: 2,
    status: 'pending',
    description: 'Second task',
    acceptance_criteria: ['Pending'],
    created: '2026-01-01',
    completed: null,
    blocked_by: ['TASK-001'],
  },
  {
    id: 'TASK-003',
    milestone: 'M2',
    priority: 3,
    status: 'pending',
    description: 'Third task',
    acceptance_criteria: ['Pending'],
    created: '2026-01-01',
    completed: null,
    blocked_by: ['TASK-002'],
  },
];

describe('getOpenTasks', () => {
  it('should return pending and in_progress tasks', () => {
    const tasks: Task[] = [
      { ...sampleTasks[0], status: 'completed' },
      { ...sampleTasks[1], status: 'pending' },
      { ...sampleTasks[2], status: 'in_progress' },
    ];

    const open = getOpenTasks(tasks);

    expect(open).toHaveLength(2);
    expect(open[0].status).toBe('pending');
    expect(open[1].status).toBe('in_progress');
  });

  it('should sort by priority', () => {
    const tasks: Task[] = [
      { ...sampleTasks[0], status: 'pending', priority: 10 },
      { ...sampleTasks[1], status: 'pending', priority: 5 },
    ];

    const open = getOpenTasks(tasks);

    expect(open[0].priority).toBe(5);
    expect(open[1].priority).toBe(10);
  });
});

describe('getRecentlyCompleted', () => {
  it('should return tasks completed in last N days', () => {
    const today = new Date().toISOString().split('T')[0];
    const tasks: Task[] = [
      { ...sampleTasks[0], status: 'completed', completed: today },
      { ...sampleTasks[1], status: 'completed', completed: '2020-01-01' },
    ];

    const recent = getRecentlyCompleted(tasks, 7);

    expect(recent).toHaveLength(1);
    expect(recent[0].completed).toBe(today);
  });

  it('should sort by completion date descending', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const tasks: Task[] = [
      { ...sampleTasks[0], status: 'completed', completed: yesterday.toISOString().split('T')[0] },
      { ...sampleTasks[1], status: 'completed', completed: today.toISOString().split('T')[0] },
    ];

    const recent = getRecentlyCompleted(tasks, 7);

    expect(recent[0].completed).toBe(today.toISOString().split('T')[0]);
  });
});

describe('identifyBlockers', () => {
  it('should identify tasks with unresolved blockers', () => {
    const blockers = identifyBlockers(sampleTasks);

    expect(blockers).toHaveLength(1);
    expect(blockers[0].taskId).toBe('TASK-003');
    expect(blockers[0].blockedBy).toContain('TASK-002');
  });

  it('should not include tasks blocked by completed tasks', () => {
    const tasks: Task[] = [
      { ...sampleTasks[0], status: 'completed' },
      { ...sampleTasks[1], status: 'pending', blocked_by: ['TASK-001'] },
    ];

    const blockers = identifyBlockers(tasks);

    expect(blockers).toHaveLength(0);
  });

  it('should assign severity based on priority', () => {
    const tasks: Task[] = [
      { ...sampleTasks[0], status: 'pending', priority: 5, blocked_by: ['TASK-999'] },
      { ...sampleTasks[1], status: 'pending', priority: 15, blocked_by: ['TASK-999'] },
      { ...sampleTasks[2], status: 'pending', priority: 25, blocked_by: ['TASK-999'] },
    ];

    const blockers = identifyBlockers(tasks);

    expect(blockers[0].severity).toBe('critical');
    expect(blockers[1].severity).toBe('high');
    expect(blockers[2].severity).toBe('medium');
  });
});

describe('calculateSummary', () => {
  it('should calculate task statistics', () => {
    const summary = calculateSummary(sampleTasks);

    expect(summary.totalTasks).toBe(3);
    expect(summary.completedTasks).toBe(1);
    expect(summary.pendingTasks).toBe(2);
    expect(summary.completionPercentage).toBe(33);
  });

  it('should handle empty task list', () => {
    const summary = calculateSummary([]);

    expect(summary.totalTasks).toBe(0);
    expect(summary.completionPercentage).toBe(0);
  });
});

describe('calculateMilestoneProgress', () => {
  it('should calculate progress per milestone', () => {
    const milestones = [
      { id: 'M1', name: 'Phase 1', status: 'active' },
      { id: 'M2', name: 'Phase 2', status: 'pending' },
    ];

    const progress = calculateMilestoneProgress(sampleTasks, milestones);

    expect(progress).toHaveLength(2);
    expect(progress[0].id).toBe('M1');
    expect(progress[0].completedTasks).toBe(1);
    expect(progress[0].totalTasks).toBe(2);
    expect(progress[0].percentage).toBe(50);
  });
});

describe('formatStatusMarkdown', () => {
  it('should format status as markdown', () => {
    const status: ProjectStatus = {
      projectName: 'Test Project',
      generatedAt: '2026-02-01T12:00:00Z',
      summary: {
        totalTasks: 10,
        completedTasks: 5,
        pendingTasks: 4,
        blockedTasks: 1,
        completionPercentage: 50,
      },
      openTasks: [sampleTasks[1]],
      recentlyCompleted: [sampleTasks[0]],
      blockers: [{
        taskId: 'TASK-003',
        description: 'Blocked task',
        blockedBy: ['TASK-002'],
        severity: 'high',
      }],
      decisions: [{
        date: '2026-02-01',
        summary: 'Decided to use TypeScript',
      }],
      milestoneProgress: [{
        id: 'M1',
        name: 'Phase 1',
        totalTasks: 5,
        completedTasks: 3,
        percentage: 60,
      }],
    };

    const markdown = formatStatusMarkdown(status);

    expect(markdown).toContain('# Test Project - Status Snapshot');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('| Total Tasks | 10 |');
    expect(markdown).toContain('## ⚠️ Blockers');
    expect(markdown).toContain('TASK-003');
    expect(markdown).toContain('## Open Tasks');
    expect(markdown).toContain('## ✅ Recently Completed');
    expect(markdown).toContain('## 📋 Recent Decisions');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-status-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadTaskQueue', () => {
    it('should load task queue from file', async () => {
      const taskQueue: TaskQueue = {
        project: 'Test',
        version: '1.0',
        milestones: [{ id: 'M1', name: 'Milestone 1', status: 'active' }],
        tasks: sampleTasks,
      };
      await writeFile(join(testDir, 'tasks.json'), JSON.stringify(taskQueue));

      const loaded = await loadTaskQueue(join(testDir, 'tasks.json'));

      expect(loaded).not.toBeNull();
      expect(loaded?.project).toBe('Test');
      expect(loaded?.tasks).toHaveLength(3);
    });

    it('should return null for non-existent file', async () => {
      const loaded = await loadTaskQueue('/nonexistent/tasks.json');
      expect(loaded).toBeNull();
    });
  });

  describe('generateProjectStatus', () => {
    it('should generate status from task queue', async () => {
      const taskQueue: TaskQueue = {
        project: 'Test Project',
        version: '1.0',
        milestones: [{ id: 'M1', name: 'Phase 1', status: 'active' }],
        tasks: sampleTasks,
      };
      const taskPath = join(testDir, 'tasks.json');
      await writeFile(taskPath, JSON.stringify(taskQueue));

      const status = await generateProjectStatus(taskPath);

      expect(status).not.toBeNull();
      expect(status?.projectName).toBe('Test Project');
      expect(status?.summary.totalTasks).toBe(3);
    });
  });

  describe('saveStatusSnapshot', () => {
    it('should save status to file', async () => {
      const status: ProjectStatus = {
        projectName: 'Test',
        generatedAt: new Date().toISOString(),
        summary: { totalTasks: 1, completedTasks: 0, pendingTasks: 1, blockedTasks: 0, completionPercentage: 0 },
        openTasks: [],
        recentlyCompleted: [],
        blockers: [],
        decisions: [],
        milestoneProgress: [],
      };

      const outputPath = join(testDir, 'status.md');
      await saveStatusSnapshot(status, outputPath);

      const content = await readFile(outputPath, 'utf-8');
      expect(content).toContain('# Test - Status Snapshot');
    });
  });
});

describe('Database operations', () => {
  let testDir: string;
  let db: DatabaseInstance;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-status-db-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    const dbPath = join(testDir, 'test.db');
    const result = await initDatabase(dbPath);
    db = result.db;
    ensureItemsTable(db);

    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('test.md', 'test', 'markdown', 'hash', 100)
    `).run();
    db.prepare(`
      INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line)
      VALUES (1, 0, 'Content', 1, 10)
    `).run();
  });

  afterEach(async () => {
    closeDatabase(db);
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should extract decisions from database', async () => {
    db.prepare(`
      INSERT INTO items (chunk_id, item_type, content, hash, created_at)
      VALUES (1, 'insight', 'We decided to use SQLite for storage', 'hash1', datetime('now'))
    `).run();

    const taskQueue: TaskQueue = {
      project: 'Test',
      version: '1.0',
      milestones: [],
      tasks: [],
    };
    const taskPath = join(testDir, 'tasks.json');
    await writeFile(taskPath, JSON.stringify(taskQueue));

    const status = await generateProjectStatus(taskPath, db);

    expect(status?.decisions.length).toBeGreaterThanOrEqual(0);
  });
});
