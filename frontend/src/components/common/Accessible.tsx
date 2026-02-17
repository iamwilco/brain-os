import { forwardRef, useRef, useEffect, useCallback, type ReactNode, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

interface VisuallyHiddenProps {
  children: ReactNode
}

export function VisuallyHidden({ children }: VisuallyHiddenProps) {
  return (
    <span
      className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0"
      style={{ clip: 'rect(0, 0, 0, 0)' }}
    >
      {children}
    </span>
  )
}

interface SkipLinkProps {
  href: string
  children?: ReactNode
}

export function SkipLink({ href, children = "Skip to main content" }: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        "absolute left-4 top-4 z-50 px-4 py-2 rounded-md",
        "bg-primary text-primary-foreground",
        "transform -translate-y-full focus:translate-y-0",
        "transition-transform duration-200",
        "focus:outline-none focus:ring-2 focus:ring-ring"
      )}
    >
      {children}
    </a>
  )
}

interface FocusTrapProps {
  children: ReactNode
  active?: boolean
  className?: string
}

export function FocusTrap({ children, active = true, className }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    firstElement?.focus()

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [active])

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}

interface KeyboardNavigableProps {
  children: ReactNode
  onEscape?: () => void
  onEnter?: () => void
  className?: string
}

export function KeyboardNavigable({
  children,
  onEscape,
  onEnter,
  className,
}: KeyboardNavigableProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault()
      onEscape()
    }
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault()
      onEnter()
    }
  }, [onEscape, onEnter])

  return (
    <div onKeyDown={handleKeyDown} className={className}>
      {children}
    </div>
  )
}

interface FocusableButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  ariaLabel?: string
}

export const FocusableButton = forwardRef<HTMLButtonElement, FocusableButtonProps>(
  ({ children, ariaLabel, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
FocusableButton.displayName = 'FocusableButton'

interface AriaLiveProps {
  children: ReactNode
  mode?: 'polite' | 'assertive' | 'off'
  atomic?: boolean
}

export function AriaLive({ children, mode = 'polite', atomic = true }: AriaLiveProps) {
  return (
    <div
      role="status"
      aria-live={mode}
      aria-atomic={atomic}
      className="sr-only"
    >
      {children}
    </div>
  )
}


interface RovingTabIndexProps {
  children: ReactNode
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function RovingTabIndex({ 
  children, 
  orientation = 'horizontal',
  className 
}: RovingTabIndexProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const container = containerRef.current
    if (!container) return

    const items = Array.from(
      container.querySelectorAll<HTMLElement>('[role="tab"], [role="menuitem"], button')
    )
    const currentIndex = items.indexOf(document.activeElement as HTMLElement)
    if (currentIndex === -1) return

    const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'

    if (e.key === prevKey) {
      e.preventDefault()
      const prevIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1
      items[prevIndex]?.focus()
    } else if (e.key === nextKey) {
      e.preventDefault()
      const nextIndex = currentIndex === items.length - 1 ? 0 : currentIndex + 1
      items[nextIndex]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1]?.focus()
    }
  }, [orientation])

  return (
    <div ref={containerRef} onKeyDown={handleKeyDown} className={className}>
      {children}
    </div>
  )
}
