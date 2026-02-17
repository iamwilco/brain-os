/**
 * Agent definition parser tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseFrontmatter,
  extractSections,
  validateFrontmatter,
  parseAgentDefinition,
  loadAgentDefinition,
  getAgentIdFromPath,
  discoverAgents,
  type AgentFrontmatter,
} from './parser.js';

describe('parseFrontmatter', () => {
  it('should parse YAML frontmatter', () => {
    const content = `---
name: Test Agent
id: agent_test
type: skill
scope: "**/*"
created: 2026-02-01
---

# Test Agent

Body content here.
`;
    const result = parseFrontmatter(content);

    expect(result.frontmatter.name).toBe('Test Agent');
    expect(result.frontmatter.id).toBe('agent_test');
    expect(result.frontmatter.type).toBe('skill');
    expect(result.body).toContain('# Test Agent');
  });

  it('should handle content without frontmatter', () => {
    const content = '# No Frontmatter\n\nJust content.';
    const result = parseFrontmatter(content);

    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe(content);
  });

  it('should parse quoted values', () => {
    const content = `---
name: "Quoted Name"
scope: '**/*'
---
Body`;
    const result = parseFrontmatter(content);

    expect(result.frontmatter.name).toBe('Quoted Name');
    expect(result.frontmatter.scope).toBe('**/*');
  });

  it('should parse arrays', () => {
    const content = `---
tags: [tag1, tag2, tag3]
---
Body`;
    const result = parseFrontmatter(content);

    expect(result.frontmatter.tags).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('should parse booleans', () => {
    const content = `---
enabled: true
disabled: false
---
Body`;
    const result = parseFrontmatter(content);

    expect(result.frontmatter.enabled).toBe(true);
    expect(result.frontmatter.disabled).toBe(false);
  });
});

describe('extractSections', () => {
  it('should extract named sections', () => {
    const body = `
# Main Title

## Identity

Name and role info.

## Capabilities

What the agent can do.

## Guidelines

Behavioral guidelines.
`;
    const sections = extractSections(body);

    expect(sections.identity).toContain('Name and role info');
    expect(sections.capabilities).toContain('What the agent can do');
    expect(sections.guidelines).toContain('Behavioral guidelines');
  });

  it('should handle other sections', () => {
    const body = `
## Custom Section

Custom content here.
`;
    const sections = extractSections(body);

    expect(sections.other['custom section']).toContain('Custom content');
  });
});

describe('validateFrontmatter', () => {
  it('should validate required fields', () => {
    const valid: Record<string, unknown> = {
      name: 'Test',
      id: 'agent_test',
      type: 'skill',
      scope: '**/*',
    };

    const result = validateFrontmatter(valid);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should report missing fields', () => {
    const invalid: Record<string, unknown> = {
      name: 'Test',
    };

    const result = validateFrontmatter(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should warn about invalid ID format', () => {
    const withWarning: Record<string, unknown> = {
      name: 'Test',
      id: 'invalid_id',
      type: 'skill',
      scope: '**/*',
    };

    const result = validateFrontmatter(withWarning);

    expect(result.warnings.some(w => w.includes('agent_'))).toBe(true);
  });

  it('should reject invalid type', () => {
    const invalid: Record<string, unknown> = {
      name: 'Test',
      id: 'agent_test',
      type: 'invalid',
      scope: '**/*',
    };

    const result = validateFrontmatter(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('type'))).toBe(true);
  });
});

describe('parseAgentDefinition', () => {
  it('should parse complete agent definition', () => {
    const content = `---
name: Test Agent
id: agent_test
type: skill
scope: "**/*"
created: 2026-02-01
updated: 2026-02-01
---

# Test Agent

## Identity

A test agent for unit tests.

## Capabilities

- Can run tests
- Can validate data
`;
    const result = parseAgentDefinition(content, '/path/to/AGENT.md');

    expect(result).not.toBeNull();
    expect(result?.frontmatter.name).toBe('Test Agent');
    expect(result?.sections.identity).toContain('test agent');
    expect(result?.sections.capabilities).toContain('run tests');
  });

  it('should return null for invalid definition', () => {
    const content = `---
name: Missing Fields
---
Body`;
    const result = parseAgentDefinition(content, '/path/to/AGENT.md');

    expect(result).toBeNull();
  });
});

describe('getAgentIdFromPath', () => {
  it('should generate ID for admin agent', () => {
    const id = getAgentIdFromPath('/vault/40_Brain/agents/admin/wilco/AGENT.md');
    expect(id).toContain('agent_');
  });

  it('should generate ID for skill agent', () => {
    const id = getAgentIdFromPath('/vault/40_Brain/agents/skills/writer/AGENT.md');
    expect(id).toContain('agent_skill_');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-agent-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'admin'), { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'skills', 'writer'), { recursive: true });
    await mkdir(join(testDir, '30_Projects', 'TestProject', 'agent'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('loadAgentDefinition', () => {
    it('should load agent from file', async () => {
      const agentContent = `---
name: Test Agent
id: agent_test
type: admin
scope: "**/*"
---

# Test Agent
`;
      await writeFile(join(testDir, '40_Brain', 'agents', 'admin', 'AGENT.md'), agentContent);

      const agent = await loadAgentDefinition(join(testDir, '40_Brain', 'agents', 'admin'));

      expect(agent).not.toBeNull();
      expect(agent?.frontmatter.name).toBe('Test Agent');
    });

    it('should return null for non-existent file', async () => {
      const agent = await loadAgentDefinition('/nonexistent/path');
      expect(agent).toBeNull();
    });
  });

  describe('discoverAgents', () => {
    it('should discover all agents', async () => {
      const adminContent = `---
name: Admin Agent
id: agent_admin
type: admin
scope: "**/*"
---
# Admin`;
      await writeFile(join(testDir, '40_Brain', 'agents', 'admin', 'AGENT.md'), adminContent);

      const skillContent = `---
name: Writer Agent
id: agent_skill_writer
type: skill
scope: "**/*"
---
# Writer`;
      await writeFile(join(testDir, '40_Brain', 'agents', 'skills', 'writer', 'AGENT.md'), skillContent);

      const agents = await discoverAgents(testDir);

      expect(agents.length).toBe(2);
      expect(agents.some(a => a.frontmatter.type === 'admin')).toBe(true);
      expect(agents.some(a => a.frontmatter.type === 'skill')).toBe(true);
    });
  });
});
