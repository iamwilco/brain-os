import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <ErrorFallback 
          error={this.state.error} 
          onReset={this.handleReset} 
        />
      )
    }

    return this.props.children
  }
}

interface ErrorFallbackProps {
  error: Error | null
  onReset?: () => void
  title?: string
  description?: string
}

export function ErrorFallback({
  error,
  onReset,
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
        <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
      </div>
      
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{description}</p>
      
      {error && (
        <details className="mb-4 text-left w-full max-w-md">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
            Technical details
          </summary>
          <pre className={cn(
            "mt-2 p-3 rounded-md text-xs overflow-auto",
            "bg-muted border border-border"
          )}>
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        </details>
      )}

      {onReset && (
        <button
          onClick={onReset}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md",
            "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      )}
    </div>
  )
}

interface ErrorMessageProps {
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorMessage({ message, onRetry, className }: ErrorMessageProps) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-4 rounded-lg",
      "bg-red-50 border border-red-200 text-red-800",
      "dark:bg-red-900/20 dark:border-red-800 dark:text-red-400",
      className
    )}>
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <p className="flex-1 text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-medium hover:underline"
        >
          Retry
        </button>
      )}
    </div>
  )
}
