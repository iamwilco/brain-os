import { useState } from "react"
import { 
  Sparkles,
  Loader2,
  Package,
  ArrowRight
} from "lucide-react"
import { cn } from "@/lib/utils"

const API_BASE = "http://localhost:3001"

interface OpenInWorkshopButtonProps {
  projectId: string
  projectName: string
  projectPath: string
  onOpenWorkshop?: (contextPackId: string) => void
  variant?: 'default' | 'compact'
  className?: string
}

interface ContextPack {
  id: string
  projectId: string
  projectName: string
  createdAt: string
  itemCount: number
  size: number
}

type ButtonState = 'idle' | 'generating' | 'ready' | 'error'

export function OpenInWorkshopButton({
  projectId,
  projectName,
  projectPath,
  onOpenWorkshop,
  variant = 'default',
  className,
}: OpenInWorkshopButtonProps) {
  const [state, setState] = useState<ButtonState>('idle')
  const [contextPack, setContextPack] = useState<ContextPack | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    if (state === 'ready' && contextPack) {
      onOpenWorkshop?.(contextPack.id)
      return
    }

    setState('generating')
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/api/context-packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName,
          scope: projectPath,
          includeLinkedNotes: true,
          includeAgentMemory: true,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate context pack')
      }

      const pack = await response.json()
      
      setContextPack({
        id: pack.id || `pack-${Date.now()}`,
        projectId,
        projectName,
        createdAt: new Date().toISOString(),
        itemCount: pack.itemCount || 0,
        size: pack.size || 0,
      })
      
      setState('ready')
      
      setTimeout(() => {
        onOpenWorkshop?.(pack.id || `pack-${Date.now()}`)
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate context pack')
      setState('error')
    }
  }

  const handleRetry = () => {
    setState('idle')
    setError(null)
    setContextPack(null)
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={state === 'error' ? handleRetry : handleClick}
        disabled={state === 'generating'}
        title={state === 'error' ? 'Retry' : 'Open in Workshop'}
        className={cn(
          "p-2 rounded-md transition-colors",
          state === 'error'
            ? "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30"
            : "bg-primary/10 text-primary hover:bg-primary/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className
        )}
      >
        {state === 'generating' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === 'ready' ? (
          <ArrowRight className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </button>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <button
        onClick={state === 'error' ? handleRetry : handleClick}
        disabled={state === 'generating'}
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-md transition-colors w-full justify-center",
          state === 'error'
            ? "bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30"
            : state === 'ready'
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {state === 'generating' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Generating Context Pack...</span>
          </>
        ) : state === 'ready' ? (
          <>
            <ArrowRight className="h-4 w-4" />
            <span>Open Workshop</span>
          </>
        ) : state === 'error' ? (
          <>
            <Sparkles className="h-4 w-4" />
            <span>Retry</span>
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            <span>Open in Workshop</span>
          </>
        )}
      </button>

      {state === 'ready' && contextPack && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-muted text-xs">
          <Package className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">
            Context pack ready • {contextPack.itemCount} items
          </span>
        </div>
      )}

      {state === 'error' && error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
