import { useEffect } from 'react'
import { wsClient } from '@/lib/websocket'
import { toast } from '@/components/ui/toast'

export function useRunToasts() {
  useEffect(() => {
    const unsubscribers: (() => void)[] = []

    // Toast on run start
    unsubscribers.push(
      wsClient.on('run:started', (event) => {
        const { runId, action } = event.payload as { runId: string; action: string }
        toast.info(`Run Started`, `${action} (${runId})`)
      })
    )

    // Toast on run complete
    unsubscribers.push(
      wsClient.on('run:complete', (event) => {
        const { runId, success } = event.payload as { runId: string; success: boolean }
        if (success) {
          toast.success('Run Completed', `Run ${runId} finished successfully`)
        } else {
          toast.error('Run Failed', `Run ${runId} encountered an error`)
        }
      })
    )

    // Toast on run:completed (alternate event)
    unsubscribers.push(
      wsClient.on('run:completed', (event) => {
        const { runId, status } = event.payload as { runId: string; status: string }
        if (status === 'success') {
          toast.success('Run Completed', `Run ${runId} finished successfully`)
        }
      })
    )

    // Toast on run:failed
    unsubscribers.push(
      wsClient.on('run:failed', (event) => {
        const { runId, error } = event.payload as { runId: string; error?: string }
        toast.error('Run Failed', error || `Run ${runId} failed`)
      })
    )

    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [])
}
