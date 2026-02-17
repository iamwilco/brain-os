import { useAgents } from "@/hooks/useAgents"
import { Bot, Loader2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Agent } from "@/lib/api"

interface AgentCardProps {
  agent: Agent
  onClick?: (agent: Agent) => void
}

function AgentCard({ agent, onClick }: AgentCardProps) {
  const statusColors = {
    idle: "bg-green-500",
    running: "bg-yellow-500",
    error: "bg-red-500",
  }

  const statusLabels = {
    idle: "Idle",
    running: "Running",
    error: "Error",
  }

  const typeLabels = {
    admin: "Admin",
    project: "Project",
    skill: "Skill",
  }

  return (
    <button
      onClick={() => onClick?.(agent)}
      className={cn(
        "flex flex-col p-4 rounded-lg border border-border bg-card",
        "hover:bg-accent transition-colors text-left",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-md bg-muted">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-sm">{agent.name}</p>
            <p className="text-xs text-muted-foreground">
              {typeLabels[agent.type]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn("w-2 h-2 rounded-full", statusColors[agent.status])} />
          <span className="text-xs text-muted-foreground">
            {statusLabels[agent.status]}
          </span>
        </div>
      </div>

      {agent.lastError && agent.status === "error" && (
        <div className="flex items-start gap-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{agent.lastError}</span>
        </div>
      )}

      {agent.lastRun && (
        <p className="text-xs text-muted-foreground mt-2">
          Last run: {new Date(agent.lastRun).toLocaleString()}
        </p>
      )}
    </button>
  )
}

interface AgentStatusGridProps {
  onAgentClick?: (agent: Agent) => void
}

export function AgentStatusGrid({ onAgentClick }: AgentStatusGridProps) {
  const { data, isLoading, error } = useAgents()

  if (error) {
    return (
      <div className="p-6 rounded-lg border border-border bg-card">
        <h3 className="font-medium mb-4">Agents</h3>
        <p className="text-sm text-muted-foreground">
          Unable to load agents. Make sure the backend is running.
        </p>
      </div>
    )
  }

  const agents = data?.data || []

  return (
    <div className="p-6 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Agents</h3>
        {agents.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {agents.filter((a) => a.status === "running").length} running
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No agents found
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onClick={onAgentClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
