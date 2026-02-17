import { useRef, useEffect } from "react"
import { 
  X, 
  ExternalLink,
  FileText,
  MessageSquare,
  Tag,
  Calendar,
  MapPin
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { SearchResult, ResultType } from "./SearchResults"

interface SearchPreviewProps {
  result: SearchResult | null
  fullContent?: string
  onClose: () => void
  onOpenInObsidian?: (path: string) => void
}

const typeConfig: Record<ResultType, { icon: typeof FileText; label: string; color: string }> = {
  item: { icon: FileText, label: 'Item', color: 'text-blue-500' },
  source: { icon: MessageSquare, label: 'Source', color: 'text-green-500' },
  entity: { icon: Tag, label: 'Entity', color: 'text-purple-500' },
  chunk: { icon: FileText, label: 'Chunk', color: 'text-gray-500' },
}

function highlightMatches(content: string, highlights: string[]): React.ReactNode {
  if (!highlights.length) return content

  const parts: { text: string; highlighted: boolean }[] = []
  
  let lastIndex = 0
  highlights.forEach(highlight => {
    const index = content.toLowerCase().indexOf(highlight.toLowerCase(), lastIndex)
    if (index !== -1) {
      if (index > lastIndex) {
        parts.push({ text: content.slice(lastIndex, index), highlighted: false })
      }
      parts.push({ text: content.slice(index, index + highlight.length), highlighted: true })
      lastIndex = index + highlight.length
    }
  })
  
  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), highlighted: false })
  }

  if (parts.length === 0) return content

  return parts.map((part, i) => 
    part.highlighted ? (
      <mark 
        key={i} 
        id={i === 0 ? "first-match" : undefined}
        className="bg-yellow-200 dark:bg-yellow-900/50 text-inherit rounded px-0.5"
      >
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    )
  )
}

export function SearchPreview({
  result,
  fullContent,
  onClose,
  onOpenInObsidian,
}: SearchPreviewProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (result && contentRef.current) {
      const firstMatch = contentRef.current.querySelector('#first-match')
      if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [result, fullContent])

  if (!result) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a result to preview</p>
      </div>
    )
  }

  const config = typeConfig[result.type]
  const Icon = config.icon
  const content = fullContent || result.snippet

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between p-4 border-b border-border">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("p-2 rounded", config.color, "bg-current/10 shrink-0")}>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium truncate">{result.title}</h3>
            <p className="text-sm text-muted-foreground truncate">
              {result.source.path}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded hover:bg-accent shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 border-b border-border space-y-2">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className={cn("px-2 py-0.5 rounded text-xs", config.color, "bg-current/10")}>
              {config.label}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate max-w-[150px]">{result.source.name}</span>
          </div>
          
          {result.createdAt && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{new Date(result.createdAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {onOpenInObsidian && (
          <button
            onClick={() => onOpenInObsidian(result.source.path)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md",
              "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <ExternalLink className="h-4 w-4" />
            Open in Obsidian
          </button>
        )}
      </div>

      <div 
        ref={contentRef}
        className="flex-1 overflow-y-auto p-4"
      >
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {highlightMatches(content, result.highlights)}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-border bg-muted/50">
        <p className="text-xs text-muted-foreground text-center">
          {Math.round(result.score * 100)}% match score
        </p>
      </div>
    </div>
  )
}
