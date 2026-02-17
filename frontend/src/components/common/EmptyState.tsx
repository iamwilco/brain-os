import { 
  Inbox,
  Search,
  FolderOpen,
  FileText,
  Users,
  Bot,
  Package,
  Plus
} from "lucide-react"
import { cn } from "@/lib/utils"

type EmptyStateType = 
  | 'default'
  | 'search'
  | 'projects'
  | 'sources'
  | 'items'
  | 'agents'
  | 'artifacts'

interface EmptyStateProps {
  type?: EmptyStateType
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

const emptyStateConfig: Record<EmptyStateType, {
  icon: typeof Inbox
  defaultTitle: string
  defaultDescription: string
}> = {
  default: {
    icon: Inbox,
    defaultTitle: 'Nothing here yet',
    defaultDescription: 'Get started by adding your first item.',
  },
  search: {
    icon: Search,
    defaultTitle: 'No results found',
    defaultDescription: 'Try adjusting your search terms or filters.',
  },
  projects: {
    icon: FolderOpen,
    defaultTitle: 'No projects yet',
    defaultDescription: 'Create a project to organize your knowledge and work with AI agents.',
  },
  sources: {
    icon: Package,
    defaultTitle: 'No sources imported',
    defaultDescription: 'Import conversations from ChatGPT, Claude, or other sources to extract knowledge.',
  },
  items: {
    icon: FileText,
    defaultTitle: 'No items extracted',
    defaultDescription: 'Run extraction on your sources to discover insights, decisions, and learnings.',
  },
  agents: {
    icon: Bot,
    defaultTitle: 'No agents running',
    defaultDescription: 'Spawn an agent to help you with research, writing, or other tasks.',
  },
  artifacts: {
    icon: Users,
    defaultTitle: 'No artifacts yet',
    defaultDescription: 'Artifacts will appear here as you work with the agent.',
  },
}

export function EmptyState({
  type = 'default',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const config = emptyStateConfig[type]
  const Icon = config.icon

  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-12 px-4 text-center",
      className
    )}>
      <div className="p-4 rounded-full bg-muted mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      
      <h3 className="text-lg font-medium mb-1">
        {title || config.defaultTitle}
      </h3>
      
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        {description || config.defaultDescription}
      </p>

      {action && (
        <button
          onClick={action.onClick}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md",
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          <Plus className="h-4 w-4" />
          {action.label}
        </button>
      )}
    </div>
  )
}

interface EmptySearchProps {
  query: string
  onClear?: () => void
}

export function EmptySearch({ query, onClear }: EmptySearchProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="p-4 rounded-full bg-muted mb-4">
        <Search className="h-8 w-8 text-muted-foreground" />
      </div>
      
      <h3 className="text-lg font-medium mb-1">
        No results for "{query}"
      </h3>
      
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        We couldn't find anything matching your search. Try different keywords or check your filters.
      </p>

      {onClear && (
        <button
          onClick={onClear}
          className="text-sm text-primary hover:underline"
        >
          Clear search
        </button>
      )}
    </div>
  )
}
