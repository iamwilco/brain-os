/**
 * Agent chat tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildSystemPrompt,
  formatHistory,
  initChatContext,
  sendMessage,
  defaultHandler,
  chatOnce,
  listChatAgents,
  type ChatContext,
} from './chat.js';
import type { AgentDefinition } from './parser.js';
import type { TranscriptMessage } from './session.js';

describe('buildSystemPrompt', () => {
  it('should build prompt from agent definition', () => {
    const agent: AgentDefinition = {
      frontmatter: {
        name: 'Test Agent',
        id: 'agent_test',
        type: 'skill',
        scope: '**/*',
        created: '2026-02-01',
        updated: '2026-02-01',
      },
      instructions: '',
      sections: {
        identity: 'A helpful test agent.',
        capabilities: '- Can test things\n- Can validate',
        guidelines: 'Be helpful.',
        other: {},
      },
      path: '/test/AGENT.md',
    };

    const prompt = buildSystemPrompt(agent);

    expect(prompt).toContain('You are Test Agent');
    expect(prompt).toContain('## Identity');
    expect(prompt).toContain('helpful test agent');
    expect(prompt).toContain('## Capabilities');
    expect(prompt).toContain('Can test things');
    expect(prompt).toContain('## Guidelines');
  });

  it('should handle missing sections', () => {
    const agent: AgentDefinition = {
      frontmatter: {
        name: 'Minimal Agent',
        id: 'agent_minimal',
        type: 'skill',
        scope: '**/*',
        created: '2026-02-01',
        updated: '2026-02-01',
      },
      instructions: '',
      sections: { other: {} },
      path: '/test/AGENT.md',
    };

    const prompt = buildSystemPrompt(agent);

    expect(prompt).toContain('You are Minimal Agent');
    expect(prompt).not.toContain('## Identity');
  });
});

describe('formatHistory', () => {
  it('should format messages', () => {
    const messages: TranscriptMessage[] = [
      { id: '1', role: 'user', content: 'Hello', timestamp: '2026-02-01T00:00:00Z' },
      { id: '2', role: 'assistant', content: 'Hi there!', timestamp: '2026-02-01T00:00:01Z' },
    ];

    const formatted = formatHistory(messages);

    expect(formatted).toContain('USER: Hello');
    expect(formatted).toContain('ASSISTANT: Hi there!');
  });

  it('should respect maxMessages limit', () => {
    const messages: TranscriptMessage[] = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      role: 'user' as const,
      content: `Message ${i}`,
      timestamp: '2026-02-01T00:00:00Z',
    }));

    const formatted = formatHistory(messages, 5);
    const lines = formatted.split('\n\n');

    expect(lines).toHaveLength(5);
    expect(formatted).toContain('Message 29');
    expect(formatted).not.toContain('Message 0');
  });
});

describe('defaultHandler', () => {
  it('should echo message with agent name', async () => {
    const context: ChatContext = {
      agent: {
        frontmatter: {
          name: 'Echo Agent',
          id: 'agent_echo',
          type: 'skill',
          scope: '**/*',
          created: '2026-02-01',
          updated: '2026-02-01',
        },
        instructions: '',
        sections: { other: {} },
        path: '/test/AGENT.md',
      },
      session: {
        id: 'session-1',
        agentId: 'agent_echo',
        status: 'active',
        createdAt: '2026-02-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
        messageCount: 0,
      },
      agentPath: '/test',
      history: [],
    };

    const response = await defaultHandler('Hello!', context);

    expect(response).toBe('[Echo Agent] Echo: Hello!');
  });
});

describe('Chat operations with files', () => {
  let testDir: string;
  let vaultPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-chat-test-${Date.now()}`);
    vaultPath = testDir;
    
    await mkdir(join(testDir, '40_Brain', 'agents', 'admin'), { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'skills', 'writer'), { recursive: true });
    await mkdir(join(testDir, '30_Projects'), { recursive: true });

    // Create admin agent
    const adminAgent = `---
name: Admin Agent
id: agent_admin_wilco
type: admin
scope: "**/*"
created: 2026-02-01
updated: 2026-02-01
---

# Admin Agent

## Identity

The system administrator.

## Capabilities

- Manage system
- Coordinate agents
`;
    await writeFile(join(testDir, '40_Brain', 'agents', 'admin', 'AGENT.md'), adminAgent);

    // Create skill agent
    const writerAgent = `---
name: Writer Agent
id: agent_skill_writer
type: skill
scope: "**/*"
created: 2026-02-01
updated: 2026-02-01
---

# Writer Agent

## Identity

A writing specialist.
`;
    await writeFile(join(testDir, '40_Brain', 'agents', 'skills', 'writer', 'AGENT.md'), writerAgent);
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('initChatContext', () => {
    it('should initialize context with default admin agent', async () => {
      const context = await initChatContext(vaultPath, {});

      expect(context).not.toBeNull();
      expect(context?.agent.frontmatter.name).toBe('Admin Agent');
      expect(context?.session).toBeDefined();
    });

    it('should initialize context by agent ID', async () => {
      const context = await initChatContext(vaultPath, {
        agentId: 'agent_skill_writer',
      });

      expect(context).not.toBeNull();
      expect(context?.agent.frontmatter.name).toBe('Writer Agent');
    });

    it('should return null for non-existent agent', async () => {
      const context = await initChatContext(vaultPath, {
        agentId: 'nonexistent',
      });

      expect(context).toBeNull();
    });

    it('should create new session when requested', async () => {
      const context1 = await initChatContext(vaultPath, {});
      const context2 = await initChatContext(vaultPath, { newSession: true });

      expect(context2?.session.id).not.toBe(context1?.session.id);
    });
  });

  describe('sendMessage', () => {
    it('should send message and get response', async () => {
      const context = await initChatContext(vaultPath, {});
      if (!context) throw new Error('Context not initialized');

      const response = await sendMessage(context, 'Hello', defaultHandler);

      expect(response).toContain('Echo: Hello');
      expect(context.history.length).toBe(2); // user + assistant
    });

    it('should persist messages to transcript', async () => {
      const context = await initChatContext(vaultPath, { newSession: true });
      if (!context) throw new Error('Context not initialized');

      await sendMessage(context, 'First message', defaultHandler);
      await sendMessage(context, 'Second message', defaultHandler);

      expect(context.history).toHaveLength(4);
      expect(context.history[0].role).toBe('user');
      expect(context.history[1].role).toBe('assistant');
    });
  });

  describe('chatOnce', () => {
    it('should send single message and return response', async () => {
      const result = await chatOnce(vaultPath, 'Test message', {});

      expect(result).not.toBeNull();
      expect(result?.response).toContain('Echo: Test message');
      expect(result?.sessionId).toBeDefined();
    });

    it('should return null for invalid agent', async () => {
      const result = await chatOnce(vaultPath, 'Test', {
        agentId: 'nonexistent',
      });

      expect(result).toBeNull();
    });
  });

  describe('listChatAgents', () => {
    it('should list all available agents', async () => {
      const agents = await listChatAgents(vaultPath);

      expect(agents.length).toBeGreaterThanOrEqual(2);
      expect(agents.some(a => a.id === 'agent_admin_wilco')).toBe(true);
      expect(agents.some(a => a.id === 'agent_skill_writer')).toBe(true);
    });
  });
});
