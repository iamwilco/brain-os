/**
 * Agent spawn capability tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadRegistry,
  saveRegistry,
  registerAgent,
  unregisterAgent,
  getAgentSpawnPath,
  spawnAgent,
  spawnProjectAgent,
  spawnSkillAgent,
  listRegisteredAgents,
  formatSpawnResult,
  formatRegistry,
  getRegistryPath,
  type SpawnConfig,
  type SpawnResult,
  type AgentRegistry,
} from './spawn.js';

describe('getAgentSpawnPath', () => {
  it('should return admin path', () => {
    const config: SpawnConfig = { name: 'Admin', type: 'admin', scope: '**/*' };
    const path = getAgentSpawnPath('/vault', config);
    expect(path).toBe('/vault/40_Brain/agents/admin');
  });

  it('should return skill path', () => {
    const config: SpawnConfig = { name: 'Writer', type: 'skill', scope: '**/*' };
    const path = getAgentSpawnPath('/vault', config);
    expect(path).toBe('/vault/40_Brain/agents/skills/writer');
  });

  it('should return project path with projectPath', () => {
    const config: SpawnConfig = { 
      name: 'Brain', 
      type: 'project', 
      scope: '**/*',
      projectPath: '/vault/30_Projects/Brain'
    };
    const path = getAgentSpawnPath('/vault', config);
    expect(path).toBe('/vault/30_Projects/Brain/agent');
  });

  it('should return default project path', () => {
    const config: SpawnConfig = { name: 'Brain', type: 'project', scope: '**/*' };
    const path = getAgentSpawnPath('/vault', config);
    expect(path).toBe('/vault/30_Projects/brain/agent');
  });
});

describe('formatSpawnResult', () => {
  it('should format successful result', () => {
    const result: SpawnResult = {
      success: true,
      agentId: 'agent_project_test',
      agentPath: '/path/to/agent',
      duration: 50,
    };

    const formatted = formatSpawnResult(result);

    expect(formatted).toContain('✓');
    expect(formatted).toContain('agent_project_test');
  });

  it('should format failed result', () => {
    const result: SpawnResult = {
      success: false,
      agentId: 'agent_project_test',
      agentPath: '',
      error: 'Already exists',
      duration: 10,
    };

    const formatted = formatSpawnResult(result);

    expect(formatted).toContain('✗');
    expect(formatted).toContain('Already exists');
  });
});

describe('formatRegistry', () => {
  it('should format registry', () => {
    const registry: AgentRegistry = {
      version: '1.0',
      agents: [
        { id: 'agent_admin', name: 'Admin', type: 'admin', path: '/path', createdAt: '2026-02-01', createdBy: 'system', status: 'active' },
      ],
      lastUpdated: '2026-02-01',
    };

    const formatted = formatRegistry(registry);

    expect(formatted).toContain('Agent Registry');
    expect(formatted).toContain('Admin');
    expect(formatted).toContain('Active Agents (1)');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-spawn-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create vault structure
    await mkdir(join(testDir, '40_Brain', '.agent'), { recursive: true });
    await mkdir(join(testDir, '40_Brain', 'agents', 'skills'), { recursive: true });
    await mkdir(join(testDir, '30_Projects'), { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('loadRegistry / saveRegistry', () => {
    it('should create empty registry if none exists', async () => {
      const registry = await loadRegistry(testDir);
      
      expect(registry.version).toBe('1.0');
      expect(registry.agents).toEqual([]);
    });

    it('should save and load registry', async () => {
      const registry: AgentRegistry = {
        version: '1.0',
        agents: [{
          id: 'test',
          name: 'Test',
          type: 'project',
          path: '/test',
          createdAt: '2026-02-01',
          createdBy: 'admin',
          status: 'active',
        }],
        lastUpdated: '',
      };
      
      await saveRegistry(testDir, registry);
      const loaded = await loadRegistry(testDir);
      
      expect(loaded.agents.length).toBe(1);
      expect(loaded.agents[0].id).toBe('test');
    });
  });

  describe('registerAgent / unregisterAgent', () => {
    it('should register new agent', async () => {
      await registerAgent(testDir, {
        id: 'agent_project_test',
        name: 'Test',
        type: 'project',
        path: '/test',
        createdBy: 'admin',
      });

      const registry = await loadRegistry(testDir);
      expect(registry.agents.length).toBe(1);
      expect(registry.agents[0].status).toBe('active');
    });

    it('should unregister agent', async () => {
      await registerAgent(testDir, {
        id: 'agent_project_test',
        name: 'Test',
        type: 'project',
        path: '/test',
        createdBy: 'admin',
      });

      const result = await unregisterAgent(testDir, 'agent_project_test');
      
      expect(result).toBe(true);
      
      const registry = await loadRegistry(testDir);
      expect(registry.agents[0].status).toBe('archived');
    });
  });

  describe('spawnAgent', () => {
    it('should spawn project agent', async () => {
      const result = await spawnAgent(testDir, {
        name: 'TestProject',
        type: 'project',
        scope: '**/*',
        description: 'Test project agent',
      });

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('agent_project_testproject');
      expect(existsSync(join(result.agentPath, 'AGENT.md'))).toBe(true);
      expect(existsSync(join(result.agentPath, 'MEMORY.md'))).toBe(true);
      expect(existsSync(join(result.agentPath, 'sessions'))).toBe(true);
    });

    it('should spawn skill agent', async () => {
      const result = await spawnAgent(testDir, {
        name: 'TestSkill',
        type: 'skill',
        scope: '**/*',
      });

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('agent_skill_testskill');
    });

    it('should fail if agent exists', async () => {
      await spawnAgent(testDir, {
        name: 'Duplicate',
        type: 'skill',
        scope: '**/*',
      });

      const result = await spawnAgent(testDir, {
        name: 'Duplicate',
        type: 'skill',
        scope: '**/*',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should register agent in registry', async () => {
      await spawnAgent(testDir, {
        name: 'Registered',
        type: 'project',
        scope: '**/*',
      });

      const agents = await listRegisteredAgents(testDir);
      expect(agents.find(a => a.id === 'agent_project_registered')).toBeDefined();
    });
  });

  describe('spawnProjectAgent', () => {
    it('should spawn project agent with helper', async () => {
      const projectPath = join(testDir, '30_Projects', 'MyProject');
      await mkdir(projectPath, { recursive: true });

      const result = await spawnProjectAgent(
        testDir,
        'MyProject',
        projectPath
      );

      expect(result.success).toBe(true);
      expect(result.agentPath).toBe(join(projectPath, 'agent'));
    });
  });

  describe('spawnSkillAgent', () => {
    it('should spawn skill agent with helper', async () => {
      const result = await spawnSkillAgent(
        testDir,
        'Analyzer',
        'Analysis skill agent'
      );

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('agent_skill_analyzer');
    });
  });

  describe('listRegisteredAgents', () => {
    it('should list agents by type', async () => {
      await spawnAgent(testDir, { name: 'P1', type: 'project', scope: '**/*' });
      await spawnAgent(testDir, { name: 'S1', type: 'skill', scope: '**/*' });

      const projects = await listRegisteredAgents(testDir, { type: 'project' });
      const skills = await listRegisteredAgents(testDir, { type: 'skill' });

      expect(projects.length).toBe(1);
      expect(skills.length).toBe(1);
    });
  });
});
