/**
 * WebSocket Events API routes
 * Real-time event streaming for runs, agents, and system updates
 */

import { FastifyInstance } from 'fastify';
import type { WSEvent } from '../../api/types.js';

// WebSocket type from fastify-websocket
interface WebSocket {
  readyState: number;
  send: (data: string) => void;
  on(event: 'message', handler: (data: Buffer) => void): void;
  on(event: 'close', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
}

/**
 * Connected WebSocket clients
 */
const clients: Set<WebSocket> = new Set();

/**
 * Broadcast event to all connected clients
 */
export function broadcastEvent(event: WSEvent): void {
  const message = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  }
}

/**
 * Send event to specific client
 */
export function sendEvent(client: WebSocket, event: WSEvent): void {
  if (client.readyState === 1) {
    client.send(JSON.stringify(event));
  }
}

/**
 * Emit run progress event
 */
export function emitRunProgress(runId: string, progress: number, status: string): void {
  broadcastEvent({
    type: 'run:progress',
    payload: { runId, progress, status },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit run log event
 */
export function emitRunLog(runId: string, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  broadcastEvent({
    type: 'run:log',
    payload: { runId, message, level },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit run completed event
 */
export function emitRunComplete(runId: string, success: boolean, artifactIds?: string[]): void {
  broadcastEvent({
    type: 'run:complete',
    payload: { runId, success, artifactIds: artifactIds || [] },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit agent status change event
 */
export function emitAgentStatus(agentId: string, status: string, error?: string): void {
  broadcastEvent({
    type: 'agent:status',
    payload: { agentId, status, error },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit system notification
 */
export function emitNotification(title: string, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  broadcastEvent({
    type: 'notification',
    payload: { title, message, level },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get connected client count
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Register WebSocket events route
 */
export async function eventsRoutes(server: FastifyInstance): Promise<void> {
  server.get('/events', { websocket: true }, (socket: WebSocket, _request) => {
    // Add client to set
    clients.add(socket);
    server.log.info(`WebSocket client connected (${clients.size} total)`);

    // Send welcome message
    sendEvent(socket, {
      type: 'connected',
      payload: { 
        message: 'Connected to event stream',
        clientCount: clients.size,
      },
      timestamp: new Date().toISOString(),
    });

    // Handle incoming messages (for subscriptions, etc.)
    socket.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle subscription requests
        if (message.type === 'subscribe') {
          sendEvent(socket, {
            type: 'subscribed',
            payload: { topics: message.topics || ['*'] },
            timestamp: new Date().toISOString(),
          });
        }

        // Handle ping/pong for keep-alive
        if (message.type === 'ping') {
          sendEvent(socket, {
            type: 'pong',
            payload: {},
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // Ignore invalid JSON
      }
    });

    // Handle disconnect
    socket.on('close', () => {
      clients.delete(socket);
      server.log.info(`WebSocket client disconnected (${clients.size} remaining)`);
    });

    // Handle errors
    socket.on('error', (error) => {
      server.log.error({ err: error }, 'WebSocket error');
      clients.delete(socket);
    });
  });

  // HTTP endpoint to get connection status
  server.get('/events/status', async () => {
    return {
      connected: clients.size,
      status: 'ok',
    };
  });
}
