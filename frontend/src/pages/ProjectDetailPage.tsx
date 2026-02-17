import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useProject } from "@/hooks/useProjects"
import { ProjectDetail } from "@/components/projects/ProjectDetail"
import { projectsApi } from "@/lib/api"
import { Loader2 } from "lucide-react"
import type { ChatMessage } from "@/components/workshop/AgentChatPanel"

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading, error, refetch } = useProject(id || '')
  
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [historyLoaded, setHistoryLoaded] = useState(false)

  // Load chat history when project loads
  useEffect(() => {
    if (!id || !project || historyLoaded) return
    
    const loadHistory = async () => {
      try {
        const history = await projectsApi.getChatHistory(id)
        if (history.messages.length > 0) {
          setChatMessages(history.messages.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp,
          })))
        }
        if (history.currentSessionId) {
          setSessionId(history.currentSessionId)
        }
      } catch {
        // No history available
      }
      setHistoryLoaded(true)
    }
    
    loadHistory()
  }, [id, project, historyLoaded])

  const handleUpdateSources = async (scopes: string[]) => {
    if (!id) return
    await projectsApi.updateSources(id, scopes)
    await refetch()
  }

  const handleSendChatMessage = async (message: string) => {
    if (!id) return
    
    // Add user message to chat
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    setChatMessages(prev => [...prev, userMessage])
    setIsChatLoading(true)

    try {
      const response = await projectsApi.chat(id, message, sessionId)
      setSessionId(response.sessionId)
      
      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_response`,
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
      }
      setChatMessages(prev => [...prev, assistantMessage])
    } catch (err) {
      // Add error message
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to send message'}`,
        timestamp: new Date().toISOString(),
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleSaveMemory = async () => {
    if (!id || chatMessages.length === 0) return
    
    // Generate a summary from recent messages
    const recentMessages = chatMessages.slice(-10)
    const summary = recentMessages
      .map(m => `**${m.role === 'user' ? 'User' : 'Agent'}:** ${m.content.slice(0, 200)}${m.content.length > 200 ? '...' : ''}`)
      .join('\n\n')
    
    try {
      await projectsApi.updateMemory(id, summary)
    } catch (err) {
      console.error('Failed to save memory:', err)
    }
  }

  const handleCreateAgent = async () => {
    if (!id) return
    try {
      await projectsApi.createAgent(id)
      await refetch()
    } catch (err) {
      console.error('Failed to create agent:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Project not found</p>
        <button 
          onClick={() => navigate('/projects')}
          className="text-sm text-primary hover:underline"
        >
          Back to projects
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ProjectDetail
        project={{
          id: project.id,
          name: project.name,
          path: project.rootPath || `/30_Projects/${project.name}`,
          status: project.status as 'active' | 'paused' | 'completed' | 'archived',
          description: project.description,
          hasAgent: (project.agentIds?.length || 0) > 0,
        }}
        tasks={[]}
        linkedScopes={project.linkedScopes || []}
        chatMessages={chatMessages}
        isChatLoading={isChatLoading}
        isLoading={isLoading}
        onBack={() => navigate('/projects')}
        onUpdateSources={handleUpdateSources}
        onSendChatMessage={handleSendChatMessage}
        onSaveMemory={handleSaveMemory}
        onCreateAgent={handleCreateAgent}
      />
    </div>
  )
}
