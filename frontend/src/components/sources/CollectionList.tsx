import { useCollections, type SourceCollection } from "@/hooks/useCollections"
import { 
  MessageSquare, 
  Folder, 
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"

interface CollectionRowProps {
  collection: SourceCollection
  onClick?: (collection: SourceCollection) => void
}

function CollectionRow({ collection, onClick }: CollectionRowProps) {
  const typeIcons = {
    chatgpt: <MessageSquare className="h-4 w-4" />,
    claude: <MessageSquare className="h-4 w-4" />,
    folder: <Folder className="h-4 w-4" />,
    obsidian: <FileText className="h-4 w-4" />,
    manual: <FileText className="h-4 w-4" />,
  }

  const typeLabels = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    folder: "Folder",
    obsidian: "Obsidian",
    manual: "Manual",
  }

  const statusConfig = {
    pending: { icon: <Clock className="h-3 w-3" />, label: "Pending", color: "text-muted-foreground bg-muted" },
    processing: { icon: <RefreshCw className="h-3 w-3 animate-spin" />, label: "Processing", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
    complete: { icon: <CheckCircle className="h-3 w-3" />, label: "Complete", color: "text-green-600 bg-green-100 dark:bg-green-900/30" },
    error: { icon: <XCircle className="h-3 w-3" />, label: "Error", color: "text-red-600 bg-red-100 dark:bg-red-900/30" },
  }

  const status = statusConfig[collection.status]

  return (
    <button
      onClick={() => onClick?.(collection)}
      className={cn(
        "flex items-center gap-4 w-full p-4 rounded-lg border border-border bg-card",
        "hover:bg-accent transition-colors text-left",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="p-2 rounded-md bg-muted">
        {typeIcons[collection.type]}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{collection.name}</p>
        <p className="text-xs text-muted-foreground">
          {typeLabels[collection.type]}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium">{collection.sourceCount}</p>
          <p className="text-xs text-muted-foreground">sources</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">{collection.itemCount}</p>
          <p className="text-xs text-muted-foreground">items</p>
        </div>
        <div className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs", status.color)}>
          {status.icon}
          <span>{status.label}</span>
        </div>
      </div>
    </button>
  )
}

interface CollectionListProps {
  onCollectionClick?: (collection: SourceCollection) => void
}

export function CollectionList({ onCollectionClick }: CollectionListProps) {
  const { data, isLoading, error } = useCollections()

  if (error) {
    return (
      <div className="p-6 rounded-lg border border-border bg-card">
        <h3 className="font-medium mb-4">Source Collections</h3>
        <p className="text-sm text-muted-foreground">
          Unable to load collections. Make sure the backend is running.
        </p>
      </div>
    )
  }

  const collections = data?.data || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Source Collections</h2>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.total} collection{data.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : collections.length === 0 ? (
        <div className="p-12 rounded-lg border border-dashed border-border text-center">
          <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            No collections yet. Import a source to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {collections.map((collection) => (
            <CollectionRow
              key={collection.id}
              collection={collection}
              onClick={onCollectionClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
