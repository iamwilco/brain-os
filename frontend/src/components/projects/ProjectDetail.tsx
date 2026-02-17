import { useState, useEffect, useCallback } from "react"
import { 
  ArrowLeft,
  FolderOpen,
  FileText,
  Brain,
  Bot,
  CheckSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  Folder,
  Link2,
  Calendar,
  Loader2,
  Plus,
  X,
  Database,
  MessageSquare,
  Search,
  Filter,
  Lightbulb,
  ListTodo,
  Quote,
  Tag
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Project, ProjectStatus } from "./ProjectsList"
import { AgentChatPanel, type ChatMessage } from "../workshop/AgentChatPanel"
import { FileUploadZone } from "./FileUploadZone"
import { projectsApi } from "@/lib/api"
import type { ExtractionResponse, ExtractedItem } from "@/lib/api"

type TabId = 'overview' | 'knowledge' | 'sources' | 'chat' | 'agent' | 'tasks'

interface ProjectDetailProps {
  project: Project
  stats?: ProjectStats
  tasks?: ProjectTask[]
  linkedScopes?: string[]
  chatMessages?: ChatMessage[]
  isChatLoading?: boolean
  isLoading?: boolean
  onBack?: () => void
  onTaskClick?: (task: ProjectTask) => void
  onUpdateSources?: (scopes: string[]) => Promise<void>
  onSendChatMessage?: (message: string) => Promise<void>
  onSaveMemory?: () => Promise<void>
  onCreateAgent?: () => Promise<void>
}

interface ProjectStats {
  totalItems: number
  linkedNotes: number
  pendingTasks: number
  completedTasks: number
  lastUpdated?: string
}

export interface KnowledgeItem {
  id: string
  title: string
  type: 'note' | 'concept' | 'reference'
  createdAt: string
}

export interface ProjectTask {
  id: string
  title: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'low' | 'medium' | 'high'
  dueDate?: string
}

const statusConfig: Record<ProjectStatus, { label: string; color: string }> = {
  active: { label: 'Active', color: 'text-blue-600' },
  paused: { label: 'Paused', color: 'text-yellow-600' },
  completed: { label: 'Completed', color: 'text-green-600' },
  archived: { label: 'Archived', color: 'text-muted-foreground' },
}

const tabs: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'overview', label: 'Overview', icon: FolderOpen },
  { id: 'knowledge', label: 'Knowledge', icon: Brain },
  { id: 'sources', label: 'Sources', icon: Database },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
]

function OverviewTab({ project, stats }: { project: Project; stats?: ProjectStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <FileText className="h-4 w-4" />
            <span className="text-xs">Items</span>
          </div>
          <p className="text-2xl font-semibold">{stats?.totalItems ?? project.itemCount ?? 0}</p>
        </div>
        <div className="p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Link2 className="h-4 w-4" />
            <span className="text-xs">Linked Notes</span>
          </div>
          <p className="text-2xl font-semibold">{stats?.linkedNotes ?? project.linkedNotes ?? 0}</p>
        </div>
        <div className="p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs">Pending Tasks</span>
          </div>
          <p className="text-2xl font-semibold">{stats?.pendingTasks ?? 0}</p>
        </div>
        <div className="p-4 rounded-lg border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs">Completed</span>
          </div>
          <p className="text-2xl font-semibold">{stats?.completedTasks ?? 0}</p>
        </div>
      </div>

      {project.description && (
        <div>
          <h4 className="text-sm font-medium mb-2">Description</h4>
          <p className="text-sm text-muted-foreground">{project.description}</p>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium mb-2">Details</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Path:</span>
            <span className="font-mono">{project.path}</span>
          </div>
          {project.lastActivity && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last Activity:</span>
              <span>{new Date(project.lastActivity).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KnowledgeTab({ 
  projectId,
}: { 
  projectId: string
}) {
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionResult, setExtractionResult] = useState<ExtractionResponse | null>(null)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  
  const [knowledgeItems, setKnowledgeItems] = useState<ExtractedItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [totalItems, setTotalItems] = useState(0)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<ExtractedItem | null>(null)

  const typeIcons: Record<string, typeof Brain> = {
    entity: Tag,
    claim: Quote,
    task: ListTodo,
    decision: Lightbulb,
    note: FileText,
  }

  const typeLabels: Record<string, string> = {
    entity: 'Entity',
    claim: 'Claim',
    task: 'Task',
    decision: 'Decision',
    note: 'Note',
  }

  const loadKnowledge = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await projectsApi.getKnowledge(projectId, {
        type: typeFilter || undefined,
        search: searchQuery || undefined,
      })
      setKnowledgeItems(result.data)
      setTotalItems(result.total)
    } catch (err) {
      console.error('Failed to load knowledge items:', err)
    } finally {
      setIsLoading(false)
    }
  }, [projectId, typeFilter, searchQuery])

  useEffect(() => {
    loadKnowledge()
  }, [loadKnowledge])

  const handleExtract = async () => {
    setIsExtracting(true)
    setExtractionResult(null)
    setExtractionError(null)

    try {
      const result = await projectsApi.extract(projectId)
      setExtractionResult(result)
      // Reload knowledge items after extraction
      loadKnowledge()
    } catch (err) {
      setExtractionError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* File Upload Zone */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Upload Files</h3>
        <FileUploadZone projectId={projectId} onUploadComplete={() => loadKnowledge()} />
      </div>

      {/* Extract Knowledge */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">Extract Knowledge</h3>
          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4" />
                Extract
              </>
            )}
          </button>
        </div>

        {/* Extraction Result */}
        {extractionResult && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-sm">
            <div className="flex items-center gap-2 text-green-400 font-medium mb-2">
              <CheckCircle className="h-4 w-4" />
              Extraction Complete
            </div>
            <div className="text-zinc-300 space-y-1">
              <p>Files scanned: {extractionResult.filesScanned}</p>
              <p>New items extracted: {extractionResult.itemsExtracted}</p>
              <p>Total items: {extractionResult.totalItems}</p>
            </div>
          </div>
        )}

        {/* Extraction Error */}
        {extractionError && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <div className="flex items-center gap-2 font-medium mb-1">
              <AlertCircle className="h-4 w-4" />
              Extraction Failed
            </div>
            <p>{extractionError}</p>
          </div>
        )}
      </div>

      {/* Knowledge Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">
            Knowledge Items {totalItems > 0 && <span className="text-muted-foreground">({totalItems})</span>}
          </h3>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="pl-9 pr-8 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
            >
              <option value="">All Types</option>
              <option value="entity">Entity</option>
              <option value="claim">Claim</option>
              <option value="task">Task</option>
              <option value="decision">Decision</option>
              <option value="note">Note</option>
            </select>
          </div>
        </div>

        {/* Items List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : knowledgeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 border border-dashed border-border rounded-lg">
            <Brain className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No knowledge items yet</p>
            <p className="text-xs text-muted-foreground mt-1">Upload files and click Extract to generate knowledge</p>
          </div>
        ) : (
          <div className="space-y-2">
            {knowledgeItems.map((item) => {
              const Icon = typeIcons[item.type] || FileText
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                  className={cn(
                    "w-full flex flex-col gap-2 p-3 rounded-lg border text-left transition-colors",
                    selectedItem?.id === item.id 
                      ? "border-primary bg-primary/5" 
                      : "border-border hover:bg-accent"
                  )}
                >
                  <div className="flex items-center gap-3 w-full">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm font-medium truncate">{item.title}</span>
                    <span className="text-xs text-muted-foreground px-2 py-0.5 bg-secondary rounded">
                      {typeLabels[item.type] || item.type}
                    </span>
                  </div>
                  
                  {/* Expanded View - Source Citation */}
                  {selectedItem?.id === item.id && (
                    <div className="mt-2 pt-2 border-t border-border space-y-2">
                      {item.content !== item.title && (
                        <p className="text-sm text-muted-foreground">{item.content}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span className="font-mono">{item.sourceFile}</span>
                        {item.lineNumber && <span>Line {item.lineNumber}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Extracted: {new Date(item.extractedAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function AgentTab({ project, onCreateAgent }: { project: Project; onCreateAgent?: () => Promise<void> }) {
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateAgent = async () => {
    if (!onCreateAgent) return
    setIsCreating(true)
    try {
      await onCreateAgent()
    } finally {
      setIsCreating(false)
    }
  }

  if (!project.hasAgent) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground mb-4">No agent configured</p>
        <button 
          onClick={handleCreateAgent}
          disabled={isCreating || !onCreateAgent}
          className={cn(
            "px-4 py-2 text-sm rounded-md",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Creating...
            </>
          ) : (
            'Create Agent'
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-lg border border-border">
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Bot className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className="font-medium text-sm">{project.name} Agent</p>
          <p className="text-xs text-muted-foreground">Project Agent</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle className="h-3 w-3 text-green-600" />
          <span className="text-xs font-medium text-green-600">Idle</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Agent is configured and ready. View agent details in the Control Room.
      </p>
    </div>
  )
}

const SCOPE_TYPE_LABELS: Record<string, string> = {
  path: 'Folder Path',
  tag: 'Tag',
  moc: 'Map of Content',
  collection: 'Collection',
}

function SourcesTab({ 
  scopes,
  onUpdate,
}: { 
  scopes: string[]
  onUpdate?: (scopes: string[]) => Promise<void>
}) {
  const [newScope, setNewScope] = useState('')
  const [scopeType, setScopeType] = useState<'path' | 'tag' | 'moc' | 'collection'>('path')
  const [isAdding, setIsAdding] = useState(false)

  const handleAdd = async () => {
    if (!newScope.trim() || !onUpdate) return
    const fullScope = `${scopeType}:${newScope.trim()}`
    if (scopes.includes(fullScope)) return
    
    setIsAdding(true)
    try {
      await onUpdate([...scopes, fullScope])
      setNewScope('')
    } finally {
      setIsAdding(false)
    }
  }

  const handleRemove = async (scope: string) => {
    if (!onUpdate) return
    await onUpdate(scopes.filter(s => s !== scope))
  }

  const parseScope = (scope: string) => {
    const [type, ...rest] = scope.split(':')
    return { type, value: rest.join(':') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-3">Linked Sources</h4>
        {scopes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources linked yet</p>
        ) : (
          <div className="space-y-2">
            {scopes.map((scope) => {
              const { type, value } = parseScope(scope)
              return (
                <div 
                  key={scope}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground mr-2">
                      {SCOPE_TYPE_LABELS[type] || type}:
                    </span>
                    <span className="text-sm font-mono">{value}</span>
                  </div>
                  {onUpdate && (
                    <button
                      onClick={() => handleRemove(scope)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {onUpdate && (
        <div className="border-t border-border pt-4">
          <h4 className="text-sm font-medium mb-3">Add Source</h4>
          <div className="flex gap-2">
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as typeof scopeType)}
              className="px-3 py-2 text-sm rounded-md border border-border bg-background"
            >
              <option value="path">Folder Path</option>
              <option value="tag">Tag</option>
              <option value="moc">MOC</option>
              <option value="collection">Collection</option>
            </select>
            <input
              type="text"
              value={newScope}
              onChange={(e) => setNewScope(e.target.value)}
              placeholder={scopeType === 'path' ? '30_Projects/MyProject/**' : scopeType === 'tag' ? 'my-tag' : 'value'}
              className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              disabled={!newScope.trim() || isAdding}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TasksTab({ 
  tasks, 
  onTaskClick 
}: { 
  tasks: ProjectTask[]
  onTaskClick?: (task: ProjectTask) => void 
}) {
  const statusIcons = {
    pending: Clock,
    in_progress: AlertCircle,
    completed: CheckCircle,
  }
  const statusColors = {
    pending: 'text-muted-foreground',
    in_progress: 'text-blue-600',
    completed: 'text-green-600',
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">No tasks yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const Icon = statusIcons[task.status]
        return (
          <button
            key={task.id}
            onClick={() => onTaskClick?.(task)}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg border border-border",
              "hover:bg-accent transition-colors text-left"
            )}
          >
            <Icon className={cn("h-4 w-4", statusColors[task.status])} />
            <span className={cn(
              "flex-1 text-sm",
              task.status === 'completed' && "line-through text-muted-foreground"
            )}>
              {task.title}
            </span>
            {task.dueDate && (
              <span className="text-xs text-muted-foreground">
                {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function ProjectDetail({
  project,
  stats,
  tasks = [],
  linkedScopes = [],
  chatMessages = [],
  isChatLoading = false,
  isLoading,
  onBack,
  onTaskClick,
  onUpdateSources,
  onSendChatMessage,
  onSaveMemory,
  onCreateAgent,
}: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const status = statusConfig[project.status]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-md hover:bg-accent mt-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="p-3 rounded-lg bg-primary/10">
          <FolderOpen className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{project.name}</h2>
            <span className={cn("text-xs font-medium", status.color)}>
              {status.label}
            </span>
            {project.hasAgent && (
              <span className="text-xs text-primary font-medium px-1.5 py-0.5 bg-primary/10 rounded">
                Agent
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{project.path}</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const TabIcon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium -mb-px",
                "border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <TabIcon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="pt-2">
        {activeTab === 'overview' && <OverviewTab project={project} stats={stats} />}
        {activeTab === 'knowledge' && <KnowledgeTab projectId={project.id} />}
        {activeTab === 'sources' && <SourcesTab scopes={linkedScopes} onUpdate={onUpdateSources} />}
        {activeTab === 'chat' && (
          <div className="space-y-3">
            <div className="h-[500px] border border-border rounded-lg overflow-hidden">
              <AgentChatPanel
                agentName={`${project.name} Agent`}
                messages={chatMessages}
                isStreaming={isChatLoading}
                onSendMessage={onSendChatMessage || (async () => {})}
              />
            </div>
            {onSaveMemory && chatMessages.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={onSaveMemory}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  )}
                >
                  <Brain className="h-4 w-4" />
                  Save Session to Memory
                </button>
              </div>
            )}
          </div>
        )}
        {activeTab === 'agent' && <AgentTab project={project} onCreateAgent={onCreateAgent} />}
        {activeTab === 'tasks' && <TasksTab tasks={tasks} onTaskClick={onTaskClick} />}
      </div>
    </div>
  )
}
