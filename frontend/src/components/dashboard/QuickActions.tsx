import { 
  FileInput, 
  FolderPlus, 
  Search, 
  Play,
  Plus
} from "lucide-react"
import { cn } from "@/lib/utils"

interface QuickActionProps {
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
}

function QuickActionButton({ icon, label, description, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-4 rounded-lg border border-border bg-card",
        "hover:bg-accent hover:border-accent transition-colors text-left w-full",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="p-2 rounded-md bg-primary text-primary-foreground">
        {icon}
      </div>
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}

interface QuickActionsProps {
  onImportSource?: () => void
  onNewProject?: () => void
  onSearch?: () => void
  onRunExtraction?: () => void
}

export function QuickActions({
  onImportSource,
  onNewProject,
  onSearch,
  onRunExtraction,
}: QuickActionsProps) {
  return (
    <div className="p-6 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Quick Actions</h3>
        <Plus className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <QuickActionButton
          icon={<FileInput className="h-4 w-4" />}
          label="Import Source"
          description="Add ChatGPT, Claude, or folder"
          onClick={() => onImportSource?.()}
        />
        <QuickActionButton
          icon={<FolderPlus className="h-4 w-4" />}
          label="New Project"
          description="Create a new project"
          onClick={() => onNewProject?.()}
        />
        <QuickActionButton
          icon={<Search className="h-4 w-4" />}
          label="Search"
          description="Search knowledge base"
          onClick={() => onSearch?.()}
        />
        <QuickActionButton
          icon={<Play className="h-4 w-4" />}
          label="Run Extraction"
          description="Extract insights from sources"
          onClick={() => onRunExtraction?.()}
        />
      </div>
    </div>
  )
}
