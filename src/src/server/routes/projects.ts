/**
 * Projects API routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { mkdir, writeFile, access, readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import type { MultipartFile } from '@fastify/multipart';
import { ZodError } from 'zod';
import { initChatContext, sendMessage, buildSystemPrompt, type ChatContext } from '../../agent/chat.js';
import { applyMemoryUpdates, type MemoryUpdate } from '../../agent/memory.js';
import { listSessions, readTranscript, type SessionMetadata, type TranscriptMessage } from '../../agent/session.js';
import { runAgentLoop } from '../../agent/loop/index.js';
import { getConfig, hasProvider } from '../../config/index.js';
import { createClaudeProvider } from '../../llm/claude.js';
import type { ChatMessage } from '../../llm/provider.js';
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ProjectSourcesUpdateSchema,
  ProjectChatSchema,
  IdParamSchema,
  ListParamsSchema,
} from '../../api/schemas.js';
import type { ProjectAPI, PaginatedResponse } from '../../api/types.js';
import type { Project } from '../../db/schema.js';

/**
 * Generate AGENT.md content for a project agent
 */
function generateAgentMd(projectName: string, agentId: string, rootPath: string): string {
  const now = new Date().toISOString().split('T')[0];
  return `---
id: ${agentId}
name: ${projectName} Agent
type: project
status: idle
scope:
  - "path:${rootPath}/**"
created: ${now}
updated: ${now}
---

# ${projectName} Agent

> Project-scoped agent for ${projectName}

## Purpose

This agent assists with all tasks related to the **${projectName}** project. It has access to all files within the project folder and maintains persistent memory across sessions.

## Capabilities

- Answer questions about project content
- Help with project-specific tasks
- Maintain project context and memory
- Search within project scope

## Scope

This agent can only access files within:
- \`${rootPath}/\`

## Memory

The agent maintains persistent memory in \`MEMORY.md\` to track:
- Key decisions and context
- Important findings
- Session summaries
`;
}

/**
 * Generate MEMORY.md content for a project agent
 */
function generateMemoryMd(projectName: string): string {
  const now = new Date().toISOString().split('T')[0];
  return `---
type: memory
project: ${projectName}
created: ${now}
updated: ${now}
---

# ${projectName} Agent Memory

## Context

*No context recorded yet.*

## Key Decisions

*No decisions recorded yet.*

## Session History

*No sessions yet.*
`;
}

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
 * Convert DB project to API project
 */
function toProjectAPI(project: Project): ProjectAPI {
  return {
    id: project.id,
    name: project.name,
    emoji: project.emoji,
    description: project.description,
    rootPath: project.root_path,
    status: project.status,
    linkedScopes: project.linked_scopes ? JSON.parse(project.linked_scopes) : [],
    agentIds: project.agent_ids ? JSON.parse(project.agent_ids) : [],
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

/**
 * Register projects routes
 */
export async function projectsRoutes(server: FastifyInstance): Promise<void> {
  const db = () => server.state.db;

  // List all projects
  server.get('/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = ListParamsSchema.parse(request.query);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }
    const { limit, offset, sortBy = 'created_at', sortOrder = 'desc' } = params;

    // Validate sortBy to prevent SQL injection
    const validSortColumns = ['created_at', 'updated_at', 'name', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';

    const countRow = dbInstance.prepare('SELECT COUNT(*) as total FROM projects').get() as { total: number };
    const total = countRow.total;

    const projects = dbInstance.prepare(`
      SELECT * FROM projects
      ORDER BY ${sortColumn} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Project[];

    const response: PaginatedResponse<ProjectAPI> = {
      data: projects.map(toProjectAPI),
      total,
      limit,
      offset,
      hasMore: offset + projects.length < total,
    };

    return response;
  });

  // Get single project
  server.get('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { id } = IdParamSchema.parse(request.params);

    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return toProjectAPI(project);
  });

  // Create project
  server.post('/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let data;
    try {
      data = ProjectCreateSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }
    const id = `proj_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const agentIds: string[] = [];
    const vaultPath = server.state.vaultPath;

    // Create project folder in vault
    try {
      const projectFolderPath = join(vaultPath, data.rootPath);
      await mkdir(projectFolderPath, { recursive: true });
      
      // Create project note
      const projectNotePath = join(projectFolderPath, `${data.name}.md`);
      const projectNoteContent = `---
type: project
name: ${data.name}
created: ${now.split('T')[0]}
status: active
---

# ${data.name}

${data.description || ''}

## Overview

*Add project overview here*

## Goals

- [ ] Define project goals

## Notes

`;
      await writeFile(projectNotePath, projectNoteContent, 'utf-8');
      
      server.log.info({ path: projectFolderPath }, 'Created project folder');
    } catch (err) {
      server.log.error({ err }, 'Failed to create project folder');
      return reply.status(500).send({ 
        error: 'Failed to create project folder',
        message: err instanceof Error ? err.message : 'Unknown error'
      });
    }

    // Create agent folder and files if requested
    if (data.createAgent) {
      const agentId = `agent_project_${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      const agentFolderPath = join(vaultPath, data.rootPath, 'agent');
      
      try {
        // Create agent folder
        await mkdir(agentFolderPath, { recursive: true });
        
        // Create AGENT.md
        const agentMdPath = join(agentFolderPath, 'AGENT.md');
        const agentMdContent = generateAgentMd(data.name, agentId, data.rootPath);
        await writeFile(agentMdPath, agentMdContent, 'utf-8');
        
        // Create MEMORY.md
        const memoryMdPath = join(agentFolderPath, 'MEMORY.md');
        const memoryMdContent = generateMemoryMd(data.name);
        await writeFile(memoryMdPath, memoryMdContent, 'utf-8');
        
        // Create sessions folder
        await mkdir(join(agentFolderPath, 'sessions'), { recursive: true });
        
        agentIds.push(agentId);
      } catch (err) {
        server.log.error({ err }, 'Failed to create agent folder');
        return reply.status(500).send({ 
          error: 'Failed to create project agent',
          message: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    dbInstance.prepare(`
      INSERT INTO projects (id, name, emoji, description, root_path, status, linked_scopes, agent_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.name,
      data.emoji || null,
      data.description || null,
      data.rootPath,
      'active',
      JSON.stringify(data.linkedScopes || []),
      JSON.stringify(agentIds),
      now,
      now
    );

    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;

    return reply.status(201).send(toProjectAPI(project));
  });

  // Update project
  server.put('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { id } = IdParamSchema.parse(request.params);
    const data = ProjectUpdateSchema.parse(request.body);

    // Check if project exists
    const existing = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!existing) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.emoji !== undefined) {
      updates.push('emoji = ?');
      values.push(data.emoji);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      values.push(data.status);
    }
    if (data.linkedScopes !== undefined) {
      updates.push('linked_scopes = ?');
      values.push(JSON.stringify(data.linkedScopes));
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);

      dbInstance.prepare(`
        UPDATE projects SET ${updates.join(', ')} WHERE id = ?
      `).run(...values);
    }

    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;

    return toProjectAPI(project);
  });

  // Delete project
  server.delete('/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    const { id } = IdParamSchema.parse(request.params);

    const existing = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!existing) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    dbInstance.prepare('DELETE FROM projects WHERE id = ?').run(id);

    return reply.status(204).send();
  });

  // Create agent for existing project
  server.post('/projects/:id/agent', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = IdParamSchema.parse(request.params);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { id } = params;

    // Get project
    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Check if project already has an agent
    const existingAgentIds = JSON.parse(project.agent_ids || '[]') as string[];
    if (existingAgentIds.length > 0) {
      return reply.status(400).send({ error: 'Project already has an agent configured' });
    }

    const vaultPath = server.state.vaultPath;
    const agentId = `agent_project_${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const agentFolderPath = join(vaultPath, project.root_path, 'agent');

    try {
      // Create agent folder
      await mkdir(agentFolderPath, { recursive: true });
      
      // Create AGENT.md
      const agentMdPath = join(agentFolderPath, 'AGENT.md');
      const agentMdContent = generateAgentMd(project.name, agentId, project.root_path);
      await writeFile(agentMdPath, agentMdContent, 'utf-8');
      
      // Create MEMORY.md
      const memoryMdPath = join(agentFolderPath, 'MEMORY.md');
      const memoryMdContent = generateMemoryMd(project.name);
      await writeFile(memoryMdPath, memoryMdContent, 'utf-8');
      
      // Create sessions folder
      await mkdir(join(agentFolderPath, 'sessions'), { recursive: true });

      // Update project with agent ID
      const now = new Date().toISOString();
      dbInstance.prepare(`
        UPDATE projects SET agent_ids = ?, updated_at = ? WHERE id = ?
      `).run(JSON.stringify([agentId]), now, id);

      const updatedProject = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;

      return reply.status(201).send(toProjectAPI(updatedProject));
    } catch (err) {
      server.log.error({ err }, 'Failed to create agent for project');
      return reply.status(500).send({ 
        error: 'Failed to create project agent',
        message: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  });

  // Update project sources/scopes
  server.put('/projects/:id/sources', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    let data;
    try {
      params = IdParamSchema.parse(request.params);
      data = ProjectSourcesUpdateSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { id } = params;

    // Check if project exists
    const existing = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!existing) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Update linked scopes
    const now = new Date().toISOString();
    dbInstance.prepare(`
      UPDATE projects SET linked_scopes = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(data.linkedScopes), now, id);

    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;

    return toProjectAPI(project);
  });

  // Project chat endpoint
  server.post('/projects/:id/chat', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    let data;
    try {
      params = IdParamSchema.parse(request.params);
      data = ProjectChatSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { id } = params;
    const { message, sessionId, stream } = data;

    // Get project
    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Check if project has an agent
    const agentIds = JSON.parse(project.agent_ids || '[]') as string[];
    if (agentIds.length === 0) {
      return reply.status(400).send({ error: 'Project has no agent configured' });
    }

    const vaultPath = server.state.vaultPath;
    const agentPath = join(vaultPath, project.root_path, 'agent');

    // Initialize chat context
    const context = await initChatContext(vaultPath, {
      agentPath,
      sessionId,
      newSession: !sessionId,
    });

    if (!context) {
      return reply.status(500).send({ error: 'Failed to initialize chat context' });
    }

    // Build system prompt with agent definition and memory

    // Stream response if requested (SSE)
    if (stream) {
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      const projectHandler = async (userMessage: string, ctx: ChatContext): Promise<string> => {
        const systemPrompt = buildSystemPrompt(ctx.agent);

        if (!hasProvider('anthropic')) {
          const fallback = 'LLM not configured. Set ANTHROPIC_API_KEY to enable Claude.';
          reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: fallback })}\n\n`);
          return fallback;
        }

        const config = getConfig();
        const provider = createClaudeProvider(config.anthropicApiKey);
        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt },
          ...ctx.history.map<ChatMessage>((msg) => ({
            role: (msg.role === 'assistant' || msg.role === 'system')
              ? msg.role
              : 'user',
            content: msg.content,
          })),
          { role: 'user', content: userMessage },
        ];

        let finalContent = '';
        for await (const chunk of provider.stream?.(messages, {
          model: config.model,
          maxTokens: config.maxTokens,
        }) ?? []) {
          if (chunk.type === 'content' && chunk.content) {
            finalContent += chunk.content;
            reply.raw.write(`data: ${JSON.stringify({ type: 'content', content: chunk.content })}\n\n`);
          }
          if (chunk.type === 'error') {
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: chunk.error })}\n\n`);
          }
        }

        reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        return finalContent || '[No response]';
      };

      await sendMessage(context, message, projectHandler);
      reply.raw.end();
      return reply;
    }

    // Non-streaming: use the agent loop for full LLM integration
    const result = await runAgentLoop({
      message,
      vaultPath,
      agentPath,
      sessionId,
      newSession: !sessionId,
    });

    return {
      response: result.response,
      sessionId: result.sessionId || context.session.id,
      agentId: agentIds[0],
      projectId: id,
    };
  });

  // Get project chat history
  server.get('/projects/:id/chat/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = IdParamSchema.parse(request.params);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { id } = params;

    // Get project
    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Check if project has an agent
    const agentIds = JSON.parse(project.agent_ids || '[]') as string[];
    if (agentIds.length === 0) {
      return { sessions: [], messages: [] };
    }

    const vaultPath = server.state.vaultPath;
    const agentPath = join(vaultPath, project.root_path, 'agent');

    // Get all sessions for this agent
    let sessions: SessionMetadata[] = [];
    try {
      sessions = await listSessions(agentPath, agentIds[0]);
    } catch {
      // No sessions yet
    }

    // Get messages from the most recent active or completed session
    let messages: TranscriptMessage[] = [];
    const recentSession = sessions.find(s => s.status === 'active') || sessions[0];
    
    if (recentSession) {
      try {
        messages = await readTranscript(agentPath, recentSession.id);
      } catch {
        // No messages
      }
    }

    return {
      sessions: sessions.map(s => ({
        id: s.id,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messageCount,
        title: s.title,
      })),
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      currentSessionId: recentSession?.id,
    };
  });

  // Update project agent memory
  server.post('/projects/:id/chat/memory', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = IdParamSchema.parse(request.params);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { id } = params;
    const body = request.body as { updates?: MemoryUpdate[]; sessionSummary?: string } | undefined;

    // Get project
    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Check if project has an agent
    const agentIds = JSON.parse(project.agent_ids || '[]') as string[];
    if (agentIds.length === 0) {
      return reply.status(400).send({ error: 'Project has no agent configured' });
    }

    const vaultPath = server.state.vaultPath;
    const agentPath = join(vaultPath, project.root_path, 'agent');

    // Prepare updates
    const updates: MemoryUpdate[] = body?.updates || [];
    
    // If session summary provided, add it to Session History section
    if (body?.sessionSummary) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      updates.push({
        section: 'Session History',
        content: `\n### ${dateStr} ${timeStr}\n\n${body.sessionSummary}`,
        append: true,
      });
    }

    if (updates.length === 0) {
      return reply.status(400).send({ error: 'No updates provided' });
    }

    // Apply updates
    try {
      const updatedMemory = await applyMemoryUpdates(agentPath, updates);
      if (!updatedMemory) {
        return reply.status(500).send({ error: 'Failed to update memory - memory file not found' });
      }

      return {
        success: true,
        sectionsUpdated: updates.length,
        updatedAt: updatedMemory.frontmatter.updated,
      };
    } catch (err) {
      server.log.error({ err }, 'Failed to update project agent memory');
      return reply.status(500).send({
        error: 'Failed to update memory',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // Upload files to project folder
  server.post('/projects/:id/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = IdParamSchema.parse(request.params);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { id } = params;

    // Get project
    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const vaultPath = server.state.vaultPath;
    const projectFolderPath = join(vaultPath, project.root_path);

    // Ensure project folder exists
    try {
      await access(projectFolderPath);
    } catch {
      await mkdir(projectFolderPath, { recursive: true });
    }

    const ALLOWED_EXTENSIONS = ['.md', '.txt', '.pdf', '.json', '.csv'];
    const uploaded: string[] = [];
    const failed: { filename: string; error: string }[] = [];

    try {
      const parts = request.parts();

      for await (const part of parts) {
        if (part.type === 'file') {
          const file = part as MultipartFile;
          const ext = extname(file.filename).toLowerCase();

          // Check allowed extensions
          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            failed.push({
              filename: file.filename,
              error: `Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
            });
            continue;
          }

          try {
            // Read file content
            const buffer = await file.toBuffer();
            const filePath = join(projectFolderPath, file.filename);

            // Write file to project folder
            await writeFile(filePath, buffer);
            uploaded.push(file.filename);
            server.log.info({ filename: file.filename, path: filePath }, 'File uploaded');
          } catch (err) {
            failed.push({
              filename: file.filename,
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }
      }

      return {
        uploaded,
        failed,
        projectPath: project.root_path,
      };
    } catch (err) {
      server.log.error({ err }, 'Failed to process file upload');
      return reply.status(500).send({
        error: 'Failed to process file upload',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // Extract knowledge from project files
  server.post('/projects/:id/extract', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = IdParamSchema.parse(request.params);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { id } = params;

    // Get project
    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const vaultPath = server.state.vaultPath;
    const projectFolderPath = join(vaultPath, project.root_path);

    // Supported file extensions for extraction
    const EXTRACTABLE_EXTENSIONS = ['.md', '.txt', '.json', '.csv'];

    // Scan project folder for files
    const scanFolder = async (folderPath: string): Promise<string[]> => {
      const files: string[] = [];
      try {
        const entries = await readdir(folderPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(folderPath, entry.name);
          if (entry.isDirectory() && entry.name !== 'agent') {
            // Recursively scan subdirectories (skip agent folder)
            files.push(...await scanFolder(fullPath));
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (EXTRACTABLE_EXTENSIONS.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch {
        // Folder may not exist yet
      }
      return files;
    };

    try {
      const files = await scanFolder(projectFolderPath);
      server.log.info({ projectId: id, filesFound: files.length }, 'Scanning project files for extraction');

      if (files.length === 0) {
        return {
          success: true,
          message: 'No files found for extraction',
          filesScanned: 0,
          itemsExtracted: 0,
          items: [],
        };
      }

      // Extract knowledge items from files
      interface KnowledgeItem {
        id: string;
        type: 'entity' | 'claim' | 'task' | 'decision' | 'note';
        title: string;
        content: string;
        sourceFile: string;
        lineNumber?: number;
        confidence?: number;
        extractedAt: string;
      }

      const items: KnowledgeItem[] = [];
      const now = new Date().toISOString();

      // Helper: get content below a header until next header or end
      function getSectionContent(lines: string[], startIndex: number): string {
        const contentLines: string[] = [];
        for (let j = startIndex + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          // Stop at next header
          if (/^#{1,6}\s+/.test(nextLine)) break;
          // Skip empty lines at start
          if (contentLines.length === 0 && !nextLine.trim()) continue;
          contentLines.push(nextLine);
        }
        // Trim trailing empty lines and join
        while (contentLines.length > 0 && !contentLines[contentLines.length - 1].trim()) {
          contentLines.pop();
        }
        return contentLines.join('\n').trim();
      }

      // Helper: get context around a line (±2 lines)
      function getContext(lines: string[], index: number): string {
        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length, index + 3);
        return lines.slice(start, end).join('\n').trim();
      }

      for (const filePath of files) {
        try {
          const content = await readFile(filePath, 'utf-8');
          const relativePath = filePath.replace(vaultPath + '/', '');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i + 1;

            // Extract tasks (TODO, TASK, [ ], - [ ])
            if (/^(?:TODO|TASK|FIXME)[:\s]/i.test(line) || /^[-*]\s*\[\s*\]/.test(line)) {
              const taskTitle = line.replace(/^(?:TODO|TASK|FIXME)[:\s]*/i, '').replace(/^[-*]\s*\[\s*\]\s*/, '');
              if (taskTitle.length > 3) {
                items.push({
                  id: randomUUID(),
                  type: 'task',
                  title: taskTitle.slice(0, 100),
                  content: getContext(lines, i),
                  sourceFile: relativePath,
                  lineNumber,
                  extractedAt: now,
                });
              }
            }

            // Extract decisions (DECISION, DECIDED)
            if (/^(?:DECISION|DECIDED)[:\s]/i.test(line)) {
              const decisionTitle = line.replace(/^(?:DECISION|DECIDED)[:\s]*/i, '');
              if (decisionTitle.length > 3) {
                items.push({
                  id: randomUUID(),
                  type: 'decision',
                  title: decisionTitle.slice(0, 100),
                  content: getContext(lines, i),
                  sourceFile: relativePath,
                  lineNumber,
                  extractedAt: now,
                });
              }
            }

            // Extract claims/facts (CLAIM, FACT, KEY)
            if (/^(?:CLAIM|FACT|KEY|INSIGHT)[:\s]/i.test(line)) {
              const claimTitle = line.replace(/^(?:CLAIM|FACT|KEY|INSIGHT)[:\s]*/i, '');
              if (claimTitle.length > 3) {
                items.push({
                  id: randomUUID(),
                  type: 'claim',
                  title: claimTitle.slice(0, 100),
                  content: getContext(lines, i),
                  sourceFile: relativePath,
                  lineNumber,
                  confidence: 0.7,
                  extractedAt: now,
                });
              }
            }

            // Extract sections with actual content (## Header with content below)
            if (/^#{1,3}\s+.+/.test(line)) {
              const headerTitle = line.replace(/^#+\s*/, '');
              const sectionContent = getSectionContent(lines, i);
              // Only extract if there's meaningful content (>20 chars)
              if (sectionContent.length > 20 && !headerTitle.startsWith('---')) {
                items.push({
                  id: randomUUID(),
                  type: 'note',
                  title: headerTitle,
                  content: sectionContent.slice(0, 1000), // Cap at 1000 chars
                  sourceFile: relativePath,
                  lineNumber,
                  extractedAt: now,
                });
              }
            }
          }

          // Extract entities with context
          const entityContexts = new Map<string, string>();
          const entityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
          let match;
          while ((match = entityPattern.exec(content)) !== null) {
            const name = match[1];
            // Skip common phrases
            if (name.length > 5 && !['The First', 'This Is', 'That Is', 'In The', 'On The', 'For The'].some(skip => name.startsWith(skip))) {
              if (!entityContexts.has(name)) {
                // Get surrounding context (50 chars before and after)
                const start = Math.max(0, match.index - 50);
                const end = Math.min(content.length, match.index + name.length + 50);
                entityContexts.set(name, '...' + content.slice(start, end).replace(/\n/g, ' ') + '...');
              }
            }
          }

          for (const [entityName, context] of Array.from(entityContexts.entries()).slice(0, 10)) {
            items.push({
              id: randomUUID(),
              type: 'entity',
              title: entityName,
              content: context,
              sourceFile: relativePath,
              extractedAt: now,
            });
          }

        } catch (err) {
          server.log.warn({ filePath, err }, 'Failed to extract from file');
        }
      }

      // Save items to items.json in project folder
      const itemsPath = join(projectFolderPath, 'items.json');
      
      // Load existing items if file exists
      let existingItems: KnowledgeItem[] = [];
      try {
        const existingContent = await readFile(itemsPath, 'utf-8');
        existingItems = JSON.parse(existingContent);
      } catch {
        // File doesn't exist yet
      }

      // Merge items (avoid duplicates by content hash)
      const itemHashes = new Set(existingItems.map(item => `${item.type}:${item.content}`));
      const newItems = items.filter(item => !itemHashes.has(`${item.type}:${item.content}`));
      const allItems = [...existingItems, ...newItems];

      await writeFile(itemsPath, JSON.stringify(allItems, null, 2), 'utf-8');

      server.log.info({ 
        projectId: id, 
        filesScanned: files.length, 
        itemsExtracted: newItems.length,
        totalItems: allItems.length,
      }, 'Extraction complete');

      return {
        success: true,
        filesScanned: files.length,
        itemsExtracted: newItems.length,
        totalItems: allItems.length,
        items: newItems,
      };
    } catch (err) {
      server.log.error({ err }, 'Failed to extract from project');
      return reply.status(500).send({
        error: 'Failed to extract knowledge',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // Get knowledge items for a project
  server.get('/projects/:id/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    const dbInstance = db();
    if (!dbInstance) {
      return reply.status(503).send({ error: 'Database not available' });
    }

    let params;
    try {
      params = IdParamSchema.parse(request.params);
    } catch (err) {
      if (err instanceof ZodError) return handleZodError(err, reply);
      throw err;
    }

    const { id } = params;

    // Parse query params for filtering and pagination
    const query = request.query as {
      type?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };

    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const offset = parseInt(query.offset || '0', 10);
    const typeFilter = query.type;
    const searchQuery = query.search?.toLowerCase();

    // Get project
    const project = dbInstance.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const vaultPath = server.state.vaultPath;
    const projectFolderPath = join(vaultPath, project.root_path);
    const itemsPath = join(projectFolderPath, 'items.json');

    // Define the knowledge item interface
    interface KnowledgeItem {
      id: string;
      type: 'entity' | 'claim' | 'task' | 'decision' | 'note';
      title: string;
      content: string;
      sourceFile: string;
      lineNumber?: number;
      confidence?: number;
      extractedAt: string;
    }

    try {
      // Read items from items.json
      let items: KnowledgeItem[] = [];
      try {
        const content = await readFile(itemsPath, 'utf-8');
        items = JSON.parse(content);
      } catch {
        // File doesn't exist yet - return empty array
      }

      // Apply type filter
      if (typeFilter) {
        items = items.filter(item => item.type === typeFilter);
      }

      // Apply search filter
      if (searchQuery) {
        items = items.filter(item => 
          item.title.toLowerCase().includes(searchQuery) ||
          item.content.toLowerCase().includes(searchQuery)
        );
      }

      // Get total count before pagination
      const total = items.length;

      // Apply pagination
      const paginatedItems = items.slice(offset, offset + limit);

      return {
        data: paginatedItems,
        total,
        limit,
        offset,
        hasMore: offset + paginatedItems.length < total,
      };
    } catch (err) {
      server.log.error({ err }, 'Failed to get knowledge items');
      return reply.status(500).send({
        error: 'Failed to get knowledge items',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });
}
