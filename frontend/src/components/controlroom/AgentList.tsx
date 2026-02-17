import { 
  Bot, 
  User,
  Wrench,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"

export type AgentType = 'admin' | 'project' | 'skill'
export type AgentStatus = 'idle' | 'running' | 'error' | 'disabled'

export interface Agent {
  id: string
  name: string
  type: AgentType
  status: AgentStatus
  description?: string
  lastRun?: string
  scope?: string
}

interface AgentListProps {
  agents: Agent[]
  isLoading?: boolean
  onAgentClick?: (agent: Agent) => void
  groupByType?: boolean
}

interface AgentRowProps {
  agent: Agent
  onClick?: () => void
}

const typeConfig: Record<AgentType, { icon: typeof Bot; label: string; color: string }> = {
  admin: { icon: User, label: 'Admin', color: 'text-purple-500' },
  project: { icon: Bot, label: 'Project', color: 'text-blue-500' },
  skill: { icon: Wrench, label: 'Skill', color: 'text-orange-500' },
}

const statusConfig: Record<AgentStatus, { icon: typeof CheckCircle; label: string; color: string; bg: string }> = {
  idle: { 
    icon: CheckCircle, 
    label: 'Idle', 
    color: 'text-green-600',
    bg: 'bg-green-100 dark:bg-green-900/30'
  },
  running: { 
    icon: Loader2, 
    label: 'Running', 
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/30'
  },
  error: { 
    icon: XCircle, 
    label: 'Error', 
    color: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30'
  },
  disabled: { 
    icon: Clock, 
    label: 'Disabled', 
    color: 'text-muted-foreground',
    bg: 'bg-muted'
  },
}

function AgentRow({ agent, onClick }: AgentRowProps) {
  const type = typeConfig[agent.type]
  const status = statusConfig[agent.status]
  const TypeIcon = type.icon
  const StatusIcon = status.icon

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-lg border border-border",
        "hover:bg-accent transition-colors text-left",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        agent.status === 'disabled' && "opacity-60"
      )}
    >
      <div className={cn("p-2 rounded-lg", type.color, "bg-current/10")}>
        <TypeIcon className={cn("h-5 w-5", type.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-sm">{agent.name}</h4>
          <span className={cn("text-xs px-1.5 py-0.5 rounded", type.color, "bg-current/10")}>
            {type.label}
          </span>
        </div>
        {agent.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {agent.description}
          </p>
        )}
        {agent.lastRun && (
          <p className="text-xs text-muted-foreground mt-1">
            Last run: {new Date(agent.lastRun).toLocaleString()}
          </p>
        )}
      </div>

      <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full", status.bg)}>
        <StatusIcon className={cn(
          "h-3.5 w-3.5", 
          status.color,
          agent.status === 'running' && "animate-spin"
        )} />
        <span className={cn("text-xs font-medium", status.color)}>
          {status.label}
        </span>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  )
}

function AgentGroup({ 
  type, 
  agents, 
  onAgentClick 
}: { 
  type: AgentType
  agents: Agent[]
  onAgentClick?: (agent: Agent) => void 
}) {
  const config = typeConfig[type]
  
  if (agents.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        {config.label} Agents
        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {agents.length}
        </span>
      </h3>
      <div className="space-y-2">
        {agents.map((agent) => (
          <AgentRow
            key={agent.id}
            agent={agent}
            onClick={() => onAgentClick?.(agent)}
          />
        ))}
      </div>
    </div>
  )
}

export function AgentList({
  agents,
  isLoading,
  onAgentClick,
  groupByType = true,
}: AgentListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">No agents configured</p>
      </div>
    )
  }

  if (groupByType) {
    const adminAgents = agents.filter(a => a.type === 'admin')
    const projectAgents = agents.filter(a => a.type === 'project')
    const skillAgents = agents.filter(a => a.type === 'skill')

    return (
      <div className="space-y-6">
        <AgentGroup type="admin" agents={adminAgents} onAgentClick={onAgentClick} />
        <AgentGroup type="project" agents={projectAgents} onAgentClick={onAgentClick} />
        <AgentGroup type="skill" agents={skillAgents} onAgentClick={onAgentClick} />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          onClick={() => onAgentClick?.(agent)}
        />
      ))}
    </div>
  )
}
