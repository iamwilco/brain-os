import { useState, useMemo } from "react"
import { 
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  Filter,
  ChevronRight,
  Bot
} from "lucide-react"
import { cn } from "@/lib/utils"

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Run {
  id: string
  agentId: string
  agentName: string
  status: RunStatus
  startedAt: string
  completedAt?: string
  duration?: number
  error?: string
  taskCount?: number
  tasksCompleted?: number
}

interface RunsHistoryProps {
  runs: Run[]
  agents: { id: string; name: string }[]
  isLoading?: boolean
  onRunClick?: (run: Run) => void
}

const statusConfig: Record<RunStatus, { 
  icon: typeof CheckCircle
  label: string
  color: string
  bg: string 
}> = {
  pending: { 
    icon: Clock, 
    label: 'Pending', 
    color: 'text-muted-foreground',
    bg: 'bg-muted'
  },
  running: { 
    icon: Loader2, 
    label: 'Running', 
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/30'
  },
  completed: { 
    icon: CheckCircle, 
    label: 'Completed', 
    color: 'text-green-600',
    bg: 'bg-green-100 dark:bg-green-900/30'
  },
  failed: { 
    icon: XCircle, 
    label: 'Failed', 
    color: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30'
  },
  cancelled: { 
    icon: AlertTriangle, 
    label: 'Cancelled', 
    color: 'text-yellow-600',
    bg: 'bg-yellow-100 dark:bg-yellow-900/30'
  },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function StatusBadge({ status }: { status: RunStatus }) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full", config.bg)}>
      <Icon className={cn(
        "h-3.5 w-3.5", 
        config.color,
        status === 'running' && "animate-spin"
      )} />
      <span className={cn("text-xs font-medium", config.color)}>
        {config.label}
      </span>
    </div>
  )
}

function RunRow({ run, onClick }: { run: Run; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-lg border border-border",
        "hover:bg-accent transition-colors text-left",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{run.agentName}</span>
          <span className="text-xs text-muted-foreground">#{run.id.slice(-6)}</span>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span>{new Date(run.startedAt).toLocaleString()}</span>
          {run.duration && (
            <span>Duration: {formatDuration(run.duration)}</span>
          )}
          {run.taskCount !== undefined && (
            <span>
              Tasks: {run.tasksCompleted ?? 0}/{run.taskCount}
            </span>
          )}
        </div>
        {run.error && (
          <p className="text-xs text-red-600 mt-1 truncate">{run.error}</p>
        )}
      </div>

      <StatusBadge status={run.status} />
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  )
}

export function RunsHistory({
  runs,
  agents,
  isLoading,
  onRunClick,
}: RunsHistoryProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<RunStatus | ''>('')

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (selectedAgent && run.agentId !== selectedAgent) return false
      if (selectedStatus && run.status !== selectedStatus) return false
      return true
    })
  }, [runs, selectedAgent, selectedStatus])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
          className={cn(
            "text-sm px-3 py-1.5 rounded-md border border-border",
            "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <option value="">All Agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value as RunStatus | '')}
          className={cn(
            "text-sm px-3 py-1.5 rounded-md border border-border",
            "bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          )}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {(selectedAgent || selectedStatus) && (
          <button
            onClick={() => {
              setSelectedAgent('')
              setSelectedStatus('')
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filteredRuns.length} run{filteredRuns.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filteredRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Clock className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            {runs.length === 0 ? 'No runs yet' : 'No runs match filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRuns.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              onClick={() => onRunClick?.(run)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
