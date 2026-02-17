/**
 * Agent send command
 * Send single message to agent and get response
 */

import { findAgentDirectories, getAgentStatus } from './list.js';
import { createMessage, sendAgentMessage, receiveMessages, markAsProcessed } from './messaging.js';
import { loadMemory } from './memory.js';
import { loadContext } from './context.js';
import type { MessageEnvelope } from './messaging.js';

/**
 * Send options
 */
export interface SendOptions {
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  waitForResponse?: boolean;
  timeout?: number;
  includeContext?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Send result
 */
export interface SendResult {
  success: boolean;
  messageId: string;
  response?: MessageEnvelope;
  error?: string;
  duration: number;
}

/**
 * Agent context for send
 */
export interface AgentContext {
  agentId: string;
  agentPath: string;
  memory?: string;
  context?: string;
}

/**
 * Resolve agent path by ID
 */
export async function resolveAgentPath(
  vaultPath: string,
  agentId: string
): Promise<string | null> {
  const agents = await findAgentDirectories(vaultPath);
  
  for (const agentPath of agents) {
    const status = await getAgentStatus(agentPath);
    if (status?.id === agentId) {
      return agentPath;
    }
  }
  
  return null;
}

/**
 * Load agent context
 */
export async function loadAgentContext(
  agentPath: string,
  agentId: string
): Promise<AgentContext> {
  const context: AgentContext = {
    agentId,
    agentPath,
  };
  
  // Load memory if exists
  try {
    const memory = await loadMemory(agentPath);
    if (memory) {
      context.memory = memory.raw;
    }
  } catch {
    // No memory
  }
  
  // Load context if exists
  try {
    const contextDoc = await loadContext(agentPath);
    if (contextDoc) {
      context.context = contextDoc;
    }
  } catch {
    // No context
  }
  
  return context;
}

/**
 * Send message to agent
 */
export async function sendToAgent(
  vaultPath: string,
  fromAgentId: string,
  toAgentId: string,
  subject: string,
  payload: Record<string, unknown>,
  options: SendOptions = {}
): Promise<SendResult> {
  const start = Date.now();
  
  // Resolve sender path
  const fromPath = await resolveAgentPath(vaultPath, fromAgentId);
  if (!fromPath) {
    return {
      success: false,
      messageId: '',
      error: `Sender agent not found: ${fromAgentId}`,
      duration: Date.now() - start,
    };
  }
  
  // Resolve recipient path
  const toPath = await resolveAgentPath(vaultPath, toAgentId);
  if (!toPath) {
    return {
      success: false,
      messageId: '',
      error: `Recipient agent not found: ${toAgentId}`,
      duration: Date.now() - start,
    };
  }
  
  // Include context if requested
  let enrichedPayload = { ...payload };
  if (options.includeContext) {
    const senderContext = await loadAgentContext(fromPath, fromAgentId);
    enrichedPayload = {
      ...payload,
      _senderContext: {
        memory: senderContext.memory,
        context: senderContext.context,
      },
    };
  }
  
  // Create message
  const message = createMessage(
    fromAgentId,
    toAgentId,
    'request',
    subject,
    enrichedPayload,
    {
      priority: options.priority,
      metadata: options.metadata,
    }
  );
  
  // Send message
  const sendResult = await sendAgentMessage(message, fromPath, toPath);
  if (!sendResult.success) {
    return {
      success: false,
      messageId: message.id,
      error: sendResult.error,
      duration: Date.now() - start,
    };
  }
  
  // If not waiting for response, return immediately
  if (!options.waitForResponse) {
    return {
      success: true,
      messageId: message.id,
      duration: Date.now() - start,
    };
  }
  
  // Wait for response
  const timeout = options.timeout || 5000;
  const pollInterval = 100;
  const maxPolls = Math.ceil(timeout / pollInterval);
  
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval));
    
    // Check for response
    const responses = await receiveMessages(fromPath, fromAgentId, {
      type: 'response',
      unreadOnly: true,
    });
    
    // Find response to our message
    const response = responses.find(e => e.message.replyTo === message.id);
    if (response) {
      await markAsProcessed(fromPath, fromAgentId, response.message.id);
      return {
        success: true,
        messageId: message.id,
        response,
        duration: Date.now() - start,
      };
    }
  }
  
  // Timeout
  return {
    success: true,
    messageId: message.id,
    error: 'Response timeout',
    duration: Date.now() - start,
  };
}

/**
 * Send request to skill agent
 */
export async function sendToSkill(
  vaultPath: string,
  fromAgentId: string,
  skillName: string,
  task: string,
  context?: string,
  options: SendOptions = {}
): Promise<SendResult> {
  const skillId = `agent_skill_${skillName.toLowerCase()}`;
  
  return sendToAgent(
    vaultPath,
    fromAgentId,
    skillId,
    `Skill Request: ${skillName}`,
    {
      task,
      context: context || '',
    },
    options
  );
}

/**
 * Broadcast message to multiple agents
 */
export async function broadcastMessage(
  vaultPath: string,
  fromAgentId: string,
  toAgentIds: string[],
  subject: string,
  payload: Record<string, unknown>,
  options: SendOptions = {}
): Promise<Map<string, SendResult>> {
  const results = new Map<string, SendResult>();
  
  for (const toAgentId of toAgentIds) {
    const result = await sendToAgent(
      vaultPath,
      fromAgentId,
      toAgentId,
      subject,
      payload,
      { ...options, waitForResponse: false }
    );
    results.set(toAgentId, result);
  }
  
  return results;
}

/**
 * Format send result for display
 */
export function formatSendResult(result: SendResult): string {
  const lines: string[] = [];
  
  if (result.success) {
    lines.push(`✓ Message sent (${result.messageId})`);
    lines.push(`  Duration: ${result.duration}ms`);
    
    if (result.response) {
      lines.push('');
      lines.push('## Response');
      lines.push(`  From: ${result.response.message.from}`);
      lines.push(`  Subject: ${result.response.message.subject}`);
      
      const payload = result.response.message.payload;
      if (payload.result) {
        lines.push('');
        lines.push('### Result');
        lines.push(String(payload.result));
      }
    } else if (result.error === 'Response timeout') {
      lines.push('  ⚠ No response received (timeout)');
    }
  } else {
    lines.push(`✗ Send failed: ${result.error}`);
    lines.push(`  Duration: ${result.duration}ms`);
  }
  
  return lines.join('\n');
}

/**
 * Format broadcast results for display
 */
export function formatBroadcastResults(results: Map<string, SendResult>): string {
  const lines: string[] = [];
  
  lines.push('# Broadcast Results');
  lines.push('');
  
  let success = 0;
  let failed = 0;
  
  for (const [agentId, result] of results) {
    if (result.success) {
      success++;
      lines.push(`- ✓ ${agentId}: sent (${result.messageId})`);
    } else {
      failed++;
      lines.push(`- ✗ ${agentId}: ${result.error}`);
    }
  }
  
  lines.push('');
  lines.push(`**Sent:** ${success} | **Failed:** ${failed}`);
  
  return lines.join('\n');
}
