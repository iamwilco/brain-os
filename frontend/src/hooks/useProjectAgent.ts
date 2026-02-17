import { useState, useCallback } from "react"

const API_BASE = "http://localhost:3001"

export interface ProjectAgentConfig {
  projectName: string
  projectPath: string
  description?: string
}

export interface SpawnedAgent {
  id: string
  name: string
  type: 'project'
  scope: string
  status: 'idle' | 'running' | 'error'
  createdAt: string
}

interface UseProjectAgentReturn {
  spawnAgent: (config: ProjectAgentConfig) => Promise<SpawnedAgent>
  registerAgent: (agent: SpawnedAgent) => Promise<void>
  isSpawning: boolean
  error: string | null
}

export function useProjectAgent(): UseProjectAgentReturn {
  const [isSpawning, setIsSpawning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const spawnAgent = useCallback(async (config: ProjectAgentConfig): Promise<SpawnedAgent> => {
    setIsSpawning(true)
    setError(null)

    try {
      const agentId = `agent-${config.projectName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
      const agentName = `${config.projectName} Agent`
      
      const response = await fetch(`${API_BASE}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: agentId,
          name: agentName,
          type: 'project',
          scope: config.projectPath,
          description: config.description || `AI agent for ${config.projectName} project`,
          config: {
            projectName: config.projectName,
            projectPath: config.projectPath,
            autoStart: false,
          },
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to spawn agent')
      }

      const agent = await response.json()
      
      return {
        id: agent.id || agentId,
        name: agent.name || agentName,
        type: 'project',
        scope: config.projectPath,
        status: 'idle',
        createdAt: new Date().toISOString(),
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to spawn agent'
      setError(message)
      throw err
    } finally {
      setIsSpawning(false)
    }
  }, [])

  const registerAgent = useCallback(async (agent: SpawnedAgent): Promise<void> => {
    try {
      await fetch(`${API_BASE}/api/control-room/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          name: agent.name,
          type: agent.type,
          scope: agent.scope,
          status: agent.status,
          registeredAt: new Date().toISOString(),
        }),
      })
    } catch (err) {
      console.error('Failed to register agent in Control Room:', err)
    }
  }, [])

  return {
    spawnAgent,
    registerAgent,
    isSpawning,
    error,
  }
}

export async function spawnProjectAgent(config: ProjectAgentConfig): Promise<SpawnedAgent> {
  const agentId = `agent-${config.projectName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
  const agentName = `${config.projectName} Agent`

  const response = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: agentId,
      name: agentName,
      type: 'project',
      scope: config.projectPath,
      description: config.description || `AI agent for ${config.projectName} project`,
      config: {
        projectName: config.projectName,
        projectPath: config.projectPath,
        autoStart: false,
      },
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to spawn project agent')
  }

  const agent = await response.json()

  const spawnedAgent: SpawnedAgent = {
    id: agent.id || agentId,
    name: agent.name || agentName,
    type: 'project',
    scope: config.projectPath,
    status: 'idle',
    createdAt: new Date().toISOString(),
  }

  await fetch(`${API_BASE}/api/control-room/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: spawnedAgent.id,
      name: spawnedAgent.name,
      type: spawnedAgent.type,
      scope: spawnedAgent.scope,
      status: spawnedAgent.status,
      registeredAt: spawnedAgent.createdAt,
    }),
  }).catch(console.error)

  return spawnedAgent
}
