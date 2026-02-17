const API_BASE = 'http://localhost:3001'

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }

  return response.json()
}

// Health
export const healthApi = {
  check: () => fetchApi<{ status: string; version: string }>('/health'),
}

// Projects
export interface Project {
  id: string
  name: string
  emoji?: string
  description?: string
  rootPath: string
  status: 'active' | 'paused' | 'archived'
  linkedScopes?: string[]
  agentIds?: string[]
  createdAt: string
  updatedAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface ProjectCreateInput {
  name: string
  emoji?: string
  description?: string
  rootPath: string
  linkedScopes?: string[]
  createAgent?: boolean
}

export const projectsApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    fetchApi<PaginatedResponse<Project>>(`/projects?${new URLSearchParams(params as Record<string, string>)}`),
  
  get: (id: string) => fetchApi<Project>(`/projects/${id}`),
  
  create: (data: ProjectCreateInput) =>
    fetchApi<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: Partial<Project>) =>
    fetchApi<Project>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  updateSources: (id: string, linkedScopes: string[]) =>
    fetchApi<Project>(`/projects/${id}/sources`, {
      method: 'PUT',
      body: JSON.stringify({ linkedScopes }),
    }),

  chat: (id: string, message: string, sessionId?: string) =>
    fetchApi<ProjectChatResponse>(`/projects/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, sessionId }),
    }),

  getChatHistory: (id: string) =>
    fetchApi<ProjectChatHistoryResponse>(`/projects/${id}/chat/history`),

  updateMemory: (id: string, sessionSummary: string) =>
    fetchApi<{ success: boolean; sectionsUpdated: number; updatedAt: string }>(
      `/projects/${id}/chat/memory`,
      {
        method: 'POST',
        body: JSON.stringify({ sessionSummary }),
      }
    ),

  createAgent: (id: string) =>
    fetchApi<Project>(`/projects/${id}/agent`, { method: 'POST' }),

  uploadFiles: async (id: string, files: File[], onProgress?: (progress: number) => void) => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))

    return new Promise<FileUploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/projects/${id}/upload`)

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`))
        }
      }

      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(formData)
    })
  },

  extract: (id: string) =>
    fetchApi<ExtractionResponse>(`/projects/${id}/extract`, { method: 'POST', body: JSON.stringify({}) }),

  getKnowledge: (id: string, params?: { type?: string; search?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.type) searchParams.set('type', params.type)
    if (params?.search) searchParams.set('search', params.search)
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())
    const queryString = searchParams.toString()
    return fetchApi<KnowledgeResponse>(`/projects/${id}/knowledge${queryString ? `?${queryString}` : ''}`)
  },
}

export interface FileUploadResponse {
  uploaded: string[]
  failed: { filename: string; error: string }[]
  projectPath: string
}

export interface ExtractionResponse {
  success: boolean
  message?: string
  filesScanned: number
  itemsExtracted: number
  totalItems: number
  items: ExtractedItem[]
}

export interface ExtractedItem {
  id: string
  type: 'entity' | 'claim' | 'task' | 'decision' | 'note'
  title: string
  content: string
  sourceFile: string
  lineNumber?: number
  confidence?: number
  extractedAt: string
}

export interface KnowledgeResponse {
  data: ExtractedItem[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface ProjectChatResponse {
  response: string
  sessionId: string
  agentId: string
  projectId: string
}

export interface ChatHistoryMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatHistorySession {
  id: string
  status: 'active' | 'completed' | 'abandoned'
  createdAt: string
  updatedAt: string
  messageCount: number
  title?: string
}

export interface ProjectChatHistoryResponse {
  sessions: ChatHistorySession[]
  messages: ChatHistoryMessage[]
  currentSessionId?: string
}

// Agents
export interface Agent {
  id: string
  name: string
  type: 'admin' | 'project' | 'skill'
  scope: string[]
  status: 'idle' | 'running' | 'error'
  lastRun: string | null
  lastError: string | null
}

export const agentsApi = {
  list: () => fetchApi<{ data: Agent[]; total: number }>('/agents'),
  get: (id: string) => fetchApi<Agent>(`/agents/${id}`),
  restart: (id: string) => fetchApi<Agent>(`/agents/${id}/restart`, { method: 'PUT' }),
  getConfig: (id: string) => fetchApi<{ content: string; path: string }>(`/agents/${id}/config`),
  saveConfig: (id: string, content: string) => 
    fetchApi<{ success: boolean; path: string }>(`/agents/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  getMemory: (id: string) => fetchApi<{ content: string; path: string | null }>(`/agents/${id}/memory`),
  saveMemory: (id: string, content: string) =>
    fetchApi<{ success: boolean; path: string }>(`/agents/${id}/memory`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  run: (id: string) => fetchApi<{ id: string; status: string; message: string }>(`/agents/${id}/run`, { method: 'POST' }),
}

// Runs
export interface Run {
  id: string
  agentId: string | null
  action: string
  status: 'queued' | 'running' | 'success' | 'fail'
  progress: number
  logs: string[]
  startedAt: string
  completedAt: string | null
}

export const runsApi = {
  list: (params?: { limit?: number; offset?: number }) =>
    fetchApi<PaginatedResponse<Run>>(`/runs?${new URLSearchParams(params as Record<string, string>)}`),
  
  get: (id: string) => fetchApi<Run>(`/runs/${id}`),
  
  create: (data: { action: string; agentId?: string }) =>
    fetchApi<Run>('/runs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  cancel: (id: string) =>
    fetchApi<{ success: boolean }>(`/runs/${id}`, { method: 'DELETE' }),
}

// Search
export interface SearchResult {
  id: string
  type: string
  title: string
  snippet: string
  score: number
}

export const searchApi = {
  search: (query: string, scope?: string) =>
    fetchApi<{ results: SearchResult[]; total: number; took: number }>(
      `/search?query=${encodeURIComponent(query)}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`
    ),
}
