/**
 * Agent-to-agent message protocol
 * Enables agents to communicate with each other via structured messages
 */

import { readFile, writeFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Message types
 */
export type MessageType = 'request' | 'response' | 'notify';

/**
 * Message priority
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Message status
 */
export type MessageStatus = 'pending' | 'delivered' | 'read' | 'processed' | 'failed';

/**
 * Agent message schema
 */
export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  priority: MessagePriority;
  subject: string;
  payload: Record<string, unknown>;
  timestamp: string;
  status: MessageStatus;
  replyTo?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Message envelope for transport
 */
export interface MessageEnvelope {
  message: AgentMessage;
  signature?: string;
  deliveredAt?: string;
  readAt?: string;
  processedAt?: string;
}

/**
 * Message log entry
 */
export interface MessageLogEntry {
  timestamp: string;
  action: 'sent' | 'received' | 'delivered' | 'read' | 'processed' | 'failed';
  messageId: string;
  from: string;
  to: string;
  type: MessageType;
  subject: string;
  error?: string;
}

/**
 * Inbox state
 */
export interface Inbox {
  agentId: string;
  messages: MessageEnvelope[];
  lastUpdated: string;
}

/**
 * Generate unique message ID
 */
export function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `msg_${timestamp}_${random}`;
}

/**
 * Create a new message
 */
export function createMessage(
  from: string,
  to: string,
  type: MessageType,
  subject: string,
  payload: Record<string, unknown>,
  options: {
    priority?: MessagePriority;
    replyTo?: string;
    expiresIn?: number;
    metadata?: Record<string, unknown>;
  } = {}
): AgentMessage {
  const now = new Date();
  
  return {
    id: generateMessageId(),
    from,
    to,
    type,
    priority: options.priority || 'normal',
    subject,
    payload,
    timestamp: now.toISOString(),
    status: 'pending',
    replyTo: options.replyTo,
    expiresAt: options.expiresIn 
      ? new Date(now.getTime() + options.expiresIn).toISOString() 
      : undefined,
    metadata: options.metadata,
  };
}

/**
 * Create a reply message
 */
export function createReply(
  originalMessage: AgentMessage,
  payload: Record<string, unknown>,
  options: {
    subject?: string;
    priority?: MessagePriority;
  } = {}
): AgentMessage {
  return createMessage(
    originalMessage.to,
    originalMessage.from,
    'response',
    options.subject || `Re: ${originalMessage.subject}`,
    payload,
    {
      priority: options.priority || originalMessage.priority,
      replyTo: originalMessage.id,
    }
  );
}

/**
 * Get inbox path for agent
 */
export function getInboxPath(agentPath: string): string {
  return join(agentPath, 'inbox.json');
}

/**
 * Get message log path for agent
 */
export function getMessageLogPath(agentPath: string): string {
  return join(agentPath, 'messages.jsonl');
}

/**
 * Load agent inbox
 */
export async function loadInbox(agentPath: string, agentId: string): Promise<Inbox> {
  const inboxPath = getInboxPath(agentPath);
  
  if (!existsSync(inboxPath)) {
    return {
      agentId,
      messages: [],
      lastUpdated: new Date().toISOString(),
    };
  }
  
  try {
    const content = await readFile(inboxPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {
      agentId,
      messages: [],
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save agent inbox
 */
export async function saveInbox(agentPath: string, inbox: Inbox): Promise<void> {
  const inboxPath = getInboxPath(agentPath);
  inbox.lastUpdated = new Date().toISOString();
  await writeFile(inboxPath, JSON.stringify(inbox, null, 2), 'utf-8');
}

/**
 * Log message action
 */
export async function logMessage(
  agentPath: string,
  action: MessageLogEntry['action'],
  message: AgentMessage,
  error?: string
): Promise<void> {
  const logPath = getMessageLogPath(agentPath);
  
  const entry: MessageLogEntry = {
    timestamp: new Date().toISOString(),
    action,
    messageId: message.id,
    from: message.from,
    to: message.to,
    type: message.type,
    subject: message.subject,
    error,
  };
  
  await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf-8');
}

/**
 * Send message to agent inbox
 */
export async function sendAgentMessage(
  message: AgentMessage,
  senderPath: string,
  recipientPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Ensure recipient inbox directory exists
    if (!existsSync(recipientPath)) {
      return { success: false, error: 'Recipient agent not found' };
    }
    
    // Load recipient inbox
    const inbox = await loadInbox(recipientPath, message.to);
    
    // Create envelope
    const envelope: MessageEnvelope = {
      message: { ...message, status: 'delivered' },
      deliveredAt: new Date().toISOString(),
    };
    
    // Add to inbox
    inbox.messages.push(envelope);
    await saveInbox(recipientPath, inbox);
    
    // Log at sender
    await logMessage(senderPath, 'sent', message);
    
    // Log at recipient
    await logMessage(recipientPath, 'received', message);
    
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await logMessage(senderPath, 'failed', message, error);
    return { success: false, error };
  }
}

/**
 * Receive messages from inbox
 */
export async function receiveMessages(
  agentPath: string,
  agentId: string,
  options: {
    unreadOnly?: boolean;
    type?: MessageType;
    from?: string;
    limit?: number;
  } = {}
): Promise<MessageEnvelope[]> {
  const inbox = await loadInbox(agentPath, agentId);
  let messages = inbox.messages;
  
  // Filter unread
  if (options.unreadOnly) {
    messages = messages.filter(e => !e.readAt);
  }
  
  // Filter by type
  if (options.type) {
    messages = messages.filter(e => e.message.type === options.type);
  }
  
  // Filter by sender
  if (options.from) {
    messages = messages.filter(e => e.message.from === options.from);
  }
  
  // Apply limit
  if (options.limit) {
    messages = messages.slice(0, options.limit);
  }
  
  return messages;
}

/**
 * Mark message as read
 */
export async function markAsRead(
  agentPath: string,
  agentId: string,
  messageId: string
): Promise<boolean> {
  const inbox = await loadInbox(agentPath, agentId);
  const envelope = inbox.messages.find(e => e.message.id === messageId);
  
  if (!envelope) {
    return false;
  }
  
  envelope.readAt = new Date().toISOString();
  envelope.message.status = 'read';
  await saveInbox(agentPath, inbox);
  await logMessage(agentPath, 'read', envelope.message);
  
  return true;
}

/**
 * Mark message as processed
 */
export async function markAsProcessed(
  agentPath: string,
  agentId: string,
  messageId: string
): Promise<boolean> {
  const inbox = await loadInbox(agentPath, agentId);
  const envelope = inbox.messages.find(e => e.message.id === messageId);
  
  if (!envelope) {
    return false;
  }
  
  envelope.processedAt = new Date().toISOString();
  envelope.message.status = 'processed';
  await saveInbox(agentPath, inbox);
  await logMessage(agentPath, 'processed', envelope.message);
  
  return true;
}

/**
 * Get message by ID
 */
export async function getMessageById(
  agentPath: string,
  agentId: string,
  messageId: string
): Promise<MessageEnvelope | null> {
  const inbox = await loadInbox(agentPath, agentId);
  return inbox.messages.find(e => e.message.id === messageId) || null;
}

/**
 * Delete message from inbox
 */
export async function deleteMessage(
  agentPath: string,
  agentId: string,
  messageId: string
): Promise<boolean> {
  const inbox = await loadInbox(agentPath, agentId);
  const index = inbox.messages.findIndex(e => e.message.id === messageId);
  
  if (index === -1) {
    return false;
  }
  
  inbox.messages.splice(index, 1);
  await saveInbox(agentPath, inbox);
  
  return true;
}

/**
 * Get inbox statistics
 */
export async function getInboxStats(
  agentPath: string,
  agentId: string
): Promise<{
  total: number;
  unread: number;
  pending: number;
  byType: Record<MessageType, number>;
  byPriority: Record<MessagePriority, number>;
}> {
  const inbox = await loadInbox(agentPath, agentId);
  
  const stats = {
    total: inbox.messages.length,
    unread: inbox.messages.filter(e => !e.readAt).length,
    pending: inbox.messages.filter(e => e.message.status === 'pending' || e.message.status === 'delivered').length,
    byType: {
      request: 0,
      response: 0,
      notify: 0,
    } as Record<MessageType, number>,
    byPriority: {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    } as Record<MessagePriority, number>,
  };
  
  for (const envelope of inbox.messages) {
    stats.byType[envelope.message.type]++;
    stats.byPriority[envelope.message.priority]++;
  }
  
  return stats;
}

/**
 * Format message for display
 */
export function formatMessage(envelope: MessageEnvelope): string {
  const msg = envelope.message;
  const lines: string[] = [];
  
  const statusIcon = msg.status === 'read' || msg.status === 'processed' ? '✓' : '•';
  const priorityIcon = msg.priority === 'urgent' ? '🔴' : 
                       msg.priority === 'high' ? '🟠' : 
                       msg.priority === 'normal' ? '🟢' : '⚪';
  
  lines.push(`${statusIcon} ${priorityIcon} **${msg.subject}**`);
  lines.push(`  From: ${msg.from} | Type: ${msg.type}`);
  lines.push(`  ${new Date(msg.timestamp).toLocaleString()}`);
  
  return lines.join('\n');
}

/**
 * Format inbox summary
 */
export function formatInboxSummary(
  stats: Awaited<ReturnType<typeof getInboxStats>>
): string {
  const lines: string[] = [];
  
  lines.push('# Inbox Summary');
  lines.push('');
  lines.push(`**Total:** ${stats.total} messages`);
  lines.push(`**Unread:** ${stats.unread}`);
  lines.push(`**Pending:** ${stats.pending}`);
  lines.push('');
  lines.push('## By Type');
  lines.push(`- Requests: ${stats.byType.request}`);
  lines.push(`- Responses: ${stats.byType.response}`);
  lines.push(`- Notifications: ${stats.byType.notify}`);
  lines.push('');
  lines.push('## By Priority');
  lines.push(`- 🔴 Urgent: ${stats.byPriority.urgent}`);
  lines.push(`- 🟠 High: ${stats.byPriority.high}`);
  lines.push(`- 🟢 Normal: ${stats.byPriority.normal}`);
  lines.push(`- ⚪ Low: ${stats.byPriority.low}`);
  
  return lines.join('\n');
}
