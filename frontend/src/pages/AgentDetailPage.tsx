import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAgent } from "@/hooks/useAgents"
import { agentsApi } from "@/lib/api"
import { AgentDetail, type LogEntry } from "@/components/controlroom/AgentDetail"
import { Loader2 } from "lucide-react"

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: agentData, isLoading, error, refetch } = useAgent(id || '')
  const [configContent, setConfigContent] = useState<string>('')
  const [memoryContent, setMemoryContent] = useState<string>('')
  const [loadingContent, setLoadingContent] = useState(true)
  const fetchedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (id && fetchedIdRef.current !== id) {
      fetchedIdRef.current = id
      Promise.all([
        agentsApi.getConfig(id).catch(() => ({ content: '' })),
        agentsApi.getMemory(id).catch(() => ({ content: '' })),
      ]).then(([config, memory]) => {
        setConfigContent(config.content)
        setMemoryContent(memory.content)
        setLoadingContent(false)
      })
    }
  }, [id])

  if (isLoading || loadingContent) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !agentData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Agent not found</p>
        <button 
          onClick={() => navigate('/agents')}
          className="text-sm text-primary hover:underline"
        >
          Back to agents
        </button>
      </div>
    )
  }

  const agent = {
    id: agentData.id,
    name: agentData.name,
    type: agentData.type,
    status: agentData.status === 'error' ? 'error' as const : 
            agentData.status === 'running' ? 'running' as const : 'idle' as const,
    description: agentData.name,
    lastRun: agentData.lastRun ?? undefined,
    scope: Array.isArray(agentData.scope) ? agentData.scope.join(', ') : undefined,
  }

  const logs: LogEntry[] = []

  return (
    <AgentDetail
      agent={agent}
      configContent={configContent}
      memoryContent={memoryContent}
      logs={logs}
      isLoading={isLoading}
      onBack={() => navigate('/agents')}
      onSaveConfig={async (content) => {
        await agentsApi.saveConfig(agent.id, content)
        setConfigContent(content)
      }}
      onSaveMemory={async (content) => {
        await agentsApi.saveMemory(agent.id, content)
        setMemoryContent(content)
      }}
      onRunAgent={async () => {
        await agentsApi.run(agent.id)
        await refetch()
      }}
      onStopAgent={async () => {
        await agentsApi.restart(agent.id)
        await refetch()
      }}
    />
  )
}
