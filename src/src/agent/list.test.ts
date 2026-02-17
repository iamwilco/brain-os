/**
 * Agent list and status commands tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getAgentStatus,
  findAgentDirectories,
  listAgents,
  formatRelativeTime,
  formatAgentStatus,
  formatAgentTable,
  formatAgentList,
  getAgentStatusById,
  getAgentsByType,
  getAgentStats,
  formatAgentStats,
  type AgentStatus,
} from './list.js';

describe('formatRelativeTime', () => {
  it('should format recent times', () => {
    const now = new Date();
    const oneMinAgo = new Date(now.getTime() - 60000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
    const oneDayAgo = new Date(now.getTime() - 86400000).toISOString();

    expect(formatRelativeTime(oneMinAgo)).toBe('1m ago');
    expect(formatRelativeTime(oneHourAgo)).toBe('1h ago');
    expect(formatRelativeTime(oneDayAgo)).toBe('1d ago');
  });

  it('should format old dates as ISO date', () => {
    const oldDate = '2026-01-01T12:00:00Z';
    expect(formatRelativeTime(oldDate)).toBe('2026-01-01');
  });
});

describe('formatAgentStatus', () => {
  it('should format agent status', () => {
    const agent: AgentStatus = {
      id: 'agent_test',
      name: 'Test Agent',
      type: 'project',
      scope: '30_Projects/Test/**',
      path: '/vault/30_Projects/Test/agent',
      lastActive: new Date().toISOString(),
      sessionCount: 5,
      hasMemory: true,
      hasContext: true,
    };

    const formatted = formatAgentStatus(agent);

    expect(formatted).toContain('**Test Agent**');
    expect(formatted).toContain('agent_test');
    expect(formatted).toContain('Type: project');
    expect(formatted).toContain('Sessions: 5');
  });

  it('should show never for no activity', () => {
    const agent: AgentStatus = {
      id: 'agent_test',
      name: 'Test',
      type: 'skill',
      scope: '**/*',
      path: '/path',
      lastActive: null,
      sessionCount: 0,
      hasMemory: false,
      hasContext: false,
    };

    const formatted = formatAgentStatus(agent);

    expect(formatted).toContain('Last Active: never');
  });
});

describe('formatAgentTable', () => {
  it('should format agents as table', () => {
    const agents: AgentStatus[] = [
      {
        id: 'agent_1',
        name: 'Agent One',
        type: 'admin',
        scope: '**/*',
        path: '/path1',
        lastActive: new Date().toISOString(),
        sessionCount: 3,
        hasMemory: true,
        hasContext: true,
      },
      {
        id: 'agent_2',
        name: 'Agent Two',
        type: 'project',
        scope: '30_Projects/**',
        path: '/path2',
        lastActive: null,
        sessionCount: 0,
        hasMemory: true,
        hasContext: false,
      },
    ];

    const table = formatAgentTable(agents);

    expect(table).toContain('| Name |');
    expect(table).toContain('Agent One');
    expect(table).toContain('Agent Two');
    expect(table).toContain('admin');
    expect(table).toContain('project');
  });

  it('should handle empty list', () => {
    expect(formatAgentTable([])).toBe('No agents found.');
  });
});

describe('formatAgentList', () => {
  it('should format agents as list', () => {
    const agents: AgentStatus[] = [
      {
        id: 'agent_1',
        name: 'Agent One',
        type: 'admin',
        scope: '**/*',
        path: '/path1',
        lastActive: new Date().toISOString(),
        sessionCount: 3,
        hasMemory: true,
        hasContext: true,
      },
    ];

    const list = formatAgentList(agents);

    expect(list).toContain('**Agent One**');
    expect(list).toContain('[admin]');
    expect(list).toContain('3 sessions');
  });

  it('should handle empty list', () => {
    expect(formatAgentList([])).toBe('No agents found.');
  });
});

describe('formatAgentStats', () => {
  it('should format stats', () => {
    const stats = {
      total: 5,
      byType: { admin: 1, project: 2, skill: 2 },
      active: 3,
      totalSessions: 10,
    };

    const formatted = formatAgentStats(stats);

    expect(formatted).toContain('Total Agents: 5');
    expect(formatted).toContain('Active: 3');
    expect(formatted).toContain('Admin: 1');
    expect(formatted).toContain('Project: 2');
    expect(formatted).toContain('Skill: 2');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-list-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create vault structure
    await mkdir(join(testDir, '40_Brain', 'agents', 'admin'), { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'skills', 'writer'), { recursive: true });
    await mkdir(join(testDir, '30_Projects', 'TestProject', 'agent', 'sessions'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  async function createAgent(path: string, name: string, type: string, id: string) {
    await mkdir(join(path, 'sessions'), { recursive: true });
    
    const agentMd = `---
name: ${name}
id: ${id}
type: ${type}
scope: "**/*"
created: 2026-02-01
updated: 2026-02-01
---

# ${name}
`;
    await writeFile(join(path, 'AGENT.md'), agentMd);
  }

  describe('getAgentStatus', () => {
    it('should get status from agent path', async () => {
      const agentPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(agentPath, 'Test Agent', 'project', 'agent_project_test');

      const status = await getAgentStatus(agentPath);

      expect(status).not.toBeNull();
      expect(status?.id).toBe('agent_project_test');
      expect(status?.name).toBe('Test Agent');
      expect(status?.type).toBe('project');
    });

    it('should return null for missing agent', async () => {
      const status = await getAgentStatus(join(testDir, 'nonexistent'));
      expect(status).toBeNull();
    });
  });

  describe('findAgentDirectories', () => {
    it('should find agent directories', async () => {
      // Create admin agent
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin'
      );

      // Create skill agent
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'skills', 'writer'),
        'Writer',
        'skill',
        'agent_skill_writer'
      );

      // Create project agent
      await createAgent(
        join(testDir, '30_Projects', 'TestProject', 'agent'),
        'Test Project',
        'project',
        'agent_project_test'
      );

      const dirs = await findAgentDirectories(testDir);

      expect(dirs.length).toBe(3);
    });
  });

  describe('listAgents', () => {
    it('should list all agents', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin'
      );
      await createAgent(
        join(testDir, '30_Projects', 'TestProject', 'agent'),
        'Test',
        'project',
        'agent_project_test'
      );

      const agents = await listAgents(testDir, { includeInactive: true });

      expect(agents.length).toBe(2);
    });

    it('should filter by type', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin'
      );
      await createAgent(
        join(testDir, '30_Projects', 'TestProject', 'agent'),
        'Test',
        'project',
        'agent_project_test'
      );

      const projectAgents = await listAgents(testDir, { 
        type: 'project', 
        includeInactive: true 
      });

      expect(projectAgents.length).toBe(1);
      expect(projectAgents[0].type).toBe('project');
    });
  });

  describe('getAgentStatusById', () => {
    it('should find agent by ID', async () => {
      await createAgent(
        join(testDir, '30_Projects', 'TestProject', 'agent'),
        'Test',
        'project',
        'agent_project_test'
      );

      const agent = await getAgentStatusById(testDir, 'agent_project_test');

      expect(agent).not.toBeNull();
      expect(agent?.id).toBe('agent_project_test');
    });

    it('should return null for unknown ID', async () => {
      const agent = await getAgentStatusById(testDir, 'unknown_id');
      expect(agent).toBeNull();
    });
  });

  describe('getAgentsByType', () => {
    it('should get agents by type', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'skills', 'writer'),
        'Writer',
        'skill',
        'agent_skill_writer'
      );

      const skills = await getAgentsByType(testDir, 'skill');

      expect(skills.length).toBe(1);
      expect(skills[0].type).toBe('skill');
    });
  });

  describe('getAgentStats', () => {
    it('should get agent statistics', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin'
      );
      await createAgent(
        join(testDir, '30_Projects', 'TestProject', 'agent'),
        'Test',
        'project',
        'agent_project_test'
      );

      const stats = await getAgentStats(testDir);

      expect(stats.total).toBe(2);
      expect(stats.byType.admin).toBe(1);
      expect(stats.byType.project).toBe(1);
    });
  });
});
