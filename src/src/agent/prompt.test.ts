/**
 * Agent prompt assembly tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  estimateTokens,
  truncateToTokenLimit,
  formatAgentForPrompt,
  formatMemoryForPrompt,
  formatContextForPrompt,
  assemblePrompt,
  assemblePromptWithHistory,
  getPromptStats,
  getSystemPrompt,
  DEFAULT_TOKEN_LIMITS,
} from './prompt.js';
import type { AgentDefinition } from './parser.js';
import type { AgentMemory } from './memory.js';

describe('estimateTokens', () => {
  it('should estimate tokens based on character count', () => {
    const text = 'Hello world'; // 11 chars
    const tokens = estimateTokens(text);
    expect(tokens).toBe(3); // ceil(11/4)
  });

  it('should handle empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should handle long text', () => {
    const text = 'a'.repeat(1000);
    expect(estimateTokens(text)).toBe(250);
  });
});

describe('truncateToTokenLimit', () => {
  it('should not truncate if within limit', () => {
    const text = 'Short text';
    const result = truncateToTokenLimit(text, 100);
    
    expect(result.text).toBe(text);
    expect(result.truncated).toBe(false);
  });

  it('should truncate if over limit', () => {
    const text = 'a'.repeat(1000);
    const result = truncateToTokenLimit(text, 50);
    
    expect(result.text.length).toBeLessThan(text.length);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain('[...truncated...]');
  });

  it('should try to truncate at line boundary', () => {
    const text = 'Line 1\nLine 2\nLine 3\n' + 'a'.repeat(500);
    const result = truncateToTokenLimit(text, 50);
    
    expect(result.truncated).toBe(true);
  });
});

describe('formatAgentForPrompt', () => {
  it('should format agent definition', () => {
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
        identity: 'A test agent.',
        capabilities: '- Can test',
        other: {},
      },
      path: '/test/AGENT.md',
    };

    const formatted = formatAgentForPrompt(agent);

    expect(formatted).toContain('You are Test Agent');
    expect(formatted).toContain('Identity');
    expect(formatted).toContain('Capabilities');
  });
});

describe('formatMemoryForPrompt', () => {
  it('should format memory sections', () => {
    const memory: AgentMemory = {
      frontmatter: {
        type: 'agent-memory',
        agent: 'agent_test',
        updated: '2026-02-01',
      },
      sections: [
        { title: 'Current State', content: 'Active', level: 2 },
        { title: 'Notes', content: 'Some notes', level: 2 },
      ],
      raw: '',
    };

    const formatted = formatMemoryForPrompt(memory);

    expect(formatted).toContain('## Working Memory');
    expect(formatted).toContain('### Current State');
    expect(formatted).toContain('Active');
    expect(formatted).toContain('### Notes');
  });

  it('should skip empty sections', () => {
    const memory: AgentMemory = {
      frontmatter: {
        type: 'agent-memory',
        agent: 'agent_test',
        updated: '2026-02-01',
      },
      sections: [
        { title: 'Empty', content: '', level: 2 },
        { title: 'With Content', content: 'Content here', level: 2 },
      ],
      raw: '',
    };

    const formatted = formatMemoryForPrompt(memory);

    expect(formatted).not.toContain('### Empty');
    expect(formatted).toContain('### With Content');
  });
});

describe('formatContextForPrompt', () => {
  it('should strip frontmatter', () => {
    const contextMd = `---
type: agent-context
agent: agent_test
---

# Context

Some content here.`;

    const formatted = formatContextForPrompt(contextMd);

    expect(formatted).not.toContain('---');
    expect(formatted).not.toContain('type: agent-context');
    expect(formatted).toContain('# Context');
    expect(formatted).toContain('Some content here');
  });

  it('should handle content without frontmatter', () => {
    const content = '# Just Content\n\nNo frontmatter here.';
    const formatted = formatContextForPrompt(content);

    expect(formatted).toBe(content);
  });
});

describe('File-based operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-prompt-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create agent definition
    const agentMd = `---
name: Test Agent
id: agent_test
type: skill
scope: "**/*"
created: 2026-02-01
updated: 2026-02-01
---

# Test Agent

## Identity

A test agent for testing.

## Capabilities

- Can run tests
- Can validate
`;
    await writeFile(join(testDir, 'AGENT.md'), agentMd);

    // Create memory
    const memoryMd = `---
type: agent-memory
agent: agent_test
updated: 2026-02-01
---

# Working Memory

## Current State

- **Status:** Active
- **Task:** Testing

## Notes

Some important notes.
`;
    await writeFile(join(testDir, 'MEMORY.md'), memoryMd);

    // Create context
    const contextMd = `---
type: agent-context
agent: agent_test
generated: 2026-02-01T12:00:00Z
items: 5
---

# Context

## 🔥 Hot

- Recent item [fact]

## 🌤 Warm

- Older item [insight]
`;
    await writeFile(join(testDir, 'CONTEXT.md'), contextMd);
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('assemblePrompt', () => {
    it('should assemble prompt from all components', async () => {
      const result = await assemblePrompt(testDir);

      expect(result.components).toHaveLength(3);
      expect(result.components.map(c => c.name)).toEqual(['agent', 'memory', 'context']);
      expect(result.systemPrompt).toContain('Test Agent');
      expect(result.systemPrompt).toContain('Working Memory');
      expect(result.systemPrompt).toContain('Hot');
    });

    it('should respect token limits', async () => {
      const result = await assemblePrompt(testDir, {
        total: 100,
        agent: 50,
        memory: 25,
        context: 25,
      });

      for (const component of result.components) {
        expect(component.tokens).toBeLessThanOrEqual(50);
      }
    });

    it('should mark truncated components', async () => {
      const result = await assemblePrompt(testDir, {
        agent: 5,
        memory: 5,
        context: 5,
      });

      expect(result.components.some(c => c.truncated)).toBe(true);
    });
  });

  describe('assemblePromptWithHistory', () => {
    it('should include conversation history', async () => {
      const history = 'User: Hello\nAssistant: Hi there!';
      const result = await assemblePromptWithHistory(testDir, history);

      expect(result.components.some(c => c.name === 'conversation')).toBe(true);
    });

    it('should truncate long history', async () => {
      const history = 'Message\n'.repeat(1000);
      const result = await assemblePromptWithHistory(testDir, history, {
        conversation: 50,
      });

      const convComponent = result.components.find(c => c.name === 'conversation');
      expect(convComponent?.truncated).toBe(true);
    });
  });

  describe('getPromptStats', () => {
    it('should return formatted stats', async () => {
      const prompt = await assemblePrompt(testDir);
      const stats = getPromptStats(prompt);

      expect(stats).toContain('Prompt Stats:');
      expect(stats).toContain('agent:');
      expect(stats).toContain('memory:');
      expect(stats).toContain('context:');
      expect(stats).toContain('Total:');
    });
  });

  describe('getSystemPrompt', () => {
    it('should return system prompt string', async () => {
      const prompt = await getSystemPrompt(testDir);

      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('Test Agent');
    });

    it('should exclude memory when disabled', async () => {
      const prompt = await getSystemPrompt(testDir, { includeMemory: false });

      expect(prompt).not.toContain('Working Memory');
    });

    it('should exclude context when disabled', async () => {
      const prompt = await getSystemPrompt(testDir, { includeContext: false });

      expect(prompt).not.toContain('🔥 Hot');
    });
  });
});

describe('DEFAULT_TOKEN_LIMITS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_TOKEN_LIMITS.total).toBeGreaterThan(0);
    expect(DEFAULT_TOKEN_LIMITS.agent).toBeGreaterThan(0);
    expect(DEFAULT_TOKEN_LIMITS.context).toBeGreaterThan(0);
    expect(DEFAULT_TOKEN_LIMITS.memory).toBeGreaterThan(0);
    expect(DEFAULT_TOKEN_LIMITS.conversation).toBeGreaterThan(0);
  });

  it('should have component limits that fit in total', () => {
    const componentSum = 
      DEFAULT_TOKEN_LIMITS.agent +
      DEFAULT_TOKEN_LIMITS.context +
      DEFAULT_TOKEN_LIMITS.memory +
      DEFAULT_TOKEN_LIMITS.conversation;
    
    expect(componentSum).toBeLessThanOrEqual(DEFAULT_TOKEN_LIMITS.total);
  });
});
