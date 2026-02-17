import { useState } from "react"
import { 
  PanelLeftClose,
  PanelRightClose,
  PanelLeft,
  PanelRight,
  Wrench,
  MessageSquare,
  Layers
} from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkshopLayoutProps {
  skillsPanel?: React.ReactNode
  canvas?: React.ReactNode
  chatPanel?: React.ReactNode
  projectName?: string
}

export function WorkshopLayout({
  skillsPanel,
  canvas,
  chatPanel,
  projectName,
}: WorkshopLayoutProps) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-primary" />
          <h1 className="font-semibold">Workshop</h1>
          {projectName && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm text-muted-foreground">{projectName}</span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            className={cn(
              "p-2 rounded-md transition-colors",
              leftPanelOpen ? "bg-accent" : "hover:bg-accent"
            )}
            title={leftPanelOpen ? "Hide Skills Panel" : "Show Skills Panel"}
          >
            {leftPanelOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            className={cn(
              "p-2 rounded-md transition-colors",
              rightPanelOpen ? "bg-accent" : "hover:bg-accent"
            )}
            title={rightPanelOpen ? "Hide Chat Panel" : "Show Chat Panel"}
          >
            {rightPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {leftPanelOpen && (
          <aside className="w-64 border-r border-border flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Skills</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {skillsPanel || (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Wrench className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No skills loaded</p>
                </div>
              )}
            </div>
          </aside>
        )}

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {canvas || (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Layers className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Canvas ready</p>
                <p className="text-xs mt-1">Drop content or use skills to begin</p>
              </div>
            )}
          </div>
        </main>

        {rightPanelOpen && (
          <aside className="w-80 border-l border-border flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Agent Chat</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {chatPanel || (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Chat with your agent</p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
