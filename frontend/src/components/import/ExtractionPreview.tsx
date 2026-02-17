import { useState, useMemo } from "react"
import { 
  Check, 
  X,
  Lightbulb,
  ListTodo,
  HelpCircle,
  Quote,
  FileText,
  Tag,
  CheckCircle,
  XCircle
} from "lucide-react"
import { cn } from "@/lib/utils"

export type ItemType = 'insight' | 'task' | 'question' | 'quote' | 'note' | 'entity'

export interface ExtractedItem {
  id: string
  type: ItemType
  content: string
  source: string
  confidence: number
  tags?: string[]
}

export type ItemStatus = 'pending' | 'accepted' | 'rejected'

interface ExtractionPreviewProps {
  items: ExtractedItem[]
  itemStatuses: Map<string, ItemStatus>
  onStatusChange: (id: string, status: ItemStatus) => void
  onAcceptAll?: () => void
  onRejectAll?: () => void
}

interface ItemRowProps {
  item: ExtractedItem
  status: ItemStatus
  onAccept: () => void
  onReject: () => void
}

const typeConfig: Record<ItemType, { icon: typeof Lightbulb; label: string; color: string }> = {
  insight: { icon: Lightbulb, label: 'Insight', color: 'text-yellow-500' },
  task: { icon: ListTodo, label: 'Task', color: 'text-blue-500' },
  question: { icon: HelpCircle, label: 'Question', color: 'text-purple-500' },
  quote: { icon: Quote, label: 'Quote', color: 'text-green-500' },
  note: { icon: FileText, label: 'Note', color: 'text-gray-500' },
  entity: { icon: Tag, label: 'Entity', color: 'text-orange-500' },
}

function ItemRow({ item, status, onAccept, onReject }: ItemRowProps) {
  const config = typeConfig[item.type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "p-4 rounded-lg border transition-all",
        status === 'accepted' && "border-green-500/50 bg-green-500/5",
        status === 'rejected' && "border-red-500/50 bg-red-500/5 opacity-50",
        status === 'pending' && "border-border"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-1.5 rounded", config.color, "bg-current/10")}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("text-xs font-medium", config.color)}>
              {config.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {Math.round(item.confidence * 100)}% confidence
            </span>
          </div>
          
          <p className="text-sm mb-2">{item.content}</p>
          
          <p className="text-xs text-muted-foreground truncate">
            Source: {item.source}
          </p>
          
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.tags.map((tag, i) => (
                <span 
                  key={i}
                  className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {status === 'pending' ? (
            <>
              <button
                onClick={onAccept}
                className="p-1.5 rounded hover:bg-green-500/10 text-green-600 transition-colors"
                title="Accept"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={onReject}
                className="p-1.5 rounded hover:bg-red-500/10 text-red-600 transition-colors"
                title="Reject"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : status === 'accepted' ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
        </div>
      </div>
    </div>
  )
}

export function ExtractionPreview({
  items,
  itemStatuses,
  onStatusChange,
  onAcceptAll,
  onRejectAll,
}: ExtractionPreviewProps) {
  const [filterType, setFilterType] = useState<ItemType | 'all'>('all')

  const stats = useMemo(() => {
    let accepted = 0
    let rejected = 0
    let pending = 0
    
    items.forEach(item => {
      const status = itemStatuses.get(item.id) || 'pending'
      if (status === 'accepted') accepted++
      else if (status === 'rejected') rejected++
      else pending++
    })
    
    return { accepted, rejected, pending, total: items.length }
  }, [items, itemStatuses])

  const filteredItems = useMemo(() => {
    if (filterType === 'all') return items
    return items.filter(item => item.type === filterType)
  }, [items, filterType])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach(item => {
      counts[item.type] = (counts[item.type] || 0) + 1
    })
    return counts
  }, [items])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Extracted Items</h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-600">{stats.accepted} accepted</span>
          <span className="text-red-600">{stats.rejected} rejected</span>
          <span className="text-muted-foreground">{stats.pending} pending</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setFilterType('all')}
            className={cn(
              "px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors",
              filterType === 'all' 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted hover:bg-accent"
            )}
          >
            All ({items.length})
          </button>
          {Object.entries(typeConfig).map(([type, config]) => {
            const count = typeCounts[type] || 0
            if (count === 0) return null
            return (
              <button
                key={type}
                onClick={() => setFilterType(type as ItemType)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-full whitespace-nowrap transition-colors",
                  filterType === type 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted hover:bg-accent"
                )}
              >
                {config.label} ({count})
              </button>
            )
          })}
        </div>

        {stats.pending > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onAcceptAll}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Accept All
            </button>
            <button
              onClick={onRejectAll}
              className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
            >
              Reject All
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No items to display
          </p>
        ) : (
          filteredItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              status={itemStatuses.get(item.id) || 'pending'}
              onAccept={() => onStatusChange(item.id, 'accepted')}
              onReject={() => onStatusChange(item.id, 'rejected')}
            />
          ))
        )}
      </div>
    </div>
  )
}
