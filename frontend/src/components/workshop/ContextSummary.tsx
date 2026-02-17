import { 
  Package,
  Brain,
  Folder,
  FileText,
  Tag,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export interface ContextItem {
  id: string
  type: 'note' | 'memory' | 'reference'
  title: string
  preview?: string
}

export interface MemoryHighlight {
  id: string
  content: string
  relevance: 'high' | 'medium' | 'low'
  source?: string
}

export interface ContextScope {
  type: 'project' | 'moc' | 'path' | 'tag'
  value: string
  label?: string
}

interface ContextSummaryProps {
  projectName?: string
  scope?: ContextScope
  contextItems: ContextItem[]
  memoryHighlights: MemoryHighlight[]
  tokenCount?: number
  maxTokens?: number
  isLoading?: boolean
  lastUpdated?: string
}

function ScopeIndicator({ scope }: { scope: ContextScope }) {
  const icons = {
    project: Folder,
    moc: Brain,
    path: Folder,
    tag: Tag,
  }
  const Icon = icons[scope.type]

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground capitalize">{scope.type}</p>
        <p className="text-sm font-medium truncate">{scope.label || scope.value}</p>
      </div>
    </div>
  )
}

function MemoryCard({ memory }: { memory: MemoryHighlight }) {
  const relevanceColors = {
    high: 'border-l-green-500',
    medium: 'border-l-yellow-500',
    low: 'border-l-muted-foreground',
  }

  return (
    <div className={cn(
      "border-l-2 pl-3 py-1",
      relevanceColors[memory.relevance]
    )}>
      <p className="text-sm">{memory.content}</p>
      {memory.source && (
        <p className="text-xs text-muted-foreground mt-1">
          from {memory.source}
        </p>
      )}
    </div>
  )
}

function ContextItemRow({ item }: { item: ContextItem }) {
  const icons = {
    note: FileText,
    memory: Brain,
    reference: Package,
  }
  const Icon = icons[item.type]

  return (
    <div className="flex items-start gap-2 py-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.title}</p>
        {item.preview && (
          <p className="text-xs text-muted-foreground line-clamp-2">{item.preview}</p>
        )}
      </div>
    </div>
  )
}

export function ContextSummary({
  projectName,
  scope,
  contextItems,
  memoryHighlights,
  tokenCount,
  maxTokens,
  isLoading,
  lastUpdated,
}: ContextSummaryProps) {
  const [expandedSection, setExpandedSection] = useState<'context' | 'memory' | null>('memory')

  const toggleSection = (section: 'context' | 'memory') => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const tokenPercentage = tokenCount && maxTokens ? Math.round((tokenCount / maxTokens) * 100) : 0

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h3 className="font-medium">Context Pack</h3>
        {projectName && (
          <span className="text-sm text-muted-foreground">• {projectName}</span>
        )}
      </div>

      {scope && <ScopeIndicator scope={scope} />}

      {tokenCount !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Token usage</span>
            <span className={cn(
              tokenPercentage > 80 ? "text-red-600" : "text-muted-foreground"
            )}>
              {tokenCount.toLocaleString()} / {maxTokens?.toLocaleString() || '?'}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all",
                tokenPercentage > 80 ? "bg-red-500" : "bg-primary"
              )}
              style={{ width: `${Math.min(tokenPercentage, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <button
          onClick={() => toggleSection('memory')}
          className="w-full flex items-center justify-between py-2 text-sm font-medium hover:text-primary"
        >
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span>Memory Highlights</span>
            <span className="text-xs text-muted-foreground">({memoryHighlights.length})</span>
          </div>
          {expandedSection === 'memory' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        
        {expandedSection === 'memory' && (
          <div className="space-y-3 pl-6">
            {memoryHighlights.length === 0 ? (
              <p className="text-xs text-muted-foreground">No memory highlights</p>
            ) : (
              memoryHighlights.map((memory) => (
                <MemoryCard key={memory.id} memory={memory} />
              ))
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <button
          onClick={() => toggleSection('context')}
          className="w-full flex items-center justify-between py-2 text-sm font-medium hover:text-primary"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Loaded Context</span>
            <span className="text-xs text-muted-foreground">({contextItems.length})</span>
          </div>
          {expandedSection === 'context' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        
        {expandedSection === 'context' && (
          <div className="space-y-1 pl-6 max-h-48 overflow-y-auto">
            {contextItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">No context loaded</p>
            ) : (
              contextItems.map((item) => (
                <ContextItemRow key={item.id} item={item} />
              ))
            )}
          </div>
        )}
      </div>

      {lastUpdated && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2 border-t border-border">
          <Clock className="h-3 w-3" />
          <span>Updated {new Date(lastUpdated).toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}
