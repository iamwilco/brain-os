/**
 * Agent coordination and handoff tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateDelegationId,
  generateHandoffId,
  generateTaskId,
  delegateTask,
  performHandoff,
  distributeTask,
  formatDelegationResult,
  formatHandoffResult,
  formatAggregatedResult,
  type DelegationResult,
  type HandoffResult,
  type AggregatedResult,
} from './coordination.js';
import { receiveMessages } from './messaging.js';

describe('ID generators', () => {
  it('should generate unique delegation IDs', () => {
    const id1 = generateDelegationId();
    const id2 = generateDelegationId();
    
    expect(id1).toMatch(/^del_[a-z0-9]+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  it('should generate unique handoff IDs', () => {
    const id1 = generateHandoffId();
    const id2 = generateHandoffId();
    
    expect(id1).toMatch(/^hnd_[a-z0-9]+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });

  it('should generate unique task IDs', () => {
    const id1 = generateTaskId();
    const id2 = generateTaskId();
    
    expect(id1).toMatch(/^task_[a-z0-9]+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });
});

describe('formatDelegationResult', () => {
  it('should format successful delegation', () => {
    const result: DelegationResult = {
      success: true,
      delegationId: 'del_test',
      fromAgent: 'agent_admin',
      toAgent: 'agent_project_test',
      task: 'Review code',
      duration: 50,
    };

    const formatted = formatDelegationResult(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('del_test');
    expect(formatted).toContain('agent_admin');
    expect(formatted).toContain('Review code');
  });

  it('should format failed delegation', () => {
    const result: DelegationResult = {
      success: false,
      delegationId: 'del_test',
      fromAgent: 'agent_admin',
      toAgent: 'agent_unknown',
      task: 'Test',
      error: 'Agent not found',
      duration: 10,
    };

    const formatted = formatDelegationResult(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('Agent not found');
  });
});

describe('formatHandoffResult', () => {
  it('should format successful handoff', () => {
    const result: HandoffResult = {
      success: true,
      handoffId: 'hnd_test',
      fromAgent: 'agent_admin',
      toAgent: 'agent_project_test',
      acknowledged: false,
      duration: 30,
    };

    const formatted = formatHandoffResult(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('hnd_test');
  });

  it('should format failed handoff', () => {
    const result: HandoffResult = {
      success: false,
      handoffId: 'hnd_test',
      fromAgent: 'agent_admin',
      toAgent: 'agent_unknown',
      acknowledged: false,
      error: 'Agent not found',
      duration: 10,
    };

    const formatted = formatHandoffResult(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('Agent not found');
  });
});

describe('formatAggregatedResult', () => {
  it('should format aggregated results', () => {
    const result: AggregatedResult = {
      taskId: 'task_test',
      description: 'Multi-agent task',
      totalAgents: 3,
      successfulAgents: 2,
      failedAgents: 1,
      results: new Map([
        ['agent_a', { status: 'done' }],
        ['agent_b', { status: 'done' }],
      ]),
      errors: new Map([['agent_c', 'Timeout']]),
      duration: 1000,
    };

    const formatted = formatAggregatedResult(result);

    expect(formatted).toContain('Aggregated Results');
    expect(formatted).toContain('Total Agents: 3');
    expect(formatted).toContain('Successful: 2');
    expect(formatted).toContain('Failed: 1');
    expect(formatted).toContain('agent_c');
    expect(formatted).toContain('Timeout');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-coord-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create vault structure
    await mkdir(join(testDir, '40_Brain', 'agents', 'admin', 'sessions'), { recursive: true });
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

  describe('delegateTask', () => {
    it('should delegate task to another agent', async () => {
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

      const result = await delegateTask(testDir, {
        fromAgent: 'agent_admin',
        toAgent: 'agent_project_test',
        task: 'Review documentation',
        context: 'Focus on API docs',
        priority: 'high',
      });

      expect(result.success).toBe(true);
      expect(result.delegationId).toMatch(/^del_/);
      
      // Verify message received
      const projectPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      const messages = await receiveMessages(projectPath, 'agent_project_test');
      expect(messages.length).toBe(1);
      expect(messages[0].message.subject).toContain('Delegation');
    });

    it('should fail for nonexistent agent', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin'
      );

      const result = await delegateTask(testDir, {
        fromAgent: 'agent_admin',
        toAgent: 'agent_unknown',
        task: 'Test task',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('performHandoff', () => {
    it('should perform handoff to another agent', async () => {
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

      const result = await performHandoff(testDir, {
        fromAgent: 'agent_admin',
        toAgent: 'agent_project_test',
        reason: 'Context switch',
        context: {
          currentState: 'Reviewing docs',
          pendingTasks: ['Complete review'],
          importantNotes: ['Check API changes'],
        },
      });

      expect(result.success).toBe(true);
      expect(result.handoffId).toMatch(/^hnd_/);
      
      // Verify handoff message received
      const projectPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      const messages = await receiveMessages(projectPath, 'agent_project_test');
      expect(messages.length).toBe(1);
      expect(messages[0].message.subject).toContain('Handoff');
    });
  });

  describe('distributeTask', () => {
    it('should distribute task across agents', async () => {
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

      const task = await distributeTask(
        testDir,
        'agent_admin',
        'Review all documentation',
        ['agent_project_test'],
        (agent, mainTask) => `${agent}: ${mainTask}`
      );

      expect(task.id).toMatch(/^task_/);
      expect(task.status).toBe('in_progress');
      expect(task.agents).toContain('agent_project_test');
      expect(task.subtasks.has('agent_project_test')).toBe(true);
    });
  });
});
