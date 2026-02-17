/**
 * Agent messaging protocol tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateMessageId,
  createMessage,
  createReply,
  loadInbox,
  saveInbox,
  sendAgentMessage,
  receiveMessages,
  markAsRead,
  markAsProcessed,
  getMessageById,
  deleteMessage,
  getInboxStats,
  formatMessage,
  formatInboxSummary,
  getInboxPath,
  getMessageLogPath,
  type AgentMessage,
  type MessageEnvelope,
} from './messaging.js';

describe('generateMessageId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();
    
    expect(id1).toMatch(/^msg_[a-z0-9]+_[a-z0-9]+$/);
    expect(id1).not.toBe(id2);
  });
});

describe('createMessage', () => {
  it('should create message with required fields', () => {
    const msg = createMessage(
      'agent_admin',
      'agent_project_test',
      'request',
      'Test Subject',
      { action: 'test' }
    );

    expect(msg.from).toBe('agent_admin');
    expect(msg.to).toBe('agent_project_test');
    expect(msg.type).toBe('request');
    expect(msg.subject).toBe('Test Subject');
    expect(msg.payload).toEqual({ action: 'test' });
    expect(msg.status).toBe('pending');
    expect(msg.priority).toBe('normal');
  });

  it('should create message with options', () => {
    const msg = createMessage(
      'agent_a',
      'agent_b',
      'notify',
      'Urgent',
      {},
      { priority: 'urgent', metadata: { key: 'value' } }
    );

    expect(msg.priority).toBe('urgent');
    expect(msg.metadata).toEqual({ key: 'value' });
  });
});

describe('createReply', () => {
  it('should create reply to message', () => {
    const original = createMessage(
      'agent_a',
      'agent_b',
      'request',
      'Original',
      { question: 'test?' }
    );

    const reply = createReply(original, { answer: 'yes' });

    expect(reply.from).toBe('agent_b');
    expect(reply.to).toBe('agent_a');
    expect(reply.type).toBe('response');
    expect(reply.subject).toBe('Re: Original');
    expect(reply.replyTo).toBe(original.id);
  });
});

describe('formatMessage', () => {
  it('should format message for display', () => {
    const envelope: MessageEnvelope = {
      message: {
        id: 'msg_test',
        from: 'agent_a',
        to: 'agent_b',
        type: 'request',
        priority: 'high',
        subject: 'Test Subject',
        payload: {},
        timestamp: new Date().toISOString(),
        status: 'delivered',
      },
    };

    const formatted = formatMessage(envelope);

    expect(formatted).toContain('Test Subject');
    expect(formatted).toContain('agent_a');
    expect(formatted).toContain('🟠');
  });
});

describe('formatInboxSummary', () => {
  it('should format stats summary', () => {
    const stats = {
      total: 10,
      unread: 3,
      pending: 2,
      byType: { request: 5, response: 3, notify: 2 },
      byPriority: { low: 1, normal: 6, high: 2, urgent: 1 },
    };

    const formatted = formatInboxSummary(stats);

    expect(formatted).toContain('Total:** 10');
    expect(formatted).toContain('Unread:** 3');
    expect(formatted).toContain('Requests: 5');
  });
});

describe('File operations', () => {
  let testDir: string;
  let agentAPath: string;
  let agentBPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-messaging-test-${Date.now()}`);
    agentAPath = join(testDir, 'agent_a');
    agentBPath = join(testDir, 'agent_b');
    
    await mkdir(agentAPath, { recursive: true });
    await mkdir(agentBPath, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('loadInbox / saveInbox', () => {
    it('should create empty inbox if none exists', async () => {
      const inbox = await loadInbox(agentAPath, 'agent_a');
      
      expect(inbox.agentId).toBe('agent_a');
      expect(inbox.messages).toEqual([]);
    });

    it('should save and load inbox', async () => {
      const msg = createMessage('agent_b', 'agent_a', 'request', 'Test', {});
      const inbox = await loadInbox(agentAPath, 'agent_a');
      inbox.messages.push({ message: msg });
      
      await saveInbox(agentAPath, inbox);
      
      const loaded = await loadInbox(agentAPath, 'agent_a');
      expect(loaded.messages.length).toBe(1);
      expect(loaded.messages[0].message.subject).toBe('Test');
    });
  });

  describe('sendAgentMessage', () => {
    it('should send message to recipient inbox', async () => {
      const msg = createMessage(
        'agent_a',
        'agent_b',
        'request',
        'Hello',
        { greeting: true }
      );

      const result = await sendAgentMessage(msg, agentAPath, agentBPath);

      expect(result.success).toBe(true);
      
      const inbox = await loadInbox(agentBPath, 'agent_b');
      expect(inbox.messages.length).toBe(1);
      expect(inbox.messages[0].message.subject).toBe('Hello');
      expect(inbox.messages[0].deliveredAt).toBeDefined();
    });

    it('should fail for nonexistent recipient', async () => {
      const msg = createMessage('agent_a', 'agent_c', 'request', 'Test', {});
      
      const result = await sendAgentMessage(msg, agentAPath, join(testDir, 'nonexistent'));
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should log messages', async () => {
      const msg = createMessage('agent_a', 'agent_b', 'notify', 'Log Test', {});
      
      await sendAgentMessage(msg, agentAPath, agentBPath);
      
      const senderLog = await readFile(getMessageLogPath(agentAPath), 'utf-8');
      const recipientLog = await readFile(getMessageLogPath(agentBPath), 'utf-8');
      
      expect(senderLog).toContain('sent');
      expect(recipientLog).toContain('received');
    });
  });

  describe('receiveMessages', () => {
    it('should receive all messages', async () => {
      const msg1 = createMessage('agent_a', 'agent_b', 'request', 'Msg1', {});
      const msg2 = createMessage('agent_a', 'agent_b', 'notify', 'Msg2', {});
      
      await sendAgentMessage(msg1, agentAPath, agentBPath);
      await sendAgentMessage(msg2, agentAPath, agentBPath);
      
      const messages = await receiveMessages(agentBPath, 'agent_b');
      
      expect(messages.length).toBe(2);
    });

    it('should filter by type', async () => {
      const msg1 = createMessage('agent_a', 'agent_b', 'request', 'Req', {});
      const msg2 = createMessage('agent_a', 'agent_b', 'notify', 'Not', {});
      
      await sendAgentMessage(msg1, agentAPath, agentBPath);
      await sendAgentMessage(msg2, agentAPath, agentBPath);
      
      const requests = await receiveMessages(agentBPath, 'agent_b', { type: 'request' });
      
      expect(requests.length).toBe(1);
      expect(requests[0].message.type).toBe('request');
    });

    it('should filter unread only', async () => {
      const msg1 = createMessage('agent_a', 'agent_b', 'request', 'Read', {});
      const msg2 = createMessage('agent_a', 'agent_b', 'request', 'Unread', {});
      
      await sendAgentMessage(msg1, agentAPath, agentBPath);
      await sendAgentMessage(msg2, agentAPath, agentBPath);
      await markAsRead(agentBPath, 'agent_b', msg1.id);
      
      const unread = await receiveMessages(agentBPath, 'agent_b', { unreadOnly: true });
      
      expect(unread.length).toBe(1);
      expect(unread[0].message.subject).toBe('Unread');
    });
  });

  describe('markAsRead / markAsProcessed', () => {
    it('should mark message as read', async () => {
      const msg = createMessage('agent_a', 'agent_b', 'request', 'Test', {});
      await sendAgentMessage(msg, agentAPath, agentBPath);
      
      const result = await markAsRead(agentBPath, 'agent_b', msg.id);
      
      expect(result).toBe(true);
      
      const envelope = await getMessageById(agentBPath, 'agent_b', msg.id);
      expect(envelope?.readAt).toBeDefined();
      expect(envelope?.message.status).toBe('read');
    });

    it('should mark message as processed', async () => {
      const msg = createMessage('agent_a', 'agent_b', 'request', 'Test', {});
      await sendAgentMessage(msg, agentAPath, agentBPath);
      
      await markAsProcessed(agentBPath, 'agent_b', msg.id);
      
      const envelope = await getMessageById(agentBPath, 'agent_b', msg.id);
      expect(envelope?.processedAt).toBeDefined();
      expect(envelope?.message.status).toBe('processed');
    });
  });

  describe('deleteMessage', () => {
    it('should delete message from inbox', async () => {
      const msg = createMessage('agent_a', 'agent_b', 'request', 'Delete Me', {});
      await sendAgentMessage(msg, agentAPath, agentBPath);
      
      const deleted = await deleteMessage(agentBPath, 'agent_b', msg.id);
      
      expect(deleted).toBe(true);
      
      const inbox = await loadInbox(agentBPath, 'agent_b');
      expect(inbox.messages.length).toBe(0);
    });

    it('should return false for nonexistent message', async () => {
      const deleted = await deleteMessage(agentBPath, 'agent_b', 'nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('getInboxStats', () => {
    it('should return inbox statistics', async () => {
      const msg1 = createMessage('agent_a', 'agent_b', 'request', 'R1', {}, { priority: 'high' });
      const msg2 = createMessage('agent_a', 'agent_b', 'notify', 'N1', {}, { priority: 'normal' });
      
      await sendAgentMessage(msg1, agentAPath, agentBPath);
      await sendAgentMessage(msg2, agentAPath, agentBPath);
      await markAsRead(agentBPath, 'agent_b', msg1.id);
      
      const stats = await getInboxStats(agentBPath, 'agent_b');
      
      expect(stats.total).toBe(2);
      expect(stats.unread).toBe(1);
      expect(stats.byType.request).toBe(1);
      expect(stats.byType.notify).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.normal).toBe(1);
    });
  });
});
