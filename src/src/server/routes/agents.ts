/**
 * Agents API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError, z } from 'zod';
import { join } from 'path';
import { readdir, readFile, stat, writeFile } from 'fs/promises';
import {
  AgentSpawnSchema,
  IdParamSchema,
} from '../../api/schemas.js';

const FileContentSchema = z.object({
  content: z.string(),
});
import type { AgentAPI } from '../../api/types.js';

/**
 * Handle Zod validation errors
 */
function handleZodError(error: ZodError, reply: FastifyReply) {
  return reply.status(400).send({
    error: 'Validation error',
    message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
    details: error.errors,
  });
}

/**
 * Parse agent metadata from AGENT.md frontmatter
 */
async function parseAgentMd(agentPath: string): Promise<Partial<AgentAPI>> {
  try {
    const content = await readFile(join(agentPath, 'AGENT.md'), 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      return {};
    }

    const frontmatter = frontmatterMatch[1];
    const result: Partial<AgentAPI> = {};

    // Parse YAML-like frontmatter
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      if (!key) continue;
      const value = valueParts.join(':').trim();
      
      switch (key.trim()) {
        case 'name':
          result.name = value;
          break;
        case 'id':
          result.id = value;
          break;
        case 'type':
          result.type = value as 'admin' | 'project' | 'skill';
          break;
        case 'scope':
          result.scope = value.split(',').map(s => s.trim());
          break;
      }
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Check if MEMORY.md exists
 */
async function hasMemory(agentPath: string): Promise<string | null> {
  try {
    const memoryPath = join(agentPath, 'MEMORY.md');
    await stat(memoryPath);
    return memoryPath;
  } catch {
    return null;
  }
}

/**
 * Scan for agents in vault
 */
async function findAgents(vaultPath: string): Promise<AgentAPI[]> {
  const agents: AgentAPI[] = [];

  // Admin agent
  const adminPath = join(vaultPath, '40_Brain', 'agents', 'admin');
  try {
    const adminData = await parseAgentMd(adminPath);
    agents.push({
      id: adminData.id || 'agent_admin',
      name: adminData.name || 'Admin',
      type: 'admin',
      scope: adminData.scope || ['**/*'],
      status: 'idle',
      lastRun: null,
      lastError: null,
      configPath: join(adminPath, 'AGENT.md'),
      memoryPath: await hasMemory(adminPath),
    });
  } catch {
    // Admin not found
  }

  // Skill agents
  const skillsPath = join(vaultPath, '40_Brain', 'agents', 'skills');
  try {
    const skillDirs = await readdir(skillsPath, { withFileTypes: true });
    for (const dir of skillDirs) {
      if (!dir.isDirectory()) continue;
      const skillPath = join(skillsPath, dir.name);
      const skillData = await parseAgentMd(skillPath);
      
      agents.push({
        id: skillData.id || `agent_skill_${dir.name}`,
        name: skillData.name || dir.name,
        type: 'skill',
        scope: skillData.scope || ['**/*'],
        status: 'idle',
        lastRun: null,
        lastError: null,
        configPath: join(skillPath, 'AGENT.md'),
        memoryPath: await hasMemory(skillPath),
      });
    }
  } catch {
    // Skills folder not found
  }

  // Project agents
  const projectsPath = join(vaultPath, '30_Projects');
  try {
    const projectDirs = await readdir(projectsPath, { withFileTypes: true });
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const agentPath = join(projectsPath, dir.name, 'agent');
      try {
        await stat(agentPath);
        const agentData = await parseAgentMd(agentPath);
        
        agents.push({
          id: agentData.id || `agent_project_${dir.name.toLowerCase().replace(/\s+/g, '_')}`,
          name: agentData.name || `${dir.name} Agent`,
          type: 'project',
          scope: agentData.scope || [`path:30_Projects/${dir.name}/**`],
          status: 'idle',
          lastRun: null,
          lastError: null,
          configPath: join(agentPath, 'AGENT.md'),
          memoryPath: await hasMemory(agentPath),
        });
      } catch {
        // No agent folder
      }
    }
  } catch {
    // Projects folder not found
  }

  return agents;
}

/**
 * Register agents routes
 */
export async function agentsRoutes(server: FastifyInstance): Promise<void> {
  const vaultPath = () => server.state.vaultPath;

  // List all agents
  server.get('/agents', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const agents = await findAgents(vaultPath());
    return { data: agents, total: agents.length };
  });

  // Get single agent
  server.get('/agents/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = IdParamSchema.parse(request.params);
    const agents = await findAgents(vaultPath());
    const agent = agents.find(a => a.id === id);

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    return agent;
  });

  // Spawn new agent (placeholder - actual spawn uses existing module)
  server.post('/agents/spawn', async (request: FastifyRequest, reply: FastifyReply) => {
    let data;
    try {
      data = AgentSpawnSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    // For now, return a placeholder response
    // Full implementation would use the spawn module
    return reply.status(201).send({
      id: `agent_${data.type}_${data.name.toLowerCase().replace(/\s+/g, '_')}`,
      name: data.name,
      type: data.type,
      scope: data.scope,
      status: 'idle',
      lastRun: null,
      lastError: null,
      configPath: '', // Would be set by spawn module
      memoryPath: null,
    });
  });

  // Restart agent (placeholder)
  server.put('/agents/:id/restart', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = IdParamSchema.parse(request.params);
    const agents = await findAgents(vaultPath());
    const agent = agents.find(a => a.id === id);

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    // Placeholder - actual restart logic would go here
    return { ...agent, status: 'idle', lastError: null };
  });

  // Get agent config (AGENT.md content)
  server.get('/agents/:id/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = IdParamSchema.parse(request.params);
    const agents = await findAgents(vaultPath());
    const agent = agents.find(a => a.id === id);

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    try {
      const content = await readFile(agent.configPath, 'utf-8');
      return { content, path: agent.configPath };
    } catch {
      return reply.status(404).send({ error: 'Config file not found' });
    }
  });

  // Save agent config (AGENT.md content)
  server.put('/agents/:id/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = IdParamSchema.parse(request.params);
    const agents = await findAgents(vaultPath());
    const agent = agents.find(a => a.id === id);

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    let data;
    try {
      data = FileContentSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    try {
      await writeFile(agent.configPath, data.content, 'utf-8');
      return { success: true, path: agent.configPath };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to save config', details: String(err) });
    }
  });

  // Get agent memory (MEMORY.md content)
  server.get('/agents/:id/memory', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = IdParamSchema.parse(request.params);
    const agents = await findAgents(vaultPath());
    const agent = agents.find(a => a.id === id);

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    if (!agent.memoryPath) {
      return { content: '', path: null };
    }

    try {
      const content = await readFile(agent.memoryPath, 'utf-8');
      return { content, path: agent.memoryPath };
    } catch {
      return { content: '', path: agent.memoryPath };
    }
  });

  // Save agent memory (MEMORY.md content)
  server.put('/agents/:id/memory', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = IdParamSchema.parse(request.params);
    const agents = await findAgents(vaultPath());
    const agent = agents.find(a => a.id === id);

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    let data;
    try {
      data = FileContentSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    // Determine memory path - create if doesn't exist
    const memoryPath = agent.memoryPath || join(agent.configPath.replace('AGENT.md', ''), 'MEMORY.md');

    try {
      await writeFile(memoryPath, data.content, 'utf-8');
      return { success: true, path: memoryPath };
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to save memory', details: String(err) });
    }
  });

  // Run agent (placeholder - creates a run entry)
  server.post('/agents/:id/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = IdParamSchema.parse(request.params);
    const agents = await findAgents(vaultPath());
    const agent = agents.find(a => a.id === id);

    if (!agent) {
      return reply.status(404).send({ error: 'Agent not found' });
    }

    // For now, return a placeholder run response
    // Full implementation would actually execute the agent
    const runId = `run_${Date.now()}`;
    return reply.status(201).send({
      id: runId,
      agentId: agent.id,
      status: 'queued',
      action: 'agent_run',
      startedAt: new Date().toISOString(),
      message: `Agent ${agent.name} run queued`,
    });
  });
}
