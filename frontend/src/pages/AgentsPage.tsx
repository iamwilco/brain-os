import { useNavigate } from "react-router-dom"
import { AgentList, type Agent } from "@/components/controlroom/AgentList"
import { useAgents } from "@/hooks/useAgents"

export function AgentsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useAgents()

  const agents: Agent[] = (data?.data ?? []).map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    status: a.status === 'error' ? 'error' : a.status === 'running' ? 'running' : 'idle',
    description: a.name,
    lastRun: a.lastRun ?? undefined,
    scope: Array.isArray(a.scope) ? a.scope.join(', ') : undefined,
  }))

  return (
    <div className="space-y-6">
      <AgentList 
        agents={agents}
        isLoading={isLoading}
        onAgentClick={(agent) => navigate(`/agents/${agent.id}`)}
      />
    </div>
  )
}
