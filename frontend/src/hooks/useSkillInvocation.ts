import { useState, useCallback } from "react"
import type { Artifact } from "../components/workshop/ArtifactCanvas"

const API_BASE = "http://localhost:3001"

export type InvocationStatus = 'idle' | 'starting' | 'running' | 'completed' | 'error'

export interface SkillInvocation {
  id: string
  skillId: string
  skillName: string
  task: string
  status: InvocationStatus
  progress?: number
  progressMessage?: string
  startedAt: string
  completedAt?: string
  artifact?: Artifact
  error?: string
}

interface UseSkillInvocationReturn {
  invocations: SkillInvocation[]
  currentInvocation: SkillInvocation | null
  invokeSkill: (skillId: string, skillName: string, task: string) => Promise<Artifact | null>
  cancelInvocation: (invocationId: string) => void
  clearInvocations: () => void
}

export function useSkillInvocation(): UseSkillInvocationReturn {
  const [invocations, setInvocations] = useState<SkillInvocation[]>([])
  const [currentInvocation, setCurrentInvocation] = useState<SkillInvocation | null>(null)

  const updateInvocation = useCallback((id: string, updates: Partial<SkillInvocation>) => {
    setInvocations(prev => prev.map(inv => 
      inv.id === id ? { ...inv, ...updates } : inv
    ))
    setCurrentInvocation(prev => 
      prev?.id === id ? { ...prev, ...updates } : prev
    )
  }, [])

  const invokeSkill = useCallback(async (
    skillId: string,
    skillName: string,
    task: string
  ): Promise<Artifact | null> => {
    const invocationId = `inv-${Date.now()}`
    
    const newInvocation: SkillInvocation = {
      id: invocationId,
      skillId,
      skillName,
      task,
      status: 'starting',
      startedAt: new Date().toISOString(),
    }

    setInvocations(prev => [...prev, newInvocation])
    setCurrentInvocation(newInvocation)

    try {
      updateInvocation(invocationId, { 
        status: 'running',
        progress: 0,
        progressMessage: 'Initializing skill agent...'
      })

      const response = await fetch(`${API_BASE}/api/skills/${skillId}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })

      if (!response.ok) {
        throw new Error('Failed to invoke skill')
      }

      updateInvocation(invocationId, {
        progress: 30,
        progressMessage: 'Processing task...'
      })

      const reader = response.body?.getReader()
      let result = ''

      if (reader) {
        const decoder = new TextDecoder()
        let done = false

        while (!done) {
          const { value, done: streamDone } = await reader.read()
          done = streamDone

          if (value) {
            const chunk = decoder.decode(value, { stream: true })
            result += chunk

            try {
              const lines = chunk.split('\n').filter(Boolean)
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = JSON.parse(line.slice(6))
                  if (data.progress) {
                    updateInvocation(invocationId, {
                      progress: data.progress,
                      progressMessage: data.message || 'Processing...'
                    })
                  }
                  if (data.result) {
                    result = data.result
                  }
                }
              }
            } catch {
              // Not JSON, just accumulate text
            }
          }
        }
      } else {
        const data = await response.json()
        result = data.result || data.content || ''
      }

      const artifact: Artifact = {
        id: `artifact-${skillId}-${Date.now()}`,
        version: 1,
        content: result,
        title: `${skillName}: ${task.slice(0, 50)}${task.length > 50 ? '...' : ''}`,
        createdAt: new Date().toISOString(),
        type: 'markdown',
      }

      updateInvocation(invocationId, {
        status: 'completed',
        progress: 100,
        progressMessage: 'Complete',
        completedAt: new Date().toISOString(),
        artifact,
      })

      return artifact
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      
      updateInvocation(invocationId, {
        status: 'error',
        error,
        completedAt: new Date().toISOString(),
      })

      return null
    }
  }, [updateInvocation])

  const cancelInvocation = useCallback((invocationId: string) => {
    updateInvocation(invocationId, {
      status: 'error',
      error: 'Cancelled by user',
      completedAt: new Date().toISOString(),
    })
    
    if (currentInvocation?.id === invocationId) {
      setCurrentInvocation(null)
    }
  }, [currentInvocation, updateInvocation])

  const clearInvocations = useCallback(() => {
    setInvocations([])
    setCurrentInvocation(null)
  }, [])

  return {
    invocations,
    currentInvocation,
    invokeSkill,
    cancelInvocation,
    clearInvocations,
  }
}
