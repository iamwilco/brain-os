import { 
  Calendar,
  FileText,
  MessageSquare,
  Database,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  ArrowLeft
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { SourceCollection } from "@/hooks/useCollections"

export interface SourceConversation {
  id: string
  title: string
  messageCount: number
  extractedItems: number
  status: 'pending' | 'extracted' | 'error'
}

interface SourceDetailProps {
  collection: SourceCollection
  conversations: SourceConversation[]
  isLoading?: boolean
  onBack?: () => void
  onConversationClick?: (conversation: SourceConversation) => void
  onReExtract?: () => void
}

function MetadataItem({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: typeof Calendar
  label: string
  value: string | number 
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-medium text-sm">{value}</p>
      </div>
    </div>
  )
}

const statusConfig = {
  pending: { 
    icon: Clock, 
    label: 'Pending', 
    color: 'text-muted-foreground',
    bg: 'bg-muted'
  },
  processing: { 
    icon: RefreshCw, 
    label: 'Processing', 
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/30'
  },
  complete: { 
    icon: CheckCircle, 
    label: 'Complete', 
    color: 'text-green-600',
    bg: 'bg-green-100 dark:bg-green-900/30'
  },
  error: { 
    icon: XCircle, 
    label: 'Error', 
    color: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/30'
  },
}

const convStatusConfig = {
  pending: { icon: Clock, color: 'text-muted-foreground' },
  extracted: { icon: CheckCircle, color: 'text-green-600' },
  error: { icon: XCircle, color: 'text-red-600' },
}

export function SourceDetail({
  collection,
  conversations,
  isLoading,
  onBack,
  onConversationClick,
  onReExtract,
}: SourceDetailProps) {
  const status = statusConfig[collection.status]
  const StatusIcon = status.icon

  const extractedCount = conversations.filter(c => c.status === 'extracted').length
  const totalItems = conversations.reduce((sum, c) => sum + c.extractedItems, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-md hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{collection.name}</h2>
          <p className="text-sm text-muted-foreground capitalize">
            {collection.type} Collection
          </p>
        </div>
        <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full", status.bg)}>
          <StatusIcon className={cn("h-4 w-4", status.color, collection.status === 'processing' && "animate-spin")} />
          <span className={cn("text-sm font-medium", status.color)}>
            {status.label}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetadataItem
          icon={Database}
          label="Sources"
          value={collection.sourceCount}
        />
        <MetadataItem
          icon={FileText}
          label="Items Extracted"
          value={totalItems}
        />
        <MetadataItem
          icon={MessageSquare}
          label="Conversations"
          value={`${extractedCount}/${conversations.length}`}
        />
        <MetadataItem
          icon={Calendar}
          label="Imported"
          value={new Date(collection.createdAt).toLocaleDateString()}
        />
      </div>

      {collection.error && (
        <div className="p-4 rounded-lg border border-red-500/50 bg-red-500/10">
          <p className="text-sm text-red-600 font-medium mb-1">Error</p>
          <p className="text-sm text-muted-foreground">{collection.error}</p>
          {onReExtract && (
            <button
              onClick={onReExtract}
              className="mt-3 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Retry Extraction
            </button>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Conversations</h3>
          <span className="text-sm text-muted-foreground">
            {extractedCount} of {conversations.length} extracted
          </span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-border rounded-lg">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              No conversations in this collection
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {conversations.map((conv) => {
              const convStatus = convStatusConfig[conv.status]
              const ConvStatusIcon = convStatus.icon
              return (
                <button
                  key={conv.id}
                  onClick={() => onConversationClick?.(conv)}
                  className={cn(
                    "flex items-center gap-3 w-full p-4 rounded-lg border border-border",
                    "hover:bg-accent transition-colors text-left"
                  )}
                >
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {conv.messageCount} messages • {conv.extractedItems} items
                    </p>
                  </div>
                  <ConvStatusIcon className={cn("h-4 w-4 shrink-0", convStatus.color)} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
