/**
 * Skill Agent template tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateSkillId,
  parseSkillFrontmatter,
  extractSkillSections,
  parseSkillDefinition,
  generateSkillMd,
  createSkillFromTemplate,
  formatSkillAsToolDefinition,
  discoverSkills,
  formatSkillList,
  SKILL_CATEGORIES,
  type SkillDefinition,
  type CreateSkillOptions,
} from './skill.js';

describe('generateSkillId', () => {
  it('should generate valid skill ID', () => {
    expect(generateSkillId('Brainstorm')).toBe('agent_skill_brainstorm');
    expect(generateSkillId('SEO Optimizer')).toBe('agent_skill_seo_optimizer');
  });

  it('should handle special characters', () => {
    expect(generateSkillId('Test-Skill!')).toBe('agent_skill_test_skill');
  });
});

describe('parseSkillFrontmatter', () => {
  it('should parse valid frontmatter', () => {
    const content = `---
name: brainstorm
id: agent_skill_brainstorm
description: Creative ideation specialist.
metadata:
  emoji: "💡"
  category: thinking
---

# Brainstorm

Content here.`;

    const { frontmatter, body } = parseSkillFrontmatter(content);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.name).toBe('brainstorm');
    expect(frontmatter?.id).toBe('agent_skill_brainstorm');
    expect(frontmatter?.description).toBe('Creative ideation specialist.');
    expect(frontmatter?.metadata?.emoji).toBe('💡');
    expect(body).toContain('# Brainstorm');
  });

  it('should return null for invalid frontmatter', () => {
    const content = `# No frontmatter

Just content.`;

    const { frontmatter } = parseSkillFrontmatter(content);
    expect(frontmatter).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const content = `---
name: test
---

Content`;

    const { frontmatter } = parseSkillFrontmatter(content);
    expect(frontmatter).toBeNull();
  });
});

describe('extractSkillSections', () => {
  it('should extract sections from body', () => {
    const body = `
# Skill

## Capabilities

- Capability 1
- Capability 2

## Response Format

Provide structured output.

## Guiding Principles

1. Be specific
2. Stay focused

## Anti-Patterns

- Don't do X
`;

    const sections = extractSkillSections(body);

    expect(sections.capabilities).toContain('Capability 1');
    expect(sections.responseFormat).toContain('structured output');
    expect(sections.principles).toContain('Be specific');
    expect(sections.antiPatterns).toContain("Don't do X");
  });
});

describe('generateSkillMd', () => {
  it('should generate valid SKILL.md content', () => {
    const options: CreateSkillOptions = {
      name: 'Writer',
      description: 'Expert writing assistant.',
      emoji: '✍️',
      category: 'writing',
      capabilities: ['Draft articles', 'Edit content', 'Improve clarity'],
      principles: ['Be concise', 'Use active voice'],
    };

    const content = generateSkillMd(options);

    expect(content).toContain('name: writer');
    expect(content).toContain('id: agent_skill_writer');
    expect(content).toContain('description: Expert writing assistant.');
    expect(content).toContain('emoji: "✍️"');
    expect(content).toContain('category: writing');
    expect(content).toContain('Draft articles');
    expect(content).toContain('Be concise');
  });

  it('should use custom ID if provided', () => {
    const options: CreateSkillOptions = {
      name: 'Test',
      id: 'custom_skill_id',
      description: 'Test skill.',
    };

    const content = generateSkillMd(options);

    expect(content).toContain('id: custom_skill_id');
  });

  it('should include default content for missing options', () => {
    const options: CreateSkillOptions = {
      name: 'Minimal',
      description: 'Minimal skill.',
    };

    const content = generateSkillMd(options);

    expect(content).toContain('## Capabilities');
    expect(content).toContain('## Response Format');
    expect(content).toContain('## Guiding Principles');
  });
});

describe('formatSkillAsToolDefinition', () => {
  it('should format skill for OpenClaw pattern', () => {
    const skill: SkillDefinition = {
      frontmatter: {
        name: 'brainstorm',
        id: 'agent_skill_brainstorm',
        description: 'Creative ideation specialist.',
      },
      content: '',
      sections: { other: {} },
      path: '/path/to/skill',
    };

    const toolDef = formatSkillAsToolDefinition(skill);

    expect(toolDef.name).toBe('brainstorm');
    expect(toolDef.description).toBe('Creative ideation specialist.');
    expect(toolDef.parameters).toHaveProperty('properties');
    expect(toolDef.parameters).toHaveProperty('required');
  });
});

describe('formatSkillList', () => {
  it('should format skill list', () => {
    const skills: SkillDefinition[] = [
      {
        frontmatter: {
          name: 'brainstorm',
          id: 'agent_skill_brainstorm',
          description: 'Ideation.',
          metadata: { emoji: '💡', category: 'thinking' },
        },
        content: '',
        sections: { other: {} },
        path: '/path',
      },
    ];

    const formatted = formatSkillList(skills);

    expect(formatted).toContain('# Available Skills');
    expect(formatted).toContain('💡 brainstorm');
    expect(formatted).toContain('thinking');
  });

  it('should handle empty list', () => {
    expect(formatSkillList([])).toBe('No skills found.');
  });
});

describe('SKILL_CATEGORIES', () => {
  it('should contain expected categories', () => {
    expect(SKILL_CATEGORIES).toContain('thinking');
    expect(SKILL_CATEGORIES).toContain('writing');
    expect(SKILL_CATEGORIES).toContain('analysis');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-skill-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('parseSkillDefinition', () => {
    it('should parse SKILL.md file', async () => {
      const skillPath = join(testDir, 'test-skill');
      await mkdir(skillPath, { recursive: true });
      
      const skillMd = `---
name: test
id: agent_skill_test
description: Test skill.
---

# Test Skill

## Capabilities

- Test capability
`;
      await writeFile(join(skillPath, 'SKILL.md'), skillMd);

      const skill = await parseSkillDefinition(skillPath);

      expect(skill).not.toBeNull();
      expect(skill?.frontmatter.name).toBe('test');
      expect(skill?.sections.capabilities).toContain('Test capability');
    });

    it('should return null for missing file', async () => {
      const skill = await parseSkillDefinition(join(testDir, 'nonexistent'));
      expect(skill).toBeNull();
    });
  });

  describe('createSkillFromTemplate', () => {
    it('should create skill agent directory', async () => {
      const options: CreateSkillOptions = {
        name: 'Writer',
        description: 'Writing assistant.',
        emoji: '✍️',
        category: 'writing',
      };

      const result = await createSkillFromTemplate(testDir, options);

      expect(existsSync(result.path)).toBe(true);
      expect(existsSync(join(result.path, 'SKILL.md'))).toBe(true);
      expect(result.id).toBe('agent_skill_writer');
    });

    it('should write correct content', async () => {
      const options: CreateSkillOptions = {
        name: 'Analyzer',
        description: 'Analysis specialist.',
      };

      const result = await createSkillFromTemplate(testDir, options);
      const content = await readFile(join(result.path, 'SKILL.md'), 'utf-8');

      expect(content).toContain('name: analyzer');
      expect(content).toContain('description: Analysis specialist.');
    });
  });

  describe('discoverSkills', () => {
    it('should discover skills in directory', async () => {
      // Create two skills
      const skill1 = join(testDir, 'skill1');
      const skill2 = join(testDir, 'skill2');
      await mkdir(skill1, { recursive: true });
      await mkdir(skill2, { recursive: true });

      await writeFile(join(skill1, 'SKILL.md'), `---
name: skill1
id: agent_skill_1
description: First skill.
---
# Skill 1`);

      await writeFile(join(skill2, 'SKILL.md'), `---
name: skill2
id: agent_skill_2
description: Second skill.
---
# Skill 2`);

      const skills = await discoverSkills(testDir);

      expect(skills.length).toBe(2);
    });

    it('should return empty array for nonexistent directory', async () => {
      const skills = await discoverSkills(join(testDir, 'nonexistent'));
      expect(skills).toEqual([]);
    });
  });
});
