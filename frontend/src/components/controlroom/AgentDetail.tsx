import { useState } from "react"
import { 
  ArrowLeft,
  Bot,
  User,
  Wrench,
  Settings,
  Brain,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Play,
  Square
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Agent, AgentType, AgentStatus } from "./AgentList"

type TabId = 'config' | 'memory' | 'logs'

interface AgentDetailProps {
  agent: Agent
  configContent?: string
  memoryContent?: string
  logs?: LogEntry[]
  isLoading?: boolean
  onBack?: () => void
  onSaveConfig?: (content: string) => Promise<void>
  onSaveMemory?: (content: string) => Promise<void>
  onRunAgent?: () => Promise<void>
  onStopAgent?: () => Promise<void>
}

export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

const typeConfig: Record<AgentType, { icon: typeof Bot; label: string; color: string }> = {
  admin: { icon: User, label: 'Admin', color: 'text-purple-500' },
  project: { icon: Bot, label: 'Project', color: 'text-blue-500' },
  skill: { icon: Wrench, label: 'Skill', color: 'text-orange-500' },
}

const statusConfig: Record<AgentStatus, { icon: typeof CheckCircle; label: string; color: string }> = {
  idle: { icon: CheckCircle, label: 'Idle', color: 'text-green-600' },
  running: { icon: Loader2, label: 'Running', color: 'text-blue-600' },
  error: { icon: XCircle, label: 'Error', color: 'text-red-600' },
  disabled: { icon: Clock, label: 'Disabled', color: 'text-muted-foreground' },
}

const tabs: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'logs', label: 'Logs', icon: FileText },
]

function TabContent({ 
  content, 
  onSave,
  placeholder,
  readOnly = false,
}: { 
  content?: string
  onSave?: (content: string) => Promise<void>
  placeholder: string
  readOnly?: boolean
}) {
  const [value, setValue] = useState(content || '')
  const [isSaving, setIsSaving] = useState(false)
  const hasChanges = value !== (content || '')

  const handleSave = async () => {
    if (!onSave || !hasChanges) return
    setIsSaving(true)
    try {
      await onSave(value)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        className={cn(
          "flex-1 w-full p-4 font-mono text-sm resize-none",
          "bg-muted/50 border-0 rounded-lg",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          readOnly && "cursor-default"
        )}
      />
      {onSave && !readOnly && (
        <div className="flex justify-end mt-3">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={cn(
              "px-4 py-2 text-sm rounded-md",
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center gap-2"
            )}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      )}
    </div>
  )
}

function LogsView({ logs }: { logs: LogEntry[] }) {
  const levelColors = {
    info: 'text-blue-600',
    warn: 'text-yellow-600',
    error: 'text-red-600',
  }

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">No logs available</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto font-mono text-sm space-y-1">
      {logs.map((log) => (
        <div key={log.id} className="flex gap-3 p-2 hover:bg-muted/50 rounded">
          <span className="text-muted-foreground shrink-0">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className={cn("uppercase text-xs font-medium w-12", levelColors[log.level])}>
            {log.level}
          </span>
          <span className="flex-1">{log.message}</span>
        </div>
      ))}
    </div>
  )
}

export function AgentDetail({
  agent,
  configContent,
  memoryContent,
  logs = [],
  isLoading,
  onBack,
  onSaveConfig,
  onSaveMemory,
  onRunAgent,
  onStopAgent,
}: AgentDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('config')
  const [isRunning, setIsRunning] = useState(false)

  const type = typeConfig[agent.type]
  const status = statusConfig[agent.status]
  const TypeIcon = type.icon
  const StatusIcon = status.icon

  const handleRun = async () => {
    if (!onRunAgent) return
    setIsRunning(true)
    try {
      await onRunAgent()
    } finally {
      setIsRunning(false)
    }
  }

  const handleStop = async () => {
    if (!onStopAgent) return
    setIsRunning(true)
    try {
      await onStopAgent()
    } finally {
      setIsRunning(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between pb-4 border-b border-border">
        <div className="flex items-start gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-md hover:bg-accent mt-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className={cn("p-3 rounded-lg", type.color, "bg-current/10")}>
            <TypeIcon className={cn("h-6 w-6", type.color)} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={cn("text-xs px-2 py-0.5 rounded", type.color, "bg-current/10")}>
                {type.label}
              </span>
              <div className="flex items-center gap-1">
                <StatusIcon className={cn(
                  "h-3.5 w-3.5", 
                  status.color,
                  agent.status === 'running' && "animate-spin"
                )} />
                <span className={cn("text-xs", status.color)}>{status.label}</span>
              </div>
            </div>
            {agent.description && (
              <p className="text-sm text-muted-foreground mt-2">{agent.description}</p>
            )}
            {agent.scope && (
              <p className="text-xs text-muted-foreground mt-1">Scope: {agent.scope}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {agent.status === 'running' ? (
            <button
              onClick={handleStop}
              disabled={isRunning}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
                "bg-red-600 text-white hover:bg-red-700",
                "disabled:opacity-50"
              )}
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              disabled={isRunning || agent.status === 'disabled'}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "disabled:opacity-50"
              )}
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mt-4 border-b border-border">
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

      <div className="flex-1 pt-4 min-h-0">
        {activeTab === 'config' && (
          <TabContent
            content={configContent}
            onSave={onSaveConfig}
            placeholder="# Agent Configuration\n\nNo configuration loaded..."
          />
        )}
        {activeTab === 'memory' && (
          <TabContent
            content={memoryContent}
            onSave={onSaveMemory}
            placeholder="# Agent Memory\n\nNo memory loaded..."
          />
        )}
        {activeTab === 'logs' && <LogsView logs={logs} />}
      </div>
    </div>
  )
}
