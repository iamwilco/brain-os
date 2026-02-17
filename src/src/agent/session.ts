/**
 * Agent session store
 * Manages sessions with JSONL transcripts (append-only)
 */

import { readFile, writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';

/**
 * Session status
 */
export type SessionStatus = 'active' | 'completed' | 'abandoned';

/**
 * Session metadata
 */
export interface SessionMetadata {
  id: string;
  agentId: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  title?: string;
  tags?: string[];
}

/**
 * Message role
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Transcript message
 */
export interface TranscriptMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Sessions index
 */
export interface SessionsIndex {
  version: number;
  updatedAt: string;
  sessions: SessionMetadata[];
}

/**
 * Get sessions directory for an agent
 */
export function getSessionsDir(agentPath: string): string {
  return join(agentPath, 'sessions');
}

/**
 * Get sessions index path
 */
export function getSessionsIndexPath(agentPath: string): string {
  return join(getSessionsDir(agentPath), 'sessions.json');
}

/**
 * Get transcript path for a session
 */
export function getTranscriptPath(agentPath: string, sessionId: string): string {
  return join(getSessionsDir(agentPath), `${sessionId}.jsonl`);
}

/**
 * Load sessions index
 */
export async function loadSessionsIndex(agentPath: string): Promise<SessionsIndex> {
  const indexPath = getSessionsIndexPath(agentPath);
  
  if (!existsSync(indexPath)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      sessions: [],
    };
  }
  
  try {
    const content = await readFile(indexPath, 'utf-8');
    return JSON.parse(content) as SessionsIndex;
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      sessions: [],
    };
  }
}

/**
 * Save sessions index
 */
export async function saveSessionsIndex(
  agentPath: string,
  index: SessionsIndex
): Promise<void> {
  const indexPath = getSessionsIndexPath(agentPath);
  const dir = dirname(indexPath);
  
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  
  index.updatedAt = new Date().toISOString();
  await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Create a new session
 */
export async function createSession(
  agentPath: string,
  agentId: string,
  title?: string
): Promise<SessionMetadata> {
  const index = await loadSessionsIndex(agentPath);
  
  const session: SessionMetadata = {
    id: randomUUID(),
    agentId,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    title,
  };
  
  index.sessions.push(session);
  await saveSessionsIndex(agentPath, index);
  
  // Create empty transcript file
  const transcriptPath = getTranscriptPath(agentPath, session.id);
  await writeFile(transcriptPath, '', 'utf-8');
  
  return session;
}

/**
 * Get session by ID
 */
export async function getSession(
  agentPath: string,
  sessionId: string
): Promise<SessionMetadata | null> {
  const index = await loadSessionsIndex(agentPath);
  return index.sessions.find(s => s.id === sessionId) || null;
}

/**
 * Get active session for an agent
 */
export async function getActiveSession(
  agentPath: string,
  agentId: string
): Promise<SessionMetadata | null> {
  const index = await loadSessionsIndex(agentPath);
  return index.sessions.find(
    s => s.agentId === agentId && s.status === 'active'
  ) || null;
}

/**
 * Update session metadata
 */
export async function updateSession(
  agentPath: string,
  sessionId: string,
  updates: Partial<SessionMetadata>
): Promise<SessionMetadata | null> {
  const index = await loadSessionsIndex(agentPath);
  const sessionIndex = index.sessions.findIndex(s => s.id === sessionId);
  
  if (sessionIndex === -1) {
    return null;
  }
  
  const session = index.sessions[sessionIndex];
  const updated: SessionMetadata = {
    ...session,
    ...updates,
    id: session.id, // Preserve ID
    createdAt: session.createdAt, // Preserve createdAt
    updatedAt: new Date().toISOString(),
  };
  
  index.sessions[sessionIndex] = updated;
  await saveSessionsIndex(agentPath, index);
  
  return updated;
}

/**
 * End a session
 */
export async function endSession(
  agentPath: string,
  sessionId: string,
  status: 'completed' | 'abandoned' = 'completed'
): Promise<SessionMetadata | null> {
  return updateSession(agentPath, sessionId, { status });
}

/**
 * Append message to transcript (append-only)
 */
export async function appendToTranscript(
  agentPath: string,
  sessionId: string,
  message: Omit<TranscriptMessage, 'id' | 'timestamp'>
): Promise<TranscriptMessage> {
  const transcriptPath = getTranscriptPath(agentPath, sessionId);
  
  const fullMessage: TranscriptMessage = {
    id: randomUUID(),
    ...message,
    timestamp: new Date().toISOString(),
  };
  
  // Append as JSONL (one JSON object per line)
  const line = JSON.stringify(fullMessage) + '\n';
  await appendFile(transcriptPath, line, 'utf-8');
  
  // Update message count
  await updateSession(agentPath, sessionId, {
    messageCount: (await getSession(agentPath, sessionId))?.messageCount ?? 0 + 1,
  });
  
  return fullMessage;
}

/**
 * Read transcript messages
 */
export async function readTranscript(
  agentPath: string,
  sessionId: string
): Promise<TranscriptMessage[]> {
  const transcriptPath = getTranscriptPath(agentPath, sessionId);
  
  if (!existsSync(transcriptPath)) {
    return [];
  }
  
  try {
    const content = await readFile(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    return lines.map(line => JSON.parse(line) as TranscriptMessage);
  } catch {
    return [];
  }
}

/**
 * Get recent messages from transcript
 */
export async function getRecentMessages(
  agentPath: string,
  sessionId: string,
  limit: number = 10
): Promise<TranscriptMessage[]> {
  const messages = await readTranscript(agentPath, sessionId);
  return messages.slice(-limit);
}

/**
 * List sessions for an agent
 */
export async function listSessions(
  agentPath: string,
  agentId?: string,
  status?: SessionStatus
): Promise<SessionMetadata[]> {
  const index = await loadSessionsIndex(agentPath);
  
  let sessions = index.sessions;
  
  if (agentId) {
    sessions = sessions.filter(s => s.agentId === agentId);
  }
  
  if (status) {
    sessions = sessions.filter(s => s.status === status);
  }
  
  // Sort by updatedAt descending
  return sessions.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/**
 * Get or create active session
 */
export async function getOrCreateSession(
  agentPath: string,
  agentId: string,
  title?: string
): Promise<SessionMetadata> {
  const active = await getActiveSession(agentPath, agentId);
  if (active) {
    return active;
  }
  return createSession(agentPath, agentId, title);
}

/**
 * Delete old sessions (cleanup)
 */
export async function cleanupOldSessions(
  agentPath: string,
  maxAgeDays: number = 30
): Promise<number> {
  const index = await loadSessionsIndex(agentPath);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  
  const oldSessions = index.sessions.filter(
    s => s.status !== 'active' && new Date(s.updatedAt) < cutoff
  );
  
  // Remove from index
  index.sessions = index.sessions.filter(
    s => !oldSessions.some(old => old.id === s.id)
  );
  
  await saveSessionsIndex(agentPath, index);
  
  // Note: We don't delete transcript files to preserve history
  // They can be manually cleaned up if needed
  
  return oldSessions.length;
}
