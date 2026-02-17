import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { X, CheckCircle, AlertCircle, Info, Loader2 } from "lucide-react"

export interface Toast {
  id: string
  title: string
  message?: string
  type: "success" | "error" | "info" | "loading"
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastProps {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (toast.duration !== 0 && toast.type !== "loading") {
      const timer = setTimeout(() => {
        onDismiss(toast.id)
      }, toast.duration || 5000)
      return () => clearTimeout(timer)
    }
  }, [toast, onDismiss])

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-500" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
    loading: <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />,
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border bg-card shadow-lg",
        "animate-in slide-in-from-right-full duration-300"
      )}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{toast.title}</p>
        {toast.message && (
          <p className="text-sm text-muted-foreground mt-1">{toast.message}</p>
        )}
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="text-sm text-primary hover:underline mt-2"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded hover:bg-accent text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

// Toast store for global access
type ToastListener = (toasts: Toast[]) => void

class ToastStore {
  private toasts: Toast[] = []
  private listeners: Set<ToastListener> = new Set()

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]))
  }

  add(toast: Omit<Toast, "id">): string {
    const id = `toast_${Date.now()}`
    this.toasts.push({ ...toast, id })
    this.notify()
    return id
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id)
    this.notify()
  }

  update(id: string, updates: Partial<Toast>) {
    this.toasts = this.toasts.map((t) =>
      t.id === id ? { ...t, ...updates } : t
    )
    this.notify()
  }

  success(title: string, message?: string) {
    return this.add({ type: "success", title, message })
  }

  error(title: string, message?: string) {
    return this.add({ type: "error", title, message })
  }

  info(title: string, message?: string) {
    return this.add({ type: "info", title, message })
  }

  loading(title: string, message?: string) {
    return this.add({ type: "loading", title, message, duration: 0 })
  }
}

export const toastStore = new ToastStore()

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    return toastStore.subscribe(setToasts)
  }, [])

  return {
    toasts,
    dismiss: (id: string) => toastStore.dismiss(id),
    add: toastStore.add.bind(toastStore),
    success: toastStore.success.bind(toastStore),
    error: toastStore.error.bind(toastStore),
    info: toastStore.info.bind(toastStore),
    loading: toastStore.loading.bind(toastStore),
    update: toastStore.update.bind(toastStore),
  }
}

// Convenience function for direct access
export const toast = {
  success: (title: string, message?: string) => toastStore.success(title, message),
  error: (title: string, message?: string) => toastStore.error(title, message),
  info: (title: string, message?: string) => toastStore.info(title, message),
  loading: (title: string, message?: string) => toastStore.loading(title, message),
  dismiss: (id: string) => toastStore.dismiss(id),
  update: (id: string, updates: Partial<Toast>) => toastStore.update(id, updates),
}
