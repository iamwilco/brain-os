type EventType = 
  | 'run:started'
  | 'run:progress'
  | 'run:log'
  | 'run:complete'
  | 'run:completed'
  | 'run:failed'
  | 'agent:status'
  | 'notification'
  | 'connected'
  | 'subscribed'
  | 'pong'

interface WSEvent {
  type: EventType
  payload: unknown
  timestamp: string
}

type EventHandler = (event: WSEvent) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private pingInterval: ReturnType<typeof setInterval> | null = null

  constructor(url: string) {
    this.url = url
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('[WS] Connected')
        this.reconnectAttempts = 0
        this.startPing()
        this.emit({ type: 'connected', payload: {}, timestamp: new Date().toISOString() })
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSEvent
          this.emit(data)
        } catch (err) {
          console.error('[WS] Failed to parse message:', err)
        }
      }

      this.ws.onclose = () => {
        console.log('[WS] Disconnected')
        this.stopPing()
        this.attemptReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error)
      }
    } catch (err) {
      console.error('[WS] Failed to connect:', err)
      this.attemptReconnect()
    }
  }

  disconnect(): void {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.connect()
    }, delay)
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'ping' })
    }, 30000)
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  subscribe(topics: string[]): void {
    this.send({ type: 'subscribe', topics })
  }

  on(eventType: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler)
    }
  }

  onAll(handler: EventHandler): () => void {
    return this.on('*', handler)
  }

  private emit(event: WSEvent): void {
    // Call specific handlers
    this.handlers.get(event.type)?.forEach((handler) => handler(event))
    // Call wildcard handlers
    this.handlers.get('*')?.forEach((handler) => handler(event))
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instance
const WS_URL = 'ws://localhost:3001/events'
export const wsClient = new WebSocketClient(WS_URL)

// Auto-connect when module loads (in browser)
if (typeof window !== 'undefined') {
  wsClient.connect()
}
