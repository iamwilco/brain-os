import { X, Keyboard } from "lucide-react"
import type { Shortcut } from "../../hooks/useKeyboardShortcuts"
import { cn } from "@/lib/utils"

interface ShortcutsHelpModalProps {
  isOpen: boolean
  onClose: () => void
  shortcuts: Shortcut[]
  formatShortcut: (key: string, modifiers: string[]) => string
}

const categoryLabels = {
  navigation: 'Navigation',
  actions: 'Actions',
  editing: 'Editing',
  general: 'General',
}

const categoryOrder: (keyof typeof categoryLabels)[] = ['navigation', 'actions', 'editing', 'general']

export function ShortcutsHelpModal({
  isOpen,
  onClose,
  shortcuts,
  formatShortcut,
}: ShortcutsHelpModalProps) {
  if (!isOpen) return null

  const groupedShortcuts = categoryOrder.reduce((acc, category) => {
    acc[category] = shortcuts.filter(s => s.category === category)
    return acc
  }, {} as Record<string, Shortcut[]>)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)] space-y-6">
          {categoryOrder.map((category) => {
            const categoryShortcuts = groupedShortcuts[category]
            if (!categoryShortcuts?.length) return null

            return (
              <div key={category}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  {categoryLabels[category]}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between py-1.5"
                    >
                      <span className="text-sm">{shortcut.description}</span>
                      <kbd className={cn(
                        "px-2 py-1 text-xs font-mono rounded",
                        "bg-muted border border-border"
                      )}>
                        {formatShortcut(shortcut.key, shortcut.modifiers)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-3 border-t border-border bg-muted/50">
          <p className="text-xs text-muted-foreground text-center">
            Press <kbd className="px-1 py-0.5 text-xs font-mono rounded bg-background border border-border">?</kbd> to toggle this dialog
          </p>
        </div>
      </div>
    </div>
  )
}
