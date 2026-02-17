/**
 * ChatGPT conversation normalizer
 * Converts parsed ChatGPT conversations to JSONL format
 */

import { createWriteStream } from 'fs';
import { writeFile } from 'fs/promises';
import type { ParsedConversation, ParsedMessage } from '../ingest/chatgpt/index.js';

/**
 * Normalized message format for JSONL output
 */
export interface NormalizedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string | null;
  model: string | null;
}

/**
 * Normalized conversation record for JSONL output
 * Each line in JSONL file is one of these
 */
export interface NormalizedConversation {
  id: string;
  title: string;
  source: 'chatgpt';
  created_at: string;
  updated_at: string;
  model: string | null;
  message_count: number;
  messages: NormalizedMessage[];
  metadata: {
    is_archived: boolean;
    gizmo_id: string | null;
  };
}

/**
 * Normalize a single message
 */
function normalizeMessage(msg: ParsedMessage): NormalizedMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.createTime?.toISOString() ?? null,
    model: msg.model,
  };
}

/**
 * Normalize a parsed conversation to JSONL record format
 */
export function normalizeConversation(conv: ParsedConversation): NormalizedConversation {
  return {
    id: conv.id,
    title: conv.title,
    source: 'chatgpt',
    created_at: conv.createTime.toISOString(),
    updated_at: conv.updateTime.toISOString(),
    model: conv.model,
    message_count: conv.messageCount,
    messages: conv.messages.map(normalizeMessage),
    metadata: {
      is_archived: conv.isArchived,
      gizmo_id: conv.gizmoId,
    },
  };
}

/**
 * Convert a normalized conversation to a JSONL line
 */
export function toJsonLine(conv: NormalizedConversation): string {
  return JSON.stringify(conv);
}

/**
 * Normalize multiple conversations and return JSONL string
 */
export function toJsonl(conversations: ParsedConversation[]): string {
  return conversations
    .map(conv => toJsonLine(normalizeConversation(conv)))
    .join('\n');
}

/**
 * Write normalized conversations to a JSONL file
 */
export async function writeJsonlFile(
  conversations: ParsedConversation[],
  outputPath: string
): Promise<WriteResult> {
  const lines: string[] = [];
  let totalMessages = 0;

  for (const conv of conversations) {
    const normalized = normalizeConversation(conv);
    lines.push(toJsonLine(normalized));
    totalMessages += normalized.message_count;
  }

  const content = lines.join('\n');
  await writeFile(outputPath, content + '\n', 'utf-8');

  return {
    conversationCount: conversations.length,
    messageCount: totalMessages,
    bytesWritten: Buffer.byteLength(content + '\n', 'utf-8'),
    outputPath,
  };
}

/**
 * Write result information
 */
export interface WriteResult {
  conversationCount: number;
  messageCount: number;
  bytesWritten: number;
  outputPath: string;
}

/**
 * Stream normalized conversations to a JSONL file
 * More memory efficient for large exports
 */
export function createJsonlStream(outputPath: string): JsonlWriter {
  return new JsonlWriter(outputPath);
}

/**
 * Streaming JSONL writer for large datasets
 */
export class JsonlWriter {
  private stream: ReturnType<typeof createWriteStream>;
  private conversationCount = 0;
  private messageCount = 0;
  private bytesWritten = 0;
  private closed = false;

  constructor(private outputPath: string) {
    this.stream = createWriteStream(outputPath, { encoding: 'utf-8' });
  }

  /**
   * Write a single conversation to the stream
   */
  write(conv: ParsedConversation): void {
    if (this.closed) {
      throw new Error('Writer is closed');
    }

    const normalized = normalizeConversation(conv);
    const line = toJsonLine(normalized) + '\n';
    
    this.stream.write(line);
    this.conversationCount++;
    this.messageCount += normalized.message_count;
    this.bytesWritten += Buffer.byteLength(line, 'utf-8');
  }

  /**
   * Close the stream and return results
   */
  async close(): Promise<WriteResult> {
    if (this.closed) {
      return this.getResult();
    }

    this.closed = true;
    
    return new Promise((resolve, reject) => {
      this.stream.end((err: Error | null) => {
        if (err) reject(err);
        else resolve(this.getResult());
      });
    });
  }

  private getResult(): WriteResult {
    return {
      conversationCount: this.conversationCount,
      messageCount: this.messageCount,
      bytesWritten: this.bytesWritten,
      outputPath: this.outputPath,
    };
  }
}

/**
 * Parse and validate a JSONL line back to NormalizedConversation
 */
export function parseJsonLine(line: string): NormalizedConversation | null {
  if (!line.trim()) return null;
  
  try {
    const data = JSON.parse(line);
    
    // Basic validation
    if (!data.id || !data.title || !data.messages) {
      return null;
    }
    
    return data as NormalizedConversation;
  } catch {
    return null;
  }
}

/**
 * Parse JSONL content to array of normalized conversations
 */
export function parseJsonl(content: string): NormalizedConversation[] {
  return content
    .split('\n')
    .map(parseJsonLine)
    .filter((conv): conv is NormalizedConversation => conv !== null);
}
