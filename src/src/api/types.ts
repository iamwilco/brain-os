/**
 * API Types for Frontend Dashboard
 * Shared types between API server and frontend
 */

/**
 * Project status
 */
export type ProjectStatus = 'active' | 'paused' | 'archived';

/**
 * Project for API responses
 */
export interface ProjectAPI {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  rootPath: string;
  status: ProjectStatus;
  linkedScopes: string[];
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Project create/update request
 */
export interface ProjectCreateRequest {
  name: string;
  emoji?: string;
  description?: string;
  rootPath: string;
  linkedScopes?: string[];
}

export interface ProjectUpdateRequest {
  name?: string;
  emoji?: string;
  description?: string;
  status?: ProjectStatus;
  linkedScopes?: string[];
}

/**
 * Run action types
 */
export type RunAction = 
  | 'ingest' 
  | 'index' 
  | 'extract' 
  | 'synth' 
  | 'skill' 
  | 'brainstorm' 
  | 'write'
  | 'export';

/**
 * Run status
 */
export type RunStatus = 'queued' | 'running' | 'success' | 'fail';

/**
 * Run for API responses
 */
export interface RunAPI {
  id: string;
  agentId: string | null;
  action: RunAction;
  status: RunStatus;
  progress: number;
  logs: string[];
  artifactIds: string[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

/**
 * Run create request
 */
export interface RunCreateRequest {
  agentId?: string;
  action: RunAction;
  params?: Record<string, unknown>;
}

/**
 * Artifact types
 */
export type ArtifactType = 
  | 'markdown' 
  | 'tasks' 
  | 'mindmap' 
  | 'report' 
  | 'diff' 
  | 'context-pack';

/**
 * Artifact for API responses
 */
export interface ArtifactAPI {
  id: string;
  type: ArtifactType;
  title: string | null;
  agentId: string | null;
  runId: string | null;
  projectId: string | null;
  scopeRef: string | null;
  filePath: string | null;
  content: string | null;
  renderHints: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Source collection types
 */
export type SourceCollectionType = 'chatgpt' | 'claude' | 'folder';

/**
 * Source collection status
 */
export type SourceCollectionStatus = 'pending' | 'processing' | 'ready' | 'error';

/**
 * Source collection for API responses
 */
export interface SourceCollectionAPI {
  id: string;
  type: SourceCollectionType;
  name: string | null;
  status: SourceCollectionStatus;
  counts: {
    conversations: number;
    messages: number;
    items: number;
  };
  errors: string[];
  importPath: string | null;
  lastImportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Import request
 */
export interface ImportRequest {
  type: SourceCollectionType;
  path: string;
  name?: string;
}

/**
 * Agent type
 */
export type AgentType = 'admin' | 'project' | 'skill';

/**
 * Agent status
 */
export type AgentStatus = 'idle' | 'running' | 'error';

/**
 * Agent for API responses
 */
export interface AgentAPI {
  id: string;
  name: string;
  type: AgentType;
  scope: string[];
  status: AgentStatus;
  lastRun: string | null;
  lastError: string | null;
  configPath: string;
  memoryPath: string | null;
}

/**
 * Agent spawn request
 */
export interface AgentSpawnRequest {
  name: string;
  type: AgentType;
  scope: string[];
  description?: string;
  projectPath?: string;
}

/**
 * Search request
 */
export interface SearchRequest {
  query: string;
  scope?: string;
  limit?: number;
  offset?: number;
  filters?: {
    types?: string[];
    dateFrom?: string;
    dateTo?: string;
    collections?: string[];
  };
}

/**
 * Search result
 */
export interface SearchResult {
  id: string;
  type: string;
  title: string;
  snippet: string;
  path: string;
  score: number;
  highlights: string[];
  source: {
    id: string;
    collection: string;
    startLine?: number;
    endLine?: number;
  };
}

/**
 * Search response
 */
export interface SearchResponse {
  query: string;
  scope: string | null;
  total: number;
  results: SearchResult[];
  took: number;
}

/**
 * Health response
 */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  database: {
    connected: boolean;
    schemaVersion: number;
  };
  counts: {
    sources: number;
    items: number;
    projects: number;
    agents: number;
    runs: number;
  };
}

/**
 * Stats response
 */
export interface StatsResponse {
  sources: number;
  chunks: number;
  items: number;
  entities: number;
  projects: number;
  agents: number;
  runs: number;
  artifacts: number;
  collections: number;
}

/**
 * Activity item
 */
export interface ActivityItem {
  id: string;
  type: 'run' | 'import' | 'extraction' | 'agent';
  action: string;
  description: string;
  status: string;
  timestamp: string;
  agentId?: string;
  projectId?: string;
}

/**
 * Recent activity response
 */
export interface RecentActivityResponse {
  items: ActivityItem[];
  total: number;
}

/**
 * WebSocket event types
 */
export type WSEventType = 
  | 'run:started'
  | 'run:progress'
  | 'run:log'
  | 'run:complete'
  | 'run:completed'
  | 'run:failed'
  | 'agent:status'
  | 'import:progress'
  | 'import:completed'
  | 'notification'
  | 'connected'
  | 'subscribed'
  | 'pong';

/**
 * WebSocket event
 */
export interface WSEvent {
  type: WSEventType;
  timestamp: string;
  payload: unknown;
}

/**
 * Run progress event
 */
export interface RunProgressEvent {
  runId: string;
  progress: number;
  message?: string;
}

/**
 * Run completed event
 */
export interface RunCompletedEvent {
  runId: string;
  status: 'success' | 'fail';
  artifactIds: string[];
  error?: string;
}

/**
 * Agent status event
 */
export interface AgentStatusEvent {
  agentId: string;
  status: AgentStatus;
  lastError?: string;
}

/**
 * API error response
 */
export interface APIError {
  error: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * List query params
 */
export interface ListParams {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}
