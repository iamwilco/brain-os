/**
 * Agent templates tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateAgentId,
  generateProjectAgentMd,
  generateSkillAgentMd,
  generateMemoryMd,
  generateAgentReadme,
  createAgentDirectory,
  createProjectAgent,
  createSkillAgent,
  agentExists,
  type CreateAgentOptions,
} from './templates.js';

describe('generateAgentId', () => {
  it('should generate valid agent ID', () => {
    const id = generateAgentId('My Project', 'project');
    expect(id).toBe('agent_project_my_project');
  });

  it('should handle special characters', () => {
    const id = generateAgentId('Test-Agent!@#', 'skill');
    expect(id).toBe('agent_skill_test_agent');
  });

  it('should handle spaces', () => {
    const id = generateAgentId('  Multiple   Spaces  ', 'admin');
    expect(id).toBe('agent_admin_multiple_spaces');
  });
});

describe('generateProjectAgentMd', () => {
  it('should generate valid AGENT.md content', () => {
    const options: CreateAgentOptions = {
      name: 'Test Project',
      type: 'project',
      scope: '30_Projects/Test/**',
    };

    const content = generateProjectAgentMd(options);

    expect(content).toContain('name: Test Project');
    expect(content).toContain('id: agent_project_test_project');
    expect(content).toContain('type: project');
    expect(content).toContain('scope: "30_Projects/Test/**"');
    expect(content).toContain('# Test Project');
  });

  it('should use custom ID if provided', () => {
    const options: CreateAgentOptions = {
      name: 'Test',
      id: 'custom_agent_id',
      type: 'project',
      scope: '**/*',
    };

    const content = generateProjectAgentMd(options);

    expect(content).toContain('id: custom_agent_id');
  });

  it('should include description if provided', () => {
    const options: CreateAgentOptions = {
      name: 'Test',
      type: 'project',
      scope: '**/*',
      description: 'Custom description here.',
    };

    const content = generateProjectAgentMd(options);

    expect(content).toContain('Custom description here.');
  });
});

describe('generateSkillAgentMd', () => {
  it('should generate valid skill agent content', () => {
    const options: CreateAgentOptions = {
      name: 'Writer',
      type: 'skill',
      scope: '**/*',
    };

    const content = generateSkillAgentMd(options);

    expect(content).toContain('name: Writer');
    expect(content).toContain('type: skill');
    expect(content).toContain('Skill Specialist');
    expect(content).toContain('stateless');
  });
});

describe('generateMemoryMd', () => {
  it('should generate valid MEMORY.md content', () => {
    const content = generateMemoryMd('agent_test', 'Test Agent');

    expect(content).toContain('type: agent-memory');
    expect(content).toContain('agent: agent_test');
    expect(content).toContain('# Working Memory');
    expect(content).toContain('## Current State');
  });
});

describe('generateAgentReadme', () => {
  it('should generate valid README.md', () => {
    const options: CreateAgentOptions = {
      name: 'Test Agent',
      type: 'project',
      scope: '30_Projects/Test/**',
    };

    const content = generateAgentReadme(options);

    expect(content).toContain('# Test Agent Agent');
    expect(content).toContain('**Type:** project');
    expect(content).toContain('AGENT.md');
    expect(content).toContain('MEMORY.md');
    expect(content).toContain('brain agent chat');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-templates-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('createAgentDirectory', () => {
    it('should create agent directory structure', async () => {
      const options: CreateAgentOptions = {
        name: 'Test Project',
        type: 'project',
        scope: '30_Projects/Test/**',
      };

      const result = await createAgentDirectory(testDir, options);

      expect(existsSync(result.path)).toBe(true);
      expect(existsSync(join(result.path, 'AGENT.md'))).toBe(true);
      expect(existsSync(join(result.path, 'MEMORY.md'))).toBe(true);
      expect(existsSync(join(result.path, 'README.md'))).toBe(true);
      expect(existsSync(join(result.path, 'sessions', 'sessions.json'))).toBe(true);
    });

    it('should return created files list', async () => {
      const options: CreateAgentOptions = {
        name: 'Test',
        type: 'project',
        scope: '**/*',
      };

      const result = await createAgentDirectory(testDir, options);

      expect(result.files).toContain('AGENT.md');
      expect(result.files).toContain('MEMORY.md');
      expect(result.files).toContain('README.md');
    });

    it('should write correct content to AGENT.md', async () => {
      const options: CreateAgentOptions = {
        name: 'Content Test',
        type: 'project',
        scope: '30_Projects/Test/**',
      };

      const result = await createAgentDirectory(testDir, options);
      const content = await readFile(join(result.path, 'AGENT.md'), 'utf-8');

      expect(content).toContain('name: Content Test');
      expect(content).toContain('type: project');
    });
  });

  describe('createProjectAgent', () => {
    it('should create project agent', async () => {
      const projectPath = join(testDir, '30_Projects', 'MyProject');
      await mkdir(projectPath, { recursive: true });

      const result = await createProjectAgent(projectPath);

      expect(result.id).toContain('agent_project');
      expect(existsSync(join(projectPath, 'agent', 'AGENT.md'))).toBe(true);
    });

    it('should use project folder name for agent name', async () => {
      const projectPath = join(testDir, '30_Projects', 'AwesomeProject');
      await mkdir(projectPath, { recursive: true });

      const result = await createProjectAgent(projectPath);
      const content = await readFile(join(result.path, 'AGENT.md'), 'utf-8');

      expect(content).toContain('name: AwesomeProject Agent');
    });

    it('should accept custom options', async () => {
      const projectPath = join(testDir, 'CustomProject');
      await mkdir(projectPath, { recursive: true });

      const result = await createProjectAgent(projectPath, {
        name: 'Custom Name',
        description: 'Custom description',
      });
      const content = await readFile(join(result.path, 'AGENT.md'), 'utf-8');

      expect(content).toContain('name: Custom Name');
      expect(content).toContain('Custom description');
    });
  });

  describe('createSkillAgent', () => {
    it('should create skill agent', async () => {
      const skillsPath = join(testDir, 'agents', 'skills');
      await mkdir(skillsPath, { recursive: true });

      const result = await createSkillAgent(skillsPath, 'Writer');

      expect(result.id).toContain('agent_skill_writer');
      expect(existsSync(join(skillsPath, 'writer', 'agent', 'AGENT.md'))).toBe(true);
    });
  });

  describe('agentExists', () => {
    it('should return true if agent exists', async () => {
      const options: CreateAgentOptions = {
        name: 'Test',
        type: 'project',
        scope: '**/*',
      };
      await createAgentDirectory(testDir, options);

      expect(agentExists(testDir)).toBe(true);
    });

    it('should return false if agent does not exist', () => {
      expect(agentExists(testDir)).toBe(false);
    });
  });
});
