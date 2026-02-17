import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ProgressBarProps {
  value: number
  max?: number
  className?: string
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function ProgressBar({
  value,
  max = 100,
  className,
  showLabel = false,
  size = 'md',
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  const heights = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }

  return (
    <div className={cn("w-full", className)}>
      <div className={cn(
        "w-full bg-muted rounded-full overflow-hidden",
        heights[size]
      )}>
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground mt-1">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  )
}

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }

  return (
    <Loader2 
      className={cn("animate-spin text-muted-foreground", sizes[size], className)} 
    />
  )
}

interface LoadingOverlayProps {
  message?: string
  className?: string
}

export function LoadingOverlay({ message, className }: LoadingOverlayProps) {
  return (
    <div className={cn(
      "absolute inset-0 flex flex-col items-center justify-center",
      "bg-background/80 backdrop-blur-sm z-10",
      className
    )}>
      <Spinner size="lg" />
      {message && (
        <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  )
}

interface LoadingStateProps {
  loading: boolean
  children: React.ReactNode
  skeleton?: React.ReactNode
  overlay?: boolean
  message?: string
}

export function LoadingState({
  loading,
  children,
  skeleton,
  overlay = false,
  message,
}: LoadingStateProps) {
  if (loading) {
    if (overlay) {
      return (
        <div className="relative">
          {children}
          <LoadingOverlay message={message} />
        </div>
      )
    }
    
    if (skeleton) {
      return <>{skeleton}</>
    }

    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="lg" />
        {message && (
          <p className="ml-3 text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    )
  }

  return <>{children}</>
}

interface InlineLoadingProps {
  message?: string
  className?: string
}

export function InlineLoading({ message = "Loading...", className }: InlineLoadingProps) {
  return (
    <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Spinner size="sm" />
      <span>{message}</span>
    </div>
  )
}
