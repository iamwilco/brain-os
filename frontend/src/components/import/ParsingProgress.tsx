import { useState } from "react"
import { 
  Loader2, 
  CheckCircle, 
  XCircle, 
  FileText,
  MessageSquare,
  AlertTriangle
} from "lucide-react"

export interface ParsedConversation {
  id: string
  title: string
  messageCount: number
  createdAt?: string
}

export interface ParsingState {
  status: 'idle' | 'parsing' | 'complete' | 'error'
  progress: number
  totalItems: number
  processedItems: number
  conversations: ParsedConversation[]
  error?: string
  warnings: string[]
}

interface ParsingProgressProps {
  state: ParsingState
  onRetry?: () => void
  onCancel?: () => void
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div 
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  )
}

export function ParsingProgress({ state, onRetry, onCancel }: ParsingProgressProps) {
  const { status, progress, totalItems, processedItems, conversations, error, warnings } = state

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {status === 'parsing' && (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        )}
        {status === 'complete' && (
          <CheckCircle className="h-8 w-8 text-green-500" />
        )}
        {status === 'error' && (
          <XCircle className="h-8 w-8 text-destructive" />
        )}
        
        <div className="flex-1">
          <h3 className="font-medium">
            {status === 'idle' && 'Ready to parse'}
            {status === 'parsing' && 'Parsing files...'}
            {status === 'complete' && 'Parsing complete'}
            {status === 'error' && 'Parsing failed'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {status === 'parsing' && `Processing ${processedItems} of ${totalItems} items`}
            {status === 'complete' && `Found ${conversations.length} conversations`}
            {status === 'error' && error}
          </p>
        </div>

        {status === 'parsing' && onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent"
          >
            Cancel
          </button>
        )}
        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        )}
      </div>

      {status === 'parsing' && (
        <div className="space-y-2">
          <ProgressBar progress={progress} />
          <p className="text-xs text-muted-foreground text-right">
            {Math.round(progress)}%
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500 mb-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Warnings</span>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1">
            {warnings.map((warning, i) => (
              <li key={i}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}

      {conversations.length > 0 && (
        <div>
          <h4 className="font-medium mb-3">
            Conversations Found ({conversations.length})
          </h4>
          <div className="max-h-64 overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {conversations.map((conv) => (
              <div 
                key={conv.id}
                className="flex items-center gap-3 p-3 hover:bg-accent/50"
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {conv.messageCount} messages
                    {conv.createdAt && ` • ${new Date(conv.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 'idle' && (
        <div className="p-8 text-center border border-dashed border-border rounded-lg">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">
            Select files to begin parsing
          </p>
        </div>
      )}
    </div>
  )
}

export function useParsingState() {
  const [state, setState] = useState<ParsingState>({
    status: 'idle',
    progress: 0,
    totalItems: 0,
    processedItems: 0,
    conversations: [],
    warnings: [],
  })

  const startParsing = (totalItems: number) => {
    setState({
      status: 'parsing',
      progress: 0,
      totalItems,
      processedItems: 0,
      conversations: [],
      warnings: [],
    })
  }

  const updateProgress = (processedItems: number, conversation?: ParsedConversation) => {
    setState(prev => ({
      ...prev,
      processedItems,
      progress: prev.totalItems > 0 ? (processedItems / prev.totalItems) * 100 : 0,
      conversations: conversation 
        ? [...prev.conversations, conversation]
        : prev.conversations,
    }))
  }

  const addWarning = (warning: string) => {
    setState(prev => ({
      ...prev,
      warnings: [...prev.warnings, warning],
    }))
  }

  const complete = () => {
    setState(prev => ({
      ...prev,
      status: 'complete',
      progress: 100,
    }))
  }

  const setError = (error: string) => {
    setState(prev => ({
      ...prev,
      status: 'error',
      error,
    }))
  }

  const reset = () => {
    setState({
      status: 'idle',
      progress: 0,
      totalItems: 0,
      processedItems: 0,
      conversations: [],
      warnings: [],
    })
  }

  return {
    state,
    startParsing,
    updateProgress,
    addWarning,
    complete,
    setError,
    reset,
  }
}
