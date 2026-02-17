import { useState } from "react"
import { 
  X,
  Bot,
  User,
  Wrench,
  Loader2,
  Plus,
  FolderOpen
} from "lucide-react"
import { cn } from "@/lib/utils"

type AgentType = 'admin' | 'project' | 'skill'

interface SpawnAgentDialogProps {
  isOpen: boolean
  onClose: () => void
  onSpawn: (config: AgentConfig) => Promise<void>
  availableScopes?: string[]
}

export interface AgentConfig {
  name: string
  type: AgentType
  scope: string
  description?: string
}

const typeOptions: { 
  value: AgentType
  label: string
  icon: typeof Bot
  description: string
  color: string
}[] = [
  { 
    value: 'admin', 
    label: 'Admin', 
    icon: User,
    description: 'Full vault access, coordinates other agents',
    color: 'text-purple-500 border-purple-500'
  },
  { 
    value: 'project', 
    label: 'Project', 
    icon: Bot,
    description: 'Scoped to a specific project folder',
    color: 'text-blue-500 border-blue-500'
  },
  { 
    value: 'skill', 
    label: 'Skill', 
    icon: Wrench,
    description: 'Stateless, specialized capabilities',
    color: 'text-orange-500 border-orange-500'
  },
]

export function SpawnAgentDialog({
  isOpen,
  onClose,
  onSpawn,
  availableScopes = [],
}: SpawnAgentDialogProps) {
  const [selectedType, setSelectedType] = useState<AgentType>('project')
  const [name, setName] = useState('')
  const [scope, setScope] = useState('')
  const [description, setDescription] = useState('')
  const [isSpawning, setIsSpawning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSpawn = async () => {
    if (!name.trim()) {
      setError('Agent name is required')
      return
    }
    
    if (selectedType === 'project' && !scope.trim()) {
      setError('Scope is required for project agents')
      return
    }

    setError(null)
    setIsSpawning(true)

    try {
      await onSpawn({
        name: name.trim(),
        type: selectedType,
        scope: scope.trim() || '/',
        description: description.trim() || undefined,
      })
      
      setName('')
      setScope('')
      setDescription('')
      setSelectedType('project')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to spawn agent')
    } finally {
      setIsSpawning(false)
    }
  }

  const handleClose = () => {
    if (isSpawning) return
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={handleClose}
      />
      <div className="relative bg-background border border-border rounded-lg shadow-lg p-6 max-w-lg w-full mx-4">
        <button
          onClick={handleClose}
          disabled={isSpawning}
          className="absolute top-4 right-4 p-1 rounded hover:bg-accent disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Spawn New Agent</h2>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">Agent Type</label>
            <div className="grid grid-cols-3 gap-2">
              {typeOptions.map((option) => {
                const Icon = option.icon
                const isSelected = selectedType === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => setSelectedType(option.value)}
                    disabled={isSpawning}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors",
                      isSelected ? option.color : "border-border hover:border-muted-foreground/50",
                      "disabled:opacity-50"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isSelected ? option.color.split(' ')[0] : "text-muted-foreground")} />
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {typeOptions.find(t => t.value === selectedType)?.description}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSpawning}
              placeholder="e.g., ProjectHelper, SEOAgent"
              className={cn(
                "w-full px-3 py-2 text-sm rounded-md border border-border",
                "bg-background focus:outline-none focus:ring-2 focus:ring-ring",
                "disabled:opacity-50"
              )}
            />
          </div>

          {selectedType === 'project' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                <FolderOpen className="h-4 w-4 inline mr-1" />
                Scope (Project Path)
              </label>
              {availableScopes.length > 0 ? (
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  disabled={isSpawning}
                  className={cn(
                    "w-full px-3 py-2 text-sm rounded-md border border-border",
                    "bg-background focus:outline-none focus:ring-2 focus:ring-ring",
                    "disabled:opacity-50"
                  )}
                >
                  <option value="">Select a project...</option>
                  {availableScopes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  disabled={isSpawning}
                  placeholder="e.g., 30_Projects/MyProject"
                  className={cn(
                    "w-full px-3 py-2 text-sm rounded-md border border-border",
                    "bg-background focus:outline-none focus:ring-2 focus:ring-ring",
                    "disabled:opacity-50"
                  )}
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSpawning}
              placeholder="What does this agent do?"
              rows={2}
              className={cn(
                "w-full px-3 py-2 text-sm rounded-md border border-border resize-none",
                "bg-background focus:outline-none focus:ring-2 focus:ring-ring",
                "disabled:opacity-50"
              )}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            disabled={isSpawning}
            className={cn(
              "px-4 py-2 text-sm rounded-md",
              "border border-border hover:bg-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={isSpawning || !name.trim()}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isSpawning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Spawning...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Spawn Agent
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
