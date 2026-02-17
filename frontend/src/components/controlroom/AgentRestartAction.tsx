import { useState } from "react"
import { 
  RefreshCw,
  AlertTriangle,
  X,
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"

interface AgentRestartActionProps {
  agentId: string
  agentName: string
  onRestart: (agentId: string) => Promise<void>
  onStatusChange?: (status: 'idle' | 'restarting' | 'running') => void
  disabled?: boolean
  variant?: 'button' | 'icon'
}

interface ConfirmDialogProps {
  isOpen: boolean
  agentName: string
  isRestarting: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ 
  isOpen, 
  agentName, 
  isRestarting,
  onConfirm, 
  onCancel 
}: ConfirmDialogProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onCancel}
      />
      <div className="relative bg-background border border-border rounded-lg shadow-lg p-6 max-w-md w-full mx-4">
        <button
          onClick={onCancel}
          disabled={isRestarting}
          className="absolute top-4 right-4 p-1 rounded hover:bg-accent disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <AlertTriangle className="h-6 w-6 text-yellow-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Restart Agent?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Are you sure you want to restart <strong>{agentName}</strong>? 
              This will stop any running tasks and reinitialize the agent.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={isRestarting}
            className={cn(
              "px-4 py-2 text-sm rounded-md",
              "border border-border hover:bg-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRestarting}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
              "bg-yellow-600 text-white hover:bg-yellow-700",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isRestarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Restarting...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Restart
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export function AgentRestartAction({
  agentId,
  agentName,
  onRestart,
  onStatusChange,
  disabled = false,
  variant = 'button',
}: AgentRestartActionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)

  const handleRestart = async () => {
    setIsRestarting(true)
    onStatusChange?.('restarting')
    
    try {
      await onRestart(agentId)
      onStatusChange?.('running')
    } catch {
      onStatusChange?.('idle')
    } finally {
      setIsRestarting(false)
      setIsDialogOpen(false)
    }
  }

  if (variant === 'icon') {
    return (
      <>
        <button
          onClick={() => setIsDialogOpen(true)}
          disabled={disabled || isRestarting}
          title="Restart agent"
          className={cn(
            "p-2 rounded-md hover:bg-accent",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <RefreshCw className={cn(
            "h-4 w-4",
            isRestarting && "animate-spin"
          )} />
        </button>
        
        <ConfirmDialog
          isOpen={isDialogOpen}
          agentName={agentName}
          isRestarting={isRestarting}
          onConfirm={handleRestart}
          onCancel={() => setIsDialogOpen(false)}
        />
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => setIsDialogOpen(true)}
        disabled={disabled || isRestarting}
        className={cn(
          "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
          "border border-border hover:bg-accent",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <RefreshCw className={cn(
          "h-4 w-4",
          isRestarting && "animate-spin"
        )} />
        {isRestarting ? 'Restarting...' : 'Restart'}
      </button>
      
      <ConfirmDialog
        isOpen={isDialogOpen}
        agentName={agentName}
        isRestarting={isRestarting}
        onConfirm={handleRestart}
        onCancel={() => setIsDialogOpen(false)}
      />
    </>
  )
}
