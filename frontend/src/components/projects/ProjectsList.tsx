import { useState } from "react"
import { 
  LayoutGrid,
  List,
  Folder,
  FolderOpen,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ChevronRight,
  FileText,
  Link2
} from "lucide-react"
import { cn } from "@/lib/utils"

export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived'

export interface Project {
  id: string
  name: string
  path: string
  status: ProjectStatus
  description?: string
  itemCount?: number
  linkedNotes?: number
  lastActivity?: string
  hasAgent?: boolean
}

interface ProjectsListProps {
  projects: Project[]
  isLoading?: boolean
  onProjectClick?: (project: Project) => void
  defaultView?: 'grid' | 'list'
}

const statusConfig: Record<ProjectStatus, { 
  icon: typeof CheckCircle
  label: string
  color: string
  bg: string 
}> = {
  active: { 
    icon: Clock, 
    label: 'Active', 
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/30'
  },
  paused: { 
    icon: AlertCircle, 
    label: 'Paused', 
    color: 'text-yellow-600',
    bg: 'bg-yellow-100 dark:bg-yellow-900/30'
  },
  completed: { 
    icon: CheckCircle, 
    label: 'Completed', 
    color: 'text-green-600',
    bg: 'bg-green-100 dark:bg-green-900/30'
  },
  archived: { 
    icon: Folder, 
    label: 'Archived', 
    color: 'text-muted-foreground',
    bg: 'bg-muted'
  },
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full", config.bg)}>
      <Icon className={cn("h-3 w-3", config.color)} />
      <span className={cn("text-xs font-medium", config.color)}>
        {config.label}
      </span>
    </div>
  )
}

function ProjectCard({ project, onClick }: { project: Project; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col p-4 rounded-lg border border-border",
        "hover:bg-accent transition-colors text-left h-full",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <StatusBadge status={project.status} />
      </div>

      <h3 className="font-medium text-sm mb-1">{project.name}</h3>
      {project.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {project.description}
        </p>
      )}

      <div className="mt-auto pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
        {project.itemCount !== undefined && (
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {project.itemCount} items
          </span>
        )}
        {project.linkedNotes !== undefined && (
          <span className="flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            {project.linkedNotes} notes
          </span>
        )}
        {project.hasAgent && (
          <span className="text-primary font-medium">Agent</span>
        )}
      </div>
    </button>
  )
}

function ProjectRow({ project, onClick }: { project: Project; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded-lg border border-border",
        "hover:bg-accent transition-colors text-left",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="p-2 rounded-lg bg-primary/10">
        <FolderOpen className="h-5 w-5 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">{project.name}</h3>
          {project.hasAgent && (
            <span className="text-xs text-primary font-medium px-1.5 py-0.5 bg-primary/10 rounded">
              Agent
            </span>
          )}
        </div>
        {project.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {project.description}
          </p>
        )}
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span>{project.path}</span>
          {project.lastActivity && (
            <span>Last active: {new Date(project.lastActivity).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {project.itemCount !== undefined && (
          <span className="text-xs text-muted-foreground">
            {project.itemCount} items
          </span>
        )}
        <StatusBadge status={project.status} />
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  )
}

export function ProjectsList({
  projects,
  isLoading,
  onProjectClick,
  defaultView = 'grid',
}: ProjectsListProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(defaultView)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </span>
        
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              "p-1.5 rounded",
              viewMode === 'grid' 
                ? "bg-background shadow-sm" 
                : "hover:bg-background/50"
            )}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "p-1.5 rounded",
              viewMode === 'list' 
                ? "bg-background shadow-sm" 
                : "hover:bg-background/50"
            )}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Folder className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">No projects yet</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => onProjectClick?.(project)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onClick={() => onProjectClick?.(project)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
