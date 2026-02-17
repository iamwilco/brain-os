/**
 * Agent send command tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  resolveAgentPath,
  loadAgentContext,
  sendToAgent,
  sendToSkill,
  broadcastMessage,
  formatSendResult,
  formatBroadcastResults,
  type SendResult,
} from './send.js';
import { receiveMessages } from './messaging.js';

describe('formatSendResult', () => {
  it('should format successful result', () => {
    const result: SendResult = {
      success: true,
      messageId: 'msg_test',
      duration: 50,
    };

    const formatted = formatSendResult(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('msg_test');
    expect(formatted).toContain('50ms');
  });

  it('should format failed result', () => {
    const result: SendResult = {
      success: false,
      messageId: '',
      error: 'Agent not found',
      duration: 10,
    };

    const formatted = formatSendResult(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('Agent not found');
  });

  it('should format timeout result', () => {
    const result: SendResult = {
      success: true,
      messageId: 'msg_test',
      error: 'Response timeout',
      duration: 5000,
    };

    const formatted = formatSendResult(result);

    expect(formatted).toContain('timeout');
  });
});

describe('formatBroadcastResults', () => {
  it('should format broadcast results', () => {
    const results = new Map<string, SendResult>();
    results.set('agent_a', { success: true, messageId: 'msg_1', duration: 10 });
    results.set('agent_b', { success: false, messageId: '', error: 'Not found', duration: 5 });

    const formatted = formatBroadcastResults(results);

    expect(formatted).toContain('agent_a');
    expect(formatted).toContain('agent_b');
    expect(formatted).toContain('Sent:** 1');
    expect(formatted).toContain('Failed:** 1');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-send-test-${Date.now()}`);
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

  describe('resolveAgentPath', () => {
    it('should resolve agent path by ID', async () => {
      const agentPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(agentPath, 'Test', 'project', 'agent_project_test');

      const resolved = await resolveAgentPath(testDir, 'agent_project_test');

      expect(resolved).toBe(agentPath);
    });

    it('should return null for unknown ID', async () => {
      const resolved = await resolveAgentPath(testDir, 'unknown_agent');
      expect(resolved).toBeNull();
    });
  });

  describe('loadAgentContext', () => {
    it('should load agent context', async () => {
      const agentPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(agentPath, 'Test', 'project', 'agent_project_test');

      const context = await loadAgentContext(agentPath, 'agent_project_test');

      expect(context.agentId).toBe('agent_project_test');
      expect(context.agentPath).toBe(agentPath);
    });

    it('should load memory if exists', async () => {
      const agentPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(agentPath, 'Test', 'project', 'agent_project_test');
      
      const memoryMd = `---
type: agent-memory
agent: agent_project_test
updated: 2026-02-01
---

# Memory

Test memory content.
`;
      await writeFile(join(agentPath, 'MEMORY.md'), memoryMd);

      const context = await loadAgentContext(agentPath, 'agent_project_test');

      expect(context.memory).toContain('Test memory content');
    });
  });

  describe('sendToAgent', () => {
    it('should send message to agent', async () => {
      const adminPath = join(testDir, '40_Brain', 'agents', 'admin');
      const projectPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      
      await createAgent(adminPath, 'Admin', 'admin', 'agent_admin');
      await createAgent(projectPath, 'Test', 'project', 'agent_project_test');

      const result = await sendToAgent(
        testDir,
        'agent_admin',
        'agent_project_test',
        'Hello',
        { greeting: true }
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      
      // Verify message received
      const messages = await receiveMessages(projectPath, 'agent_project_test');
      expect(messages.length).toBe(1);
      expect(messages[0].message.subject).toBe('Hello');
    });

    it('should fail for nonexistent sender', async () => {
      const projectPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      await createAgent(projectPath, 'Test', 'project', 'agent_project_test');

      const result = await sendToAgent(
        testDir,
        'nonexistent',
        'agent_project_test',
        'Test',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sender');
    });

    it('should fail for nonexistent recipient', async () => {
      const adminPath = join(testDir, '40_Brain', 'agents', 'admin');
      await createAgent(adminPath, 'Admin', 'admin', 'agent_admin');

      const result = await sendToAgent(
        testDir,
        'agent_admin',
        'nonexistent',
        'Test',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Recipient');
    });
  });

  describe('sendToSkill', () => {
    it('should send to skill agent by name', async () => {
      const adminPath = join(testDir, '40_Brain', 'agents', 'admin');
      const skillPath = join(testDir, '40_Brain', 'agents', 'skills', 'writer');
      
      await createAgent(adminPath, 'Admin', 'admin', 'agent_admin');
      await createAgent(skillPath, 'Writer', 'skill', 'agent_skill_writer');

      const result = await sendToSkill(
        testDir,
        'agent_admin',
        'writer',
        'Write an article about testing'
      );

      expect(result.success).toBe(true);
      
      // Verify message received
      const messages = await receiveMessages(skillPath, 'agent_skill_writer');
      expect(messages.length).toBe(1);
      expect(messages[0].message.payload).toHaveProperty('task');
    });
  });

  describe('broadcastMessage', () => {
    it('should broadcast to multiple agents', async () => {
      const adminPath = join(testDir, '40_Brain', 'agents', 'admin');
      const projectPath = join(testDir, '30_Projects', 'TestProject', 'agent');
      const skillPath = join(testDir, '40_Brain', 'agents', 'skills', 'writer');
      
      await createAgent(adminPath, 'Admin', 'admin', 'agent_admin');
      await createAgent(projectPath, 'Test', 'project', 'agent_project_test');
      await createAgent(skillPath, 'Writer', 'skill', 'agent_skill_writer');

      const results = await broadcastMessage(
        testDir,
        'agent_admin',
        ['agent_project_test', 'agent_skill_writer'],
        'Broadcast Test',
        { broadcast: true }
      );

      expect(results.size).toBe(2);
      expect(results.get('agent_project_test')?.success).toBe(true);
      expect(results.get('agent_skill_writer')?.success).toBe(true);
    });
  });
});
