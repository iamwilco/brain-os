/**
 * Agent session store tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getSessionsDir,
  getSessionsIndexPath,
  getTranscriptPath,
  loadSessionsIndex,
  saveSessionsIndex,
  createSession,
  getSession,
  getActiveSession,
  updateSession,
  endSession,
  appendToTranscript,
  readTranscript,
  getRecentMessages,
  listSessions,
  getOrCreateSession,
  cleanupOldSessions,
  type SessionsIndex,
} from './session.js';

describe('Path helpers', () => {
  it('should get sessions directory', () => {
    const dir = getSessionsDir('/agent/path');
    expect(dir).toBe('/agent/path/sessions');
  });

  it('should get sessions index path', () => {
    const path = getSessionsIndexPath('/agent/path');
    expect(path).toBe('/agent/path/sessions/sessions.json');
  });

  it('should get transcript path', () => {
    const path = getTranscriptPath('/agent/path', 'session-123');
    expect(path).toBe('/agent/path/sessions/session-123.jsonl');
  });
});

describe('Session index operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-session-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('loadSessionsIndex', () => {
    it('should return empty index if none exists', async () => {
      const index = await loadSessionsIndex(testDir);

      expect(index.version).toBe(1);
      expect(index.sessions).toHaveLength(0);
    });

    it('should load existing index', async () => {
      await mkdir(join(testDir, 'sessions'), { recursive: true });
      const existing: SessionsIndex = {
        version: 1,
        updatedAt: '2026-02-01T00:00:00Z',
        sessions: [
          {
            id: 'test-session',
            agentId: 'agent_test',
            status: 'active',
            createdAt: '2026-02-01T00:00:00Z',
            updatedAt: '2026-02-01T00:00:00Z',
            messageCount: 5,
          },
        ],
      };
      await saveSessionsIndex(testDir, existing);

      const loaded = await loadSessionsIndex(testDir);

      expect(loaded.sessions).toHaveLength(1);
      expect(loaded.sessions[0].id).toBe('test-session');
    });
  });

  describe('saveSessionsIndex', () => {
    it('should create directory and save index', async () => {
      const index: SessionsIndex = {
        version: 1,
        updatedAt: '2026-02-01T00:00:00Z',
        sessions: [],
      };

      await saveSessionsIndex(testDir, index);

      expect(existsSync(getSessionsIndexPath(testDir))).toBe(true);
    });
  });
});

describe('Session CRUD operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-session-crud-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('createSession', () => {
    it('should create new session', async () => {
      const session = await createSession(testDir, 'agent_test', 'Test Session');

      expect(session.id).toBeDefined();
      expect(session.agentId).toBe('agent_test');
      expect(session.status).toBe('active');
      expect(session.title).toBe('Test Session');
      expect(session.messageCount).toBe(0);
    });

    it('should create transcript file', async () => {
      const session = await createSession(testDir, 'agent_test');

      const transcriptPath = getTranscriptPath(testDir, session.id);
      expect(existsSync(transcriptPath)).toBe(true);
    });
  });

  describe('getSession', () => {
    it('should get session by ID', async () => {
      const created = await createSession(testDir, 'agent_test');

      const session = await getSession(testDir, created.id);

      expect(session?.id).toBe(created.id);
    });

    it('should return null for non-existent session', async () => {
      const session = await getSession(testDir, 'nonexistent');

      expect(session).toBeNull();
    });
  });

  describe('getActiveSession', () => {
    it('should get active session for agent', async () => {
      await createSession(testDir, 'agent_test');

      const active = await getActiveSession(testDir, 'agent_test');

      expect(active).not.toBeNull();
      expect(active?.status).toBe('active');
    });

    it('should return null if no active session', async () => {
      const session = await createSession(testDir, 'agent_test');
      await endSession(testDir, session.id);

      const active = await getActiveSession(testDir, 'agent_test');

      expect(active).toBeNull();
    });
  });

  describe('updateSession', () => {
    it('should update session metadata', async () => {
      const session = await createSession(testDir, 'agent_test');

      const updated = await updateSession(testDir, session.id, {
        title: 'Updated Title',
        tags: ['test'],
      });

      expect(updated?.title).toBe('Updated Title');
      expect(updated?.tags).toContain('test');
    });

    it('should preserve ID and createdAt', async () => {
      const session = await createSession(testDir, 'agent_test');

      const updated = await updateSession(testDir, session.id, {
        title: 'New Title',
      });

      expect(updated?.id).toBe(session.id);
      expect(updated?.createdAt).toBe(session.createdAt);
    });
  });

  describe('endSession', () => {
    it('should mark session as completed', async () => {
      const session = await createSession(testDir, 'agent_test');

      const ended = await endSession(testDir, session.id);

      expect(ended?.status).toBe('completed');
    });

    it('should mark session as abandoned', async () => {
      const session = await createSession(testDir, 'agent_test');

      const ended = await endSession(testDir, session.id, 'abandoned');

      expect(ended?.status).toBe('abandoned');
    });
  });
});

describe('Transcript operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-transcript-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('appendToTranscript', () => {
    it('should append message to transcript', async () => {
      const session = await createSession(testDir, 'agent_test');

      const message = await appendToTranscript(testDir, session.id, {
        role: 'user',
        content: 'Hello!',
      });

      expect(message.id).toBeDefined();
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello!');
      expect(message.timestamp).toBeDefined();
    });

    it('should append multiple messages', async () => {
      const session = await createSession(testDir, 'agent_test');

      await appendToTranscript(testDir, session.id, {
        role: 'user',
        content: 'Hello!',
      });
      await appendToTranscript(testDir, session.id, {
        role: 'assistant',
        content: 'Hi there!',
      });

      const transcript = await readTranscript(testDir, session.id);
      expect(transcript).toHaveLength(2);
    });
  });

  describe('readTranscript', () => {
    it('should read all messages', async () => {
      const session = await createSession(testDir, 'agent_test');
      await appendToTranscript(testDir, session.id, { role: 'user', content: 'One' });
      await appendToTranscript(testDir, session.id, { role: 'assistant', content: 'Two' });
      await appendToTranscript(testDir, session.id, { role: 'user', content: 'Three' });

      const messages = await readTranscript(testDir, session.id);

      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('One');
      expect(messages[2].content).toBe('Three');
    });

    it('should return empty for non-existent transcript', async () => {
      const messages = await readTranscript(testDir, 'nonexistent');

      expect(messages).toHaveLength(0);
    });
  });

  describe('getRecentMessages', () => {
    it('should get recent messages with limit', async () => {
      const session = await createSession(testDir, 'agent_test');
      for (let i = 0; i < 20; i++) {
        await appendToTranscript(testDir, session.id, {
          role: 'user',
          content: `Message ${i}`,
        });
      }

      const recent = await getRecentMessages(testDir, session.id, 5);

      expect(recent).toHaveLength(5);
      expect(recent[4].content).toBe('Message 19');
    });
  });
});

describe('Session listing and cleanup', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-session-list-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('listSessions', () => {
    it('should list all sessions', async () => {
      await createSession(testDir, 'agent_1');
      await createSession(testDir, 'agent_2');

      const sessions = await listSessions(testDir);

      expect(sessions).toHaveLength(2);
    });

    it('should filter by agentId', async () => {
      await createSession(testDir, 'agent_1');
      await createSession(testDir, 'agent_2');

      const sessions = await listSessions(testDir, 'agent_1');

      expect(sessions).toHaveLength(1);
      expect(sessions[0].agentId).toBe('agent_1');
    });

    it('should filter by status', async () => {
      const s1 = await createSession(testDir, 'agent_test');
      await createSession(testDir, 'agent_test');
      await endSession(testDir, s1.id);

      const active = await listSessions(testDir, undefined, 'active');

      expect(active).toHaveLength(1);
    });
  });

  describe('getOrCreateSession', () => {
    it('should return existing active session', async () => {
      const first = await createSession(testDir, 'agent_test');

      const second = await getOrCreateSession(testDir, 'agent_test');

      expect(second.id).toBe(first.id);
    });

    it('should create new session if none active', async () => {
      const first = await createSession(testDir, 'agent_test');
      await endSession(testDir, first.id);

      const second = await getOrCreateSession(testDir, 'agent_test');

      expect(second.id).not.toBe(first.id);
    });
  });

  describe('cleanupOldSessions', () => {
    it('should remove old completed sessions from index', async () => {
      const session = await createSession(testDir, 'agent_test');
      await endSession(testDir, session.id);
      
      // Manually set old date
      const index = await loadSessionsIndex(testDir);
      index.sessions[0].updatedAt = '2020-01-01T00:00:00Z';
      await saveSessionsIndex(testDir, index);

      const cleaned = await cleanupOldSessions(testDir, 1);

      expect(cleaned).toBe(1);
      const remaining = await listSessions(testDir);
      expect(remaining).toHaveLength(0);
    });

    it('should not remove active sessions', async () => {
      await createSession(testDir, 'agent_test');
      
      const index = await loadSessionsIndex(testDir);
      index.sessions[0].updatedAt = '2020-01-01T00:00:00Z';
      await saveSessionsIndex(testDir, index);

      const cleaned = await cleanupOldSessions(testDir, 1);

      expect(cleaned).toBe(0);
    });
  });
});
