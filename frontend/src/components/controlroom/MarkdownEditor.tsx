import { useEffect, useRef, useState, useCallback } from "react"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from "@codemirror/language"
import { Loader2, Save } from "lucide-react"
import { cn } from "@/lib/utils"

interface MarkdownEditorProps {
  value: string
  onChange?: (value: string) => void
  onSave?: (value: string) => Promise<void>
  readOnly?: boolean
  placeholder?: string
  className?: string
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "12px 0",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "hsl(var(--muted-foreground))",
    fontSize: "12px",
    minWidth: "32px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--accent))",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--accent) / 0.5)",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "hsl(var(--foreground))",
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "hsl(var(--accent))",
  },
  ".cm-placeholder": {
    color: "hsl(var(--muted-foreground))",
  },
})

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  readOnly = false,
  placeholder = "Enter markdown content...",
  className,
}: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const initialValueRef = useRef(value)

  useEffect(() => {
    if (!editorRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newValue = update.state.doc.toString()
        onChange?.(newValue)
        setHasChanges(newValue !== initialValueRef.current)
      }
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        editorTheme,
        updateListener,
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
        EditorView.contentAttributes.of({ "aria-label": "Markdown editor" }),
        placeholder ? EditorView.domEventHandlers({}) : [],
      ].flat(),
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentValue = view.state.doc.toString()
    if (currentValue !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentValue.length,
          insert: value,
        },
      })
      initialValueRef.current = value
      setHasChanges(false)
    }
  }, [value])

  const handleSave = useCallback(async () => {
    if (!onSave || !viewRef.current) return
    
    const content = viewRef.current.state.doc.toString()
    setIsSaving(true)
    try {
      await onSave(content)
      initialValueRef.current = content
      setHasChanges(false)
    } finally {
      setIsSaving(false)
    }
  }, [onSave])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        if (hasChanges && onSave) {
          handleSave()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [hasChanges, onSave, handleSave])

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div
        ref={editorRef}
        className={cn(
          "flex-1 min-h-0 overflow-hidden rounded-lg border border-border",
          "bg-muted/30 focus-within:ring-2 focus-within:ring-ring"
        )}
      />
      
      {onSave && !readOnly && (
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-muted-foreground">
            {hasChanges ? (
              <span className="text-yellow-600">Unsaved changes</span>
            ) : (
              <span>No changes</span>
            )}
            <span className="ml-2 opacity-60">⌘S to save</span>
          </div>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm rounded-md",
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </button>
        </div>
      )}
    </div>
  )
}
