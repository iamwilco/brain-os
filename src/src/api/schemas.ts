/**
 * Zod schemas for API validation
 */

import { z } from 'zod';

/**
 * Project schemas
 */
export const ProjectStatusSchema = z.enum(['active', 'paused', 'archived']);

export const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().max(10).optional(),
  description: z.string().max(1000).optional(),
  rootPath: z.string().min(1),
  linkedScopes: z.array(z.string()).optional().default([]),
  createAgent: z.boolean().optional().default(false),
});

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().max(10).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  status: ProjectStatusSchema.optional(),
  linkedScopes: z.array(z.string()).optional(),
});

export const ProjectSourcesUpdateSchema = z.object({
  linkedScopes: z.array(z.string()),
});

export const ProjectChatSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  description: z.string().nullable(),
  rootPath: z.string(),
  status: ProjectStatusSchema,
  linkedScopes: z.array(z.string()),
  agentIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Run schemas
 */
export const RunActionSchema = z.enum([
  'ingest',
  'index',
  'extract',
  'synth',
  'skill',
  'brainstorm',
  'write',
  'export',
]);

export const RunStatusSchema = z.enum(['queued', 'running', 'success', 'fail']);

export const RunCreateSchema = z.object({
  agentId: z.string().optional(),
  action: RunActionSchema,
  params: z.record(z.unknown()).optional(),
});

export const RunSchema = z.object({
  id: z.string(),
  agentId: z.string().nullable(),
  action: RunActionSchema,
  status: RunStatusSchema,
  progress: z.number().min(0).max(100),
  logs: z.array(z.string()),
  artifactIds: z.array(z.string()),
  error: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

/**
 * Artifact schemas
 */
export const ArtifactTypeSchema = z.enum([
  'markdown',
  'tasks',
  'mindmap',
  'report',
  'diff',
  'context-pack',
]);

export const ArtifactSchema = z.object({
  id: z.string(),
  type: ArtifactTypeSchema,
  title: z.string().nullable(),
  agentId: z.string().nullable(),
  runId: z.string().nullable(),
  projectId: z.string().nullable(),
  scopeRef: z.string().nullable(),
  filePath: z.string().nullable(),
  content: z.string().nullable(),
  renderHints: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
});

export const ArtifactCreateSchema = z.object({
  type: ArtifactTypeSchema,
  title: z.string().optional(),
  agentId: z.string().optional(),
  runId: z.string().optional(),
  projectId: z.string().optional(),
  scopeRef: z.string().optional(),
  filePath: z.string().optional(),
  content: z.string().optional(),
  renderHints: z.record(z.unknown()).optional(),
});

/**
 * Source collection schemas
 */
export const SourceCollectionTypeSchema = z.enum(['chatgpt', 'claude', 'folder']);

export const SourceCollectionStatusSchema = z.enum([
  'pending',
  'processing',
  'ready',
  'error',
]);

export const ImportRequestSchema = z.object({
  type: SourceCollectionTypeSchema,
  path: z.string().min(1),
  name: z.string().max(100).optional(),
});

export const SourceCollectionSchema = z.object({
  id: z.string(),
  type: SourceCollectionTypeSchema,
  name: z.string().nullable(),
  status: SourceCollectionStatusSchema,
  counts: z.object({
    conversations: z.number(),
    messages: z.number(),
    items: z.number(),
  }),
  errors: z.array(z.string()),
  importPath: z.string().nullable(),
  lastImportedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Agent schemas
 */
export const AgentTypeSchema = z.enum(['admin', 'project', 'skill']);

export const AgentStatusSchema = z.enum(['idle', 'running', 'error']);

export const AgentSpawnSchema = z.object({
  name: z.string().min(1).max(100),
  type: AgentTypeSchema,
  scope: z.array(z.string()).min(1),
  description: z.string().max(1000).optional(),
  projectPath: z.string().optional(),
});

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: AgentTypeSchema,
  scope: z.array(z.string()),
  status: AgentStatusSchema,
  lastRun: z.string().nullable(),
  lastError: z.string().nullable(),
  configPath: z.string(),
  memoryPath: z.string().nullable(),
});

/**
 * Search schemas
 */
export const SearchFiltersSchema = z.object({
  types: z.array(z.string()).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  collections: z.array(z.string()).optional(),
});

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  scope: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  filters: SearchFiltersSchema.optional(),
});

export const SearchResultSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  snippet: z.string(),
  path: z.string(),
  score: z.number(),
  highlights: z.array(z.string()),
  source: z.object({
    id: z.string(),
    collection: z.string(),
    startLine: z.number().optional(),
    endLine: z.number().optional(),
  }),
});

export const SearchResponseSchema = z.object({
  query: z.string(),
  scope: z.string().nullable(),
  total: z.number(),
  results: z.array(SearchResultSchema),
  took: z.number(),
});

/**
 * Health and stats schemas
 */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  version: z.string(),
  uptime: z.number(),
  database: z.object({
    connected: z.boolean(),
    schemaVersion: z.number(),
  }),
  counts: z.object({
    sources: z.number(),
    items: z.number(),
    projects: z.number(),
    agents: z.number(),
    runs: z.number(),
  }),
});

export const StatsResponseSchema = z.object({
  sources: z.number(),
  chunks: z.number(),
  items: z.number(),
  entities: z.number(),
  projects: z.number(),
  agents: z.number(),
  runs: z.number(),
  artifacts: z.number(),
  collections: z.number(),
});

/**
 * Activity schemas
 */
export const ActivityItemSchema = z.object({
  id: z.string(),
  type: z.enum(['run', 'import', 'extraction', 'agent']),
  action: z.string(),
  description: z.string(),
  status: z.string(),
  timestamp: z.string(),
  agentId: z.string().optional(),
  projectId: z.string().optional(),
});

export const RecentActivityResponseSchema = z.object({
  items: z.array(ActivityItemSchema),
  total: z.number(),
});

/**
 * WebSocket event schemas
 */
export const WSEventTypeSchema = z.enum([
  'run:started',
  'run:progress',
  'run:completed',
  'run:failed',
  'agent:status',
  'import:progress',
  'import:completed',
]);

export const WSEventSchema = z.object({
  type: WSEventTypeSchema,
  timestamp: z.string(),
  payload: z.unknown(),
});

export const RunProgressEventSchema = z.object({
  runId: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
});

export const RunCompletedEventSchema = z.object({
  runId: z.string(),
  status: z.enum(['success', 'fail']),
  artifactIds: z.array(z.string()),
  error: z.string().optional(),
});

export const AgentStatusEventSchema = z.object({
  agentId: z.string(),
  status: AgentStatusSchema,
  lastError: z.string().optional(),
});

/**
 * Common schemas
 */
export const APIErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export const ListParamsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  });

/**
 * ID param schema
 */
export const IdParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * Infer types from schemas (use Schema suffix to avoid conflicts with types.ts)
 */
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;
export type RunCreateInput = z.infer<typeof RunCreateSchema>;
export type ImportRequestInput = z.infer<typeof ImportRequestSchema>;
export type AgentSpawnInput = z.infer<typeof AgentSpawnSchema>;
export type SearchRequestInput = z.infer<typeof SearchRequestSchema>;
export type ListParamsInput = z.infer<typeof ListParamsSchema>;
