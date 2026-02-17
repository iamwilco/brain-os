import { create } from 'zustand'
import { wsClient } from '@/lib/websocket'

interface RunProgress {
  runId: string
  progress: number
  status: string
}

interface Notification {
  id: string
  title: string
  message: string
  level: 'info' | 'warn' | 'error'
  timestamp: string
  read: boolean
}

interface EventsState {
  connected: boolean
  runProgress: Map<string, RunProgress>
  notifications: Notification[]
  
  // Actions
  setConnected: (connected: boolean) => void
  updateRunProgress: (runId: string, progress: number, status: string) => void
  addNotification: (notification: Omit<Notification, 'id' | 'read'>) => void
  markNotificationRead: (id: string) => void
  clearNotifications: () => void
}

export const useEventsStore = create<EventsState>((set) => ({
  connected: false,
  runProgress: new Map(),
  notifications: [],

  setConnected: (connected) => set({ connected }),

  updateRunProgress: (runId, progress, status) =>
    set((state) => {
      const newProgress = new Map(state.runProgress)
      newProgress.set(runId, { runId, progress, status })
      return { runProgress: newProgress }
    }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          ...notification,
          id: `notif_${Date.now()}`,
          read: false,
        },
        ...state.notifications,
      ].slice(0, 50), // Keep last 50
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  clearNotifications: () => set({ notifications: [] }),
}))

// Connect WebSocket events to store
export function initEventListeners(): () => void {
  const unsubscribers: (() => void)[] = []

  unsubscribers.push(
    wsClient.on('connected', () => {
      useEventsStore.getState().setConnected(true)
    })
  )

  unsubscribers.push(
    wsClient.on('run:progress', (event) => {
      const { runId, progress, status } = event.payload as {
        runId: string
        progress: number
        status: string
      }
      useEventsStore.getState().updateRunProgress(runId, progress, status)
    })
  )

  unsubscribers.push(
    wsClient.on('run:complete', (event) => {
      const { runId, success } = event.payload as {
        runId: string
        success: boolean
      }
      useEventsStore.getState().updateRunProgress(runId, 100, success ? 'success' : 'fail')
      useEventsStore.getState().addNotification({
        title: success ? 'Run Completed' : 'Run Failed',
        message: `Run ${runId} ${success ? 'completed successfully' : 'failed'}`,
        level: success ? 'info' : 'error',
        timestamp: event.timestamp,
      })
    })
  )

  unsubscribers.push(
    wsClient.on('notification', (event) => {
      const { title, message, level } = event.payload as {
        title: string
        message: string
        level: 'info' | 'warn' | 'error'
      }
      useEventsStore.getState().addNotification({
        title,
        message,
        level,
        timestamp: event.timestamp,
      })
    })
  )

  // Return cleanup function
  return () => {
    unsubscribers.forEach((unsub) => unsub())
  }
}
