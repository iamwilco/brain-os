import { useEffect, useState } from "react"
import { Command } from "cmdk"
import { 
  Home, 
  FolderKanban, 
  Bot, 
  Search, 
  Database, 
  Settings,
  FileText,
  Plus,
  Play
} from "lucide-react"

interface CommandPaletteProps {
  onNavigate?: (path: string) => void
  onAction?: (action: string) => void
}

export function CommandPalette({ onNavigate, onAction }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)

  // Toggle with Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const handleSelect = (value: string) => {
    setOpen(false)
    
    if (value.startsWith("nav:")) {
      onNavigate?.(value.replace("nav:", ""))
    } else if (value.startsWith("action:")) {
      onAction?.(value.replace("action:", ""))
    }
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command Palette"
      className="fixed inset-0 z-50"
    >
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50" 
        onClick={() => setOpen(false)}
      />
      
      {/* Dialog */}
      <div className="fixed left-1/2 top-1/4 -translate-x-1/2 w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden">
        <Command.Input 
          placeholder="Type a command or search..."
          className="w-full px-4 py-3 text-sm bg-transparent border-b border-border outline-none placeholder:text-muted-foreground"
        />
        
        <Command.List className="max-h-80 overflow-auto p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            No results found.
          </Command.Empty>

          {/* Navigation */}
          <Command.Group heading="Navigation" className="text-xs text-muted-foreground px-2 py-1.5">
            <Command.Item
              value="nav:/"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <Home className="h-4 w-4" />
              <span>Dashboard</span>
            </Command.Item>
            <Command.Item
              value="nav:/projects"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <FolderKanban className="h-4 w-4" />
              <span>Projects</span>
            </Command.Item>
            <Command.Item
              value="nav:/agents"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <Bot className="h-4 w-4" />
              <span>Agents</span>
            </Command.Item>
            <Command.Item
              value="nav:/search"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <Search className="h-4 w-4" />
              <span>Search</span>
            </Command.Item>
            <Command.Item
              value="nav:/sources"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <Database className="h-4 w-4" />
              <span>Sources</span>
            </Command.Item>
            <Command.Item
              value="nav:/settings"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </Command.Item>
          </Command.Group>

          {/* Actions */}
          <Command.Group heading="Actions" className="text-xs text-muted-foreground px-2 py-1.5 mt-2">
            <Command.Item
              value="action:new-project"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <Plus className="h-4 w-4" />
              <span>New Project</span>
            </Command.Item>
            <Command.Item
              value="action:import-source"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <FileText className="h-4 w-4" />
              <span>Import Source</span>
            </Command.Item>
            <Command.Item
              value="action:run-agent"
              onSelect={handleSelect}
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-md cursor-pointer data-[selected=true]:bg-accent"
            >
              <Play className="h-4 w-4" />
              <span>Run Agent</span>
            </Command.Item>
          </Command.Group>
        </Command.List>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground border-t border-border">
          <span>Type to search</span>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↑↓</kbd>
            <span>Navigate</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↵</kbd>
            <span>Select</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Esc</kbd>
            <span>Close</span>
          </div>
        </div>
      </div>
    </Command.Dialog>
  )
}
