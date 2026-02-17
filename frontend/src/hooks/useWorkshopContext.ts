import { useState, useEffect, useCallback } from "react"
import type { ContextItem, MemoryHighlight, ContextScope } from "../components/workshop/ContextSummary"

const API_BASE = "http://localhost:3001"

export interface ContextPack {
  id: string
  projectId: string
  scope: ContextScope
  items: ContextItem[]
  memories: MemoryHighlight[]
  tokenCount: number
  maxTokens: number
  generatedAt: string
}

interface UseWorkshopContextReturn {
  contextPack: ContextPack | null
  isLoading: boolean
  error: string | null
  generateContextPack: (projectId: string, scope?: ContextScope) => Promise<ContextPack | null>
  loadIntoAgent: (agentId: string) => Promise<boolean>
  refresh: () => Promise<void>
}

export function useWorkshopContext(projectId?: string): UseWorkshopContextReturn {
  const [contextPack, setContextPack] = useState<ContextPack | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateContextPack = useCallback(async (
    targetProjectId: string,
    scope?: ContextScope
  ): Promise<ContextPack | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/projects/${targetProjectId}/context-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate context pack')
      }

      const data = await response.json()
      
      const pack: ContextPack = {
        id: data.id || `cp-${Date.now()}`,
        projectId: targetProjectId,
        scope: scope || { type: 'project', value: targetProjectId },
        items: data.items || [],
        memories: data.memories || [],
        tokenCount: data.tokenCount || 0,
        maxTokens: data.maxTokens || 128000,
        generatedAt: new Date().toISOString(),
      }

      setContextPack(pack)
      return pack
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadIntoAgent = useCallback(async (agentId: string): Promise<boolean> => {
    if (!contextPack) {
      setError('No context pack to load')
      return false
    }

    try {
      const response = await fetch(`${API_BASE}/api/agents/${agentId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextPackId: contextPack.id,
          items: contextPack.items,
          memories: contextPack.memories,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to load context into agent')
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      return false
    }
  }, [contextPack])

  const refresh = useCallback(async () => {
    if (projectId) {
      await generateContextPack(projectId, contextPack?.scope)
    }
  }, [projectId, contextPack?.scope, generateContextPack])

  useEffect(() => {
    if (projectId && !contextPack) {
      generateContextPack(projectId)
    }
  }, [projectId, contextPack, generateContextPack])

  return {
    contextPack,
    isLoading,
    error,
    generateContextPack,
    loadIntoAgent,
    refresh,
  }
}
