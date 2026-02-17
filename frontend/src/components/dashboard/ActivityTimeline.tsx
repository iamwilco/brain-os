import { useRecentActivity, type ActivityItem } from "@/hooks/useActivity"
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2,
  FileInput,
  Bot
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ActivityItemProps {
  item: ActivityItem
  onClick?: (item: ActivityItem) => void
}

function ActivityItemRow({ item, onClick }: ActivityItemProps) {
  const statusIcons = {
    queued: <Clock className="h-4 w-4 text-muted-foreground" />,
    running: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    success: <CheckCircle className="h-4 w-4 text-green-500" />,
    fail: <XCircle className="h-4 w-4 text-red-500" />,
  }

  const typeIcons = {
    run: <Play className="h-4 w-4" />,
    import: <FileInput className="h-4 w-4" />,
    agent: <Bot className="h-4 w-4" />,
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  return (
    <button
      onClick={() => onClick?.(item)}
      className={cn(
        "flex items-center gap-3 w-full p-3 rounded-md text-left",
        "hover:bg-accent transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
        {typeIcons[item.type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.action}</p>
        <p className="text-xs text-muted-foreground truncate">
          {item.description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {statusIcons[item.status as keyof typeof statusIcons]}
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatTime(item.timestamp)}
        </span>
      </div>
    </button>
  )
}

interface ActivityTimelineProps {
  onItemClick?: (item: ActivityItem) => void
}

export function ActivityTimeline({ onItemClick }: ActivityTimelineProps) {
  const { activities, isLoading, error } = useRecentActivity(10)

  if (error) {
    return (
      <div className="p-6 rounded-lg border border-border bg-card">
        <h3 className="font-medium mb-4">Recent Activity</h3>
        <p className="text-sm text-muted-foreground">
          Unable to load activity. Make sure the backend is running.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 rounded-lg border border-border bg-card">
      <h3 className="font-medium mb-4">Recent Activity</h3>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No recent activity
        </p>
      ) : (
        <div className="space-y-1 -mx-3">
          {activities.map((item) => (
            <ActivityItemRow
              key={item.id}
              item={item}
              onClick={onItemClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
