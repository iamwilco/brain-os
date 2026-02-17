import { useState } from "react"
import { 
  X, 
  FolderPlus,
  Check,
  Loader2,
  Search
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface Project {
  id: string
  name: string
  description?: string
  itemCount: number
}

interface AddToProjectModalProps {
  isOpen: boolean
  onClose: () => void
  projects: Project[]
  isLoading?: boolean
  onAddToProject: (projectId: string) => Promise<void>
  onCreateProject?: () => void
  itemTitle?: string
}

export function AddToProjectModal({
  isOpen,
  onClose,
  projects,
  isLoading,
  onAddToProject,
  onCreateProject,
  itemTitle,
}: AddToProjectModalProps) {
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  if (!isOpen) return null

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async () => {
    if (!selectedId) return
    setIsAdding(true)
    try {
      await onAddToProject(selectedId)
      onClose()
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md mx-4 bg-background rounded-lg shadow-lg border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-semibold">Add to Project</h2>
            {itemTitle && (
              <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                {itemTitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className={cn(
                "w-full pl-9 pr-4 py-2 text-sm rounded-md",
                "bg-muted border-0",
                "focus:outline-none focus:ring-2 focus:ring-ring"
              )}
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">
                {search ? "No projects found" : "No projects yet"}
              </p>
              {onCreateProject && (
                <button
                  onClick={onCreateProject}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <FolderPlus className="h-4 w-4" />
                  Create Project
                </button>
              )}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedId(project.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors",
                    selectedId === project.id
                      ? "bg-primary/10 border border-primary"
                      : "hover:bg-accent border border-transparent"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{project.name}</p>
                    {project.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {project.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {project.itemCount} items
                    </p>
                  </div>
                  {selectedId === project.id && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/50">
          {onCreateProject && filteredProjects.length > 0 && (
            <button
              onClick={onCreateProject}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              + New Project
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedId || isAdding}
              className={cn(
                "px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md",
                "hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
                "flex items-center gap-2"
              )}
            >
              {isAdding && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to Project
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
