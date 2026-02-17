import { useEffect } from 'react'
import { wsClient } from '@/lib/websocket'
import { useEventsStore, initEventListeners } from '@/stores/eventsStore'

export function useWebSocket() {
  const connected = useEventsStore((state) => state.connected)

  useEffect(() => {
    // Initialize event listeners
    const cleanup = initEventListeners()

    // Connect if not already connected
    if (!wsClient.isConnected) {
      wsClient.connect()
    }

    return () => {
      cleanup()
    }
  }, [])

  return {
    connected,
    send: wsClient.send.bind(wsClient),
    subscribe: wsClient.subscribe.bind(wsClient),
  }
}

export function useRunProgress(runId: string) {
  const progress = useEventsStore((state) => state.runProgress.get(runId))
  return progress
}

export function useNotifications() {
  const notifications = useEventsStore((state) => state.notifications)
  const markRead = useEventsStore((state) => state.markNotificationRead)
  const clear = useEventsStore((state) => state.clearNotifications)
  
  const unreadCount = notifications.filter((n) => !n.read).length

  return {
    notifications,
    unreadCount,
    markRead,
    clear,
  }
}
