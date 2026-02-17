import { 
  FileText, 
  MessageSquare, 
  Tag,
  Loader2,
  Search
} from "lucide-react"
import { cn } from "@/lib/utils"

export type ResultType = 'item' | 'source' | 'entity' | 'chunk'

export interface SearchResult {
  id: string
  type: ResultType
  title: string
  snippet: string
  highlights: string[]
  source: {
    path: string
    name: string
  }
  score: number
  createdAt?: string
}

interface SearchResultsProps {
  results: SearchResult[]
  query: string
  isLoading?: boolean
  totalCount?: number
  onResultClick?: (result: SearchResult) => void
}

interface ResultCardProps {
  result: SearchResult
  query: string
  onClick?: () => void
}

const typeConfig: Record<ResultType, { icon: typeof FileText; label: string; color: string }> = {
  item: { icon: FileText, label: 'Item', color: 'text-blue-500' },
  source: { icon: MessageSquare, label: 'Source', color: 'text-green-500' },
  entity: { icon: Tag, label: 'Entity', color: 'text-purple-500' },
  chunk: { icon: FileText, label: 'Chunk', color: 'text-gray-500' },
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'))
  
  return parts.map((part, i) => 
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-900/50 text-inherit rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ResultCard({ result, query, onClick }: ResultCardProps) {
  const config = typeConfig[result.type]
  const Icon = config.icon

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-lg border border-border bg-card",
        "hover:bg-accent transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-1.5 rounded mt-0.5", config.color, "bg-current/10")}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">
              {highlightText(result.title, query)}
            </h4>
            <span className={cn("text-xs px-1.5 py-0.5 rounded", config.color, "bg-current/10")}>
              {config.label}
            </span>
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
            {highlightText(result.snippet, query)}
          </p>
          
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="truncate max-w-[200px]" title={result.source.path}>
              {result.source.name}
            </span>
            {result.createdAt && (
              <>
                <span>•</span>
                <span>{new Date(result.createdAt).toLocaleDateString()}</span>
              </>
            )}
            <span>•</span>
            <span>{Math.round(result.score * 100)}% match</span>
          </div>
        </div>
      </div>
    </button>
  )
}

export function SearchResults({
  results,
  query,
  isLoading,
  totalCount,
  onResultClick,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">Searching...</p>
      </div>
    )
  }

  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Search className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">
          Enter a search query to find items, sources, and entities
        </p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Search className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground mb-2">
          No results found for "{query}"
        </p>
        <p className="text-xs text-muted-foreground">
          Try different keywords or adjust your filters
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalCount ?? results.length} result{(totalCount ?? results.length) !== 1 ? 's' : ''} for "{query}"
        </p>
      </div>

      <div className="space-y-2">
        {results.map((result) => (
          <ResultCard
            key={result.id}
            result={result}
            query={query}
            onClick={() => onResultClick?.(result)}
          />
        ))}
      </div>
    </div>
  )
}
