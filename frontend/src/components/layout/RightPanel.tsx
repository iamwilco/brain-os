import { cn } from "@/lib/utils"
import { X, PanelRightOpen } from "lucide-react"

interface RightPanelProps {
  open: boolean
  onToggle: () => void
  title?: string
  children?: React.ReactNode
}

export function RightPanel({ open, onToggle, title, children }: RightPanelProps) {
  return (
    <>
      {/* Toggle button when closed */}
      {!open && (
        <button
          onClick={onToggle}
          className="fixed right-4 top-4 p-2 rounded-md bg-card border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors z-10"
          aria-label="Open panel"
        >
          <PanelRightOpen className="h-5 w-5" />
        </button>
      )}

      {/* Panel */}
      <aside
        className={cn(
          "flex flex-col h-full bg-card border-l border-border transition-all duration-300",
          open ? "w-80" : "w-0 overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b border-border">
          <span className="font-medium text-sm">{title || "Details"}</span>
          <button
            onClick={onToggle}
            className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {children}
        </div>
      </aside>
    </>
  )
}
