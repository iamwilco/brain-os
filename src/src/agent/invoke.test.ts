/**
 * Admin Agent skill invocation tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getAvailableSkills,
  getSkillToolDefinitions,
  invokeSkill,
  invokeMultipleSkills,
  formatInvokeResult,
  formatAvailableSkills,
  type InvokeResult,
  type AvailableSkill,
} from './invoke.js';
import { receiveMessages } from './messaging.js';

describe('formatInvokeResult', () => {
  it('should format successful result', () => {
    const result: InvokeResult = {
      success: true,
      skillId: 'agent_skill_writer',
      skillName: 'writer',
      task: 'Write an article',
      result: { status: 'sent' },
      duration: 50,
    };

    const formatted = formatInvokeResult(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('writer');
    expect(formatted).toContain('Write an article');
  });

  it('should format failed result', () => {
    const result: InvokeResult = {
      success: false,
      skillId: 'agent_skill_unknown',
      skillName: 'unknown',
      task: 'Test',
      error: 'Skill not found',
      duration: 10,
    };

    const formatted = formatInvokeResult(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('Skill not found');
  });
});

describe('formatAvailableSkills', () => {
  it('should format skills list', () => {
    const skills: AvailableSkill[] = [
      { id: 'agent_skill_writer', name: 'writer', description: 'Write content', emoji: '✍️', category: 'content' },
      { id: 'agent_skill_seo', name: 'seo', description: 'SEO analysis', emoji: '🔍', category: 'content' },
    ];

    const formatted = formatAvailableSkills(skills);

    expect(formatted).toContain('Available Skills');
    expect(formatted).toContain('writer');
    expect(formatted).toContain('seo');
    expect(formatted).toContain('Content');
  });

  it('should handle empty list', () => {
    expect(formatAvailableSkills([])).toBe('No skills available.');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-invoke-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create vault structure
    await mkdir(join(testDir, '40_Brain', 'agents', 'admin', 'sessions'), { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'skills', 'writer'), { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'skills', 'seo'), { recursive: true });
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

  async function createSkill(path: string, name: string, id: string) {
    const skillMd = `---
name: ${name}
id: ${id}
description: ${name} skill agent.
metadata:
  emoji: "🔧"
  category: general
---

# ${name} Skill
`;
    await writeFile(join(path, 'SKILL.md'), skillMd);
    await createAgent(path, name, 'skill', id);
  }

  describe('getAvailableSkills', () => {
    it('should discover available skills', async () => {
      await createSkill(
        join(testDir, '40_Brain', 'agents', 'skills', 'writer'),
        'writer',
        'agent_skill_writer'
      );
      await createSkill(
        join(testDir, '40_Brain', 'agents', 'skills', 'seo'),
        'seo',
        'agent_skill_seo'
      );

      const skills = await getAvailableSkills(testDir);

      expect(skills.length).toBe(2);
      expect(skills.map(s => s.name)).toContain('writer');
      expect(skills.map(s => s.name)).toContain('seo');
    });
  });

  describe('getSkillToolDefinitions', () => {
    it('should return tool definitions for LLM', async () => {
      await createSkill(
        join(testDir, '40_Brain', 'agents', 'skills', 'writer'),
        'writer',
        'agent_skill_writer'
      );

      const tools = await getSkillToolDefinitions(testDir);

      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('writer');
      expect(tools[0].parameters).toHaveProperty('properties');
    });
  });

  describe('invokeSkill', () => {
    it('should invoke skill from admin', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin'
      );
      await createSkill(
        join(testDir, '40_Brain', 'agents', 'skills', 'writer'),
        'writer',
        'agent_skill_writer'
      );

      const result = await invokeSkill(
        testDir,
        'writer',
        'Write an article about testing'
      );

      expect(result.success).toBe(true);
      expect(result.skillId).toBe('agent_skill_writer');
      expect(result.skillName).toBe('writer');
      
      // Verify message received by skill
      const skillPath = join(testDir, '40_Brain', 'agents', 'skills', 'writer');
      const messages = await receiveMessages(skillPath, 'agent_skill_writer');
      expect(messages.length).toBe(1);
    });

    it('should fail if admin not found', async () => {
      await createSkill(
        join(testDir, '40_Brain', 'agents', 'skills', 'writer'),
        'writer',
        'agent_skill_writer'
      );

      const result = await invokeSkill(testDir, 'writer', 'Test task');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Admin');
    });

    it('should fail if skill not found', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin'
      );

      const result = await invokeSkill(testDir, 'unknown', 'Test task');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('invokeMultipleSkills', () => {
    it('should invoke multiple skills in parallel', async () => {
      await createAgent(
        join(testDir, '40_Brain', 'agents', 'admin'),
        'Admin',
        'admin',
        'agent_admin'
      );
      await createSkill(
        join(testDir, '40_Brain', 'agents', 'skills', 'writer'),
        'writer',
        'agent_skill_writer'
      );
      await createSkill(
        join(testDir, '40_Brain', 'agents', 'skills', 'seo'),
        'seo',
        'agent_skill_seo'
      );

      const results = await invokeMultipleSkills(testDir, [
        { skillName: 'writer', task: 'Write content' },
        { skillName: 'seo', task: 'Analyze keywords' },
      ]);

      expect(results.size).toBe(2);
      expect(results.get('writer')?.success).toBe(true);
      expect(results.get('seo')?.success).toBe(true);
    });
  });
});
