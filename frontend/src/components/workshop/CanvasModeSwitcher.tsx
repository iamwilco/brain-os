import { 
  FileText,
  Lightbulb,
  CheckSquare,
  Eye
} from "lucide-react"
import { cn } from "@/lib/utils"

export type CanvasMode = 'document' | 'brainstorm' | 'tasks' | 'review'

interface CanvasModeSwitcherProps {
  currentMode: CanvasMode
  onModeChange: (mode: CanvasMode) => void
  disabled?: boolean
}

const modes: { 
  id: CanvasMode
  label: string
  icon: typeof FileText
  description: string 
}[] = [
  { 
    id: 'document', 
    label: 'Document', 
    icon: FileText,
    description: 'Write and edit content'
  },
  { 
    id: 'brainstorm', 
    label: 'Brainstorm', 
    icon: Lightbulb,
    description: 'Generate and explore ideas'
  },
  { 
    id: 'tasks', 
    label: 'Tasks', 
    icon: CheckSquare,
    description: 'Plan and track work'
  },
  { 
    id: 'review', 
    label: 'Review', 
    icon: Eye,
    description: 'Analyze and refine'
  },
]

export function CanvasModeSwitcher({
  currentMode,
  onModeChange,
  disabled,
}: CanvasModeSwitcherProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {modes.map((mode) => {
        const Icon = mode.icon
        const isActive = currentMode === mode.id

        return (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            disabled={disabled}
            title={mode.description}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
              isActive 
                ? "bg-background shadow-sm font-medium" 
                : "hover:bg-background/50 text-muted-foreground",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function CanvasModeSelector({
  currentMode,
  onModeChange,
}: CanvasModeSwitcherProps) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {modes.map((mode) => {
        const Icon = mode.icon
        const isActive = currentMode === mode.id

        return (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-lg border text-center transition-colors",
              isActive 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50 hover:bg-accent"
            )}
          >
            <div className={cn(
              "p-2 rounded-lg",
              isActive ? "bg-primary/10" : "bg-muted"
            )}>
              <Icon className={cn(
                "h-5 w-5",
                isActive ? "text-primary" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <p className={cn(
                "text-sm font-medium",
                isActive && "text-primary"
              )}>
                {mode.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {mode.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
