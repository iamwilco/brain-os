/**
 * Tests for Subagent Spawning
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  registerSkill,
  unregisterSkill,
  getSkill,
  listSkills,
  clearSkillRegistry,
  buildSkillContext,
  spawnSkillAgent,
  setSkillExecutor,
  resetSkillExecutor,
  createSpawnRequest,
  createSpawnResponse,
  formatSpawnResult,
  setAllowlistConfig,
  getAllowlistConfig,
  resetAllowlistConfig,
  addAllowlistEntry,
  removeAllowlistEntry,
  canSpawnSkill,
  matchesAgentPattern,
  type SkillEntry,
  type SpawnResult,
  type AllowlistEntry,
} from './subagent.js';
import { Operations } from './protocol.js';

describe('Subagent Spawning', () => {
  let testDir: string;
  let parentAgentPath: string;
  let skillAgentPath: string;

  beforeEach(async () => {
    clearSkillRegistry();
    resetSkillExecutor();
    resetAllowlistConfig();
    
    testDir = join(tmpdir(), `subagent-test-${Date.now()}`);
    parentAgentPath = join(testDir, 'parent');
    skillAgentPath = join(testDir, 'skills', 'skill-test');
    
    await mkdir(parentAgentPath, { recursive: true });
    await mkdir(skillAgentPath, { recursive: true });
    
    // Create parent agent AGENT.md
    await writeFile(join(parentAgentPath, 'AGENT.md'), `---
id: admin
name: Admin Agent
type: admin
scope: /
created: 2026-02-01
updated: 2026-02-01
---

# Instructions

You are the admin agent.
`);
    
    // Create skill agent AGENT.md
    await writeFile(join(skillAgentPath, 'AGENT.md'), `---
id: skill-test
name: Test Skill
type: skill
scope: /test
created: 2026-02-01
updated: 2026-02-01
---

# Instructions

You are a test skill agent.
`);
  });

  afterEach(async () => {
    clearSkillRegistry();
    resetSkillExecutor();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Skill Registry', () => {
    it('should register and retrieve skills', () => {
      const skill: SkillEntry = {
        id: 'skill-seo',
        name: 'SEO Analyzer',
        path: '/path/to/skill',
        description: 'Analyzes SEO',
        capabilities: ['seo', 'analysis'],
      };

      registerSkill(skill);
      
      const retrieved = getSkill('skill-seo');
      expect(retrieved).toEqual(skill);
    });

    it('should list all registered skills', () => {
      registerSkill({
        id: 'skill-1',
        name: 'Skill 1',
        path: '/path/1',
        description: 'First skill',
        capabilities: [],
      });
      
      registerSkill({
        id: 'skill-2',
        name: 'Skill 2',
        path: '/path/2',
        description: 'Second skill',
        capabilities: [],
      });

      const skills = listSkills();
      expect(skills).toHaveLength(2);
    });

    it('should unregister skills', () => {
      registerSkill({
        id: 'skill-temp',
        name: 'Temp',
        path: '/path',
        description: 'Temp skill',
        capabilities: [],
      });

      expect(getSkill('skill-temp')).toBeDefined();
      
      const result = unregisterSkill('skill-temp');
      expect(result).toBe(true);
      expect(getSkill('skill-temp')).toBeUndefined();
    });

    it('should return undefined for unknown skills', () => {
      expect(getSkill('unknown')).toBeUndefined();
    });
  });

  describe('buildSkillContext', () => {
    it('should build context with user input', async () => {
      const context = await buildSkillContext(parentAgentPath, 'Analyze this page');
      
      expect(context).toContain('## Task Context');
      expect(context).toContain('Analyze this page');
    });

    it('should include additional context when provided', async () => {
      const context = await buildSkillContext(parentAgentPath, 'Task', {
        additionalContext: 'Extra info here',
      });
      
      expect(context).toContain('Extra info here');
    });
  });

  describe('spawnSkillAgent', () => {
    it('should return error for unregistered skill', async () => {
      const result = await spawnSkillAgent(parentAgentPath, 'unknown-skill', 'context');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found in registry');
    });

    it('should spawn skill and return result', async () => {
      registerSkill({
        id: 'skill-test',
        name: 'Test Skill',
        path: skillAgentPath,
        description: 'Test',
        capabilities: [],
      });

      // Set custom executor for testing
      setSkillExecutor(async (_def, context, _config) => ({
        result: `Processed: ${context.slice(0, 50)}`,
        tokensUsed: 100,
      }));

      const result = await spawnSkillAgent(parentAgentPath, 'skill-test', 'Test context');
      
      expect(result.success).toBe(true);
      expect(result.result).toContain('Processed');
      expect(result.tokensUsed).toBe(100);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle executor errors', async () => {
      registerSkill({
        id: 'skill-error',
        name: 'Error Skill',
        path: skillAgentPath,
        description: 'Errors',
        capabilities: [],
      });

      setSkillExecutor(async () => {
        throw new Error('Execution failed');
      });

      const result = await spawnSkillAgent(parentAgentPath, 'skill-error', 'context');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });
  });

  describe('createSpawnRequest', () => {
    it('should create valid spawn request', () => {
      const request = createSpawnRequest('admin', 'skill-seo', 'Analyze this', { url: 'https://example.com' });
      
      expect(request.type).toBe('request');
      expect(request.operation).toBe(Operations.SPAWN_AGENT);
      expect(request.from).toBe('admin');
      expect(request.to).toBe('skill-seo');
      expect(request.payload.skillId).toBe('skill-seo');
      expect(request.payload.context).toBe('Analyze this');
    });
  });

  describe('createSpawnResponse', () => {
    it('should create success response', () => {
      const request = createSpawnRequest('admin', 'skill', 'context');
      const result: SpawnResult = {
        success: true,
        result: 'Done',
        tokensUsed: 50,
        duration: 100,
        skillId: 'skill',
      };

      const response = createSpawnResponse(request, 'skill', result);
      
      expect(response.success).toBe(true);
      expect(response.payload?.result).toBe('Done');
    });

    it('should create error response', () => {
      const request = createSpawnRequest('admin', 'skill', 'context');
      const result: SpawnResult = {
        success: false,
        error: 'Failed',
        skillId: 'skill',
      };

      const response = createSpawnResponse(request, 'skill', result);
      
      expect(response.success).toBe(false);
      expect(response.error).toBe('Failed');
    });
  });

  describe('formatSpawnResult', () => {
    it('should format success result', () => {
      const result: SpawnResult = {
        success: true,
        result: 'Analysis complete',
        tokensUsed: 200,
        duration: 500,
        skillId: 'skill-seo',
      };

      const formatted = formatSpawnResult(result);
      
      expect(formatted).toContain('Skill Result');
      expect(formatted).toContain('skill-seo');
      expect(formatted).toContain('Analysis complete');
      expect(formatted).toContain('Tokens: 200');
      expect(formatted).toContain('Duration: 500ms');
    });

    it('should format error result', () => {
      const result: SpawnResult = {
        success: false,
        error: 'Skill not found',
        skillId: 'unknown',
      };

      const formatted = formatSpawnResult(result);
      
      expect(formatted).toContain('Skill Error');
      expect(formatted).toContain('Skill not found');
    });
  });

  describe('Spawn Allowlist', () => {
    describe('matchesAgentPattern', () => {
      it('should match exact agent ID', () => {
        expect(matchesAgentPattern('admin', 'admin')).toBe(true);
        expect(matchesAgentPattern('admin', 'wilco')).toBe(false);
      });

      it('should match wildcard patterns', () => {
        expect(matchesAgentPattern('project-brain', 'project-*')).toBe(true);
        expect(matchesAgentPattern('project-seo', 'project-*')).toBe(true);
        expect(matchesAgentPattern('admin', 'project-*')).toBe(false);
      });
    });

    describe('canSpawnSkill', () => {
      it('should allow admin to spawn any skill by default', () => {
        const result = canSpawnSkill('admin', 'admin', 'skill-seo');
        expect(result.allowed).toBe(true);
      });

      it('should allow wilco to spawn any skill by default', () => {
        const result = canSpawnSkill('wilco', 'admin', 'skill-writer');
        expect(result.allowed).toBe(true);
      });

      it('should deny project agents by default', () => {
        const result = canSpawnSkill('project-brain', 'project', 'skill-seo');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('not in spawn allowlist');
      });

      it('should allow all when allowlist disabled', () => {
        setAllowlistConfig({ enabled: false });
        const result = canSpawnSkill('project-brain', 'project', 'skill-seo');
        expect(result.allowed).toBe(true);
      });

      it('should respect specific skill allowlist', () => {
        addAllowlistEntry({
          agentPattern: 'project-brain',
          agentType: 'project',
          allowedSkills: ['skill-seo'],
        });

        expect(canSpawnSkill('project-brain', 'project', 'skill-seo').allowed).toBe(true);
        expect(canSpawnSkill('project-brain', 'project', 'skill-writer').allowed).toBe(false);
      });
    });

    describe('allowlist configuration', () => {
      it('should get and set config', () => {
        const config = getAllowlistConfig();
        expect(config.enabled).toBe(true);
        expect(config.defaultAllow).toBe(false);

        setAllowlistConfig({ defaultAllow: true });
        expect(getAllowlistConfig().defaultAllow).toBe(true);
      });

      it('should add and remove entries', () => {
        const entry: AllowlistEntry = {
          agentPattern: 'test-agent',
          agentType: 'project',
          allowedSkills: ['skill-test'],
        };

        addAllowlistEntry(entry);
        expect(canSpawnSkill('test-agent', 'project', 'skill-test').allowed).toBe(true);

        removeAllowlistEntry('test-agent');
        expect(canSpawnSkill('test-agent', 'project', 'skill-test').allowed).toBe(false);
      });

      it('should reset to defaults', () => {
        setAllowlistConfig({ enabled: false, defaultAllow: true });
        resetAllowlistConfig();
        
        const config = getAllowlistConfig();
        expect(config.enabled).toBe(true);
        expect(config.defaultAllow).toBe(false);
      });
    });

    describe('spawnSkillAgent with allowlist', () => {
      beforeEach(() => {
        registerSkill({
          id: 'skill-test',
          name: 'Test Skill',
          path: skillAgentPath,
          description: 'Test',
          capabilities: [],
        });

        setSkillExecutor(async () => ({
          result: 'Success',
          tokensUsed: 50,
        }));
      });

      it('should allow admin to spawn', async () => {
        const result = await spawnSkillAgent(
          parentAgentPath,
          'skill-test',
          'context',
          {},
          'admin',
          'admin'
        );
        expect(result.success).toBe(true);
      });

      it('should deny project agent by default', async () => {
        const result = await spawnSkillAgent(
          parentAgentPath,
          'skill-test',
          'context',
          {},
          'project-brain',
          'project'
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('not in spawn allowlist');
      });

      it('should allow project agent when added to allowlist', async () => {
        addAllowlistEntry({
          agentPattern: 'project-brain',
          agentType: 'project',
          allowedSkills: ['skill-test'],
        });

        const result = await spawnSkillAgent(
          parentAgentPath,
          'skill-test',
          'context',
          {},
          'project-brain',
          'project'
        );
        expect(result.success).toBe(true);
      });
    });
  });
});
