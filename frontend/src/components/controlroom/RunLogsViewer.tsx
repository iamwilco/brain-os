import { useEffect, useRef, useState } from "react"
import { 
  Copy,
  Check,
  ArrowDown,
  Loader2,
  Terminal
} from "lucide-react"
import { cn } from "@/lib/utils"

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogLine {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  source?: string
}

interface RunLogsViewerProps {
  logs: LogLine[]
  isLoading?: boolean
  isStreaming?: boolean
  autoScroll?: boolean
  className?: string
}

const levelColors: Record<LogLevel, string> = {
  debug: 'text-muted-foreground',
  info: 'text-blue-500',
  warn: 'text-yellow-500',
  error: 'text-red-500',
}

const levelBg: Record<LogLevel, string> = {
  debug: '',
  info: '',
  warn: 'bg-yellow-500/5',
  error: 'bg-red-500/10',
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  })
}

export function RunLogsViewer({
  logs,
  isLoading,
  isStreaming,
  autoScroll = true,
  className,
}: RunLogsViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(autoScroll)
  const [copied, setCopied] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)

  useEffect(() => {
    if (isAutoScrollEnabled && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, isAutoScrollEnabled])

  const handleScroll = () => {
    if (!containerRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 50
    setIsAtBottom(atBottom)
    
    if (!atBottom && isAutoScrollEnabled) {
      setIsAutoScrollEnabled(false)
    }
  }

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      setIsAutoScrollEnabled(true)
    }
  }

  const copyLogs = async () => {
    const text = logs
      .map((log) => `[${formatTimestamp(log.timestamp)}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n')
    
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Terminal className="h-4 w-4" />
          <span>{logs.length} log line{logs.length !== 1 ? 's' : ''}</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-blue-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Live
            </span>
          )}
        </div>
        
        <button
          onClick={copyLogs}
          disabled={logs.length === 0}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-xs rounded",
            "hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1 overflow-y-auto font-mono text-xs",
          "bg-muted/30 rounded-lg mt-2 p-2"
        )}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No logs yet
          </div>
        ) : (
          <div className="space-y-0.5">
            {logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "flex gap-2 px-2 py-1 rounded hover:bg-accent/50",
                  levelBg[log.level]
                )}
              >
                <span className="text-muted-foreground shrink-0 w-24">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={cn(
                  "uppercase font-medium shrink-0 w-12",
                  levelColors[log.level]
                )}>
                  {log.level}
                </span>
                {log.source && (
                  <span className="text-muted-foreground shrink-0">
                    [{log.source}]
                  </span>
                )}
                <span className="flex-1 whitespace-pre-wrap break-all">
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className={cn(
            "absolute bottom-4 right-4 p-2 rounded-full shadow-lg",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 transition-colors"
          )}
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
