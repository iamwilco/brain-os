/**
 * ChatGPT normalizer tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ParsedConversation, ParsedMessage } from '../ingest/chatgpt/index.js';
import {
  normalizeConversation,
  toJsonLine,
  toJsonl,
  writeJsonlFile,
  createJsonlStream,
  parseJsonLine,
  parseJsonl,
  type NormalizedConversation,
} from './chatgpt.js';

// Sample parsed conversation for testing
const sampleMessage: ParsedMessage = {
  id: 'msg-1',
  role: 'user',
  content: 'Hello, how are you?',
  createTime: new Date('2024-02-01T12:00:00Z'),
  updateTime: new Date('2024-02-01T12:00:00Z'),
  model: null,
  isComplete: true,
  parentId: null,
};

const sampleAssistantMessage: ParsedMessage = {
  id: 'msg-2',
  role: 'assistant',
  content: 'I am doing well, thank you!',
  createTime: new Date('2024-02-01T12:00:01Z'),
  updateTime: new Date('2024-02-01T12:00:01Z'),
  model: 'gpt-4',
  isComplete: true,
  parentId: 'msg-1',
};

const sampleConversation: ParsedConversation = {
  id: 'conv-123',
  title: 'Test Conversation',
  createTime: new Date('2024-02-01T12:00:00Z'),
  updateTime: new Date('2024-02-01T13:00:00Z'),
  model: 'gpt-4',
  messageCount: 2,
  messages: [sampleMessage, sampleAssistantMessage],
  isArchived: false,
  gizmoId: null,
};

describe('normalizeConversation', () => {
  it('should normalize conversation to standard format', () => {
    const normalized = normalizeConversation(sampleConversation);
    
    expect(normalized.id).toBe('conv-123');
    expect(normalized.title).toBe('Test Conversation');
    expect(normalized.source).toBe('chatgpt');
    expect(normalized.model).toBe('gpt-4');
    expect(normalized.message_count).toBe(2);
  });

  it('should convert timestamps to ISO format', () => {
    const normalized = normalizeConversation(sampleConversation);
    
    expect(normalized.created_at).toBe('2024-02-01T12:00:00.000Z');
    expect(normalized.updated_at).toBe('2024-02-01T13:00:00.000Z');
  });

  it('should normalize messages', () => {
    const normalized = normalizeConversation(sampleConversation);
    
    expect(normalized.messages).toHaveLength(2);
    expect(normalized.messages[0].role).toBe('user');
    expect(normalized.messages[0].timestamp).toBe('2024-02-01T12:00:00.000Z');
    expect(normalized.messages[1].role).toBe('assistant');
    expect(normalized.messages[1].model).toBe('gpt-4');
  });

  it('should include metadata', () => {
    const normalized = normalizeConversation(sampleConversation);
    
    expect(normalized.metadata.is_archived).toBe(false);
    expect(normalized.metadata.gizmo_id).toBeNull();
  });

  it('should handle archived conversations with gizmo', () => {
    const archivedConv: ParsedConversation = {
      ...sampleConversation,
      isArchived: true,
      gizmoId: 'g-abc123',
    };
    
    const normalized = normalizeConversation(archivedConv);
    
    expect(normalized.metadata.is_archived).toBe(true);
    expect(normalized.metadata.gizmo_id).toBe('g-abc123');
  });

  it('should handle null message timestamps', () => {
    const convWithNullTime: ParsedConversation = {
      ...sampleConversation,
      messages: [{
        ...sampleMessage,
        createTime: null,
      }],
    };
    
    const normalized = normalizeConversation(convWithNullTime);
    
    expect(normalized.messages[0].timestamp).toBeNull();
  });
});

describe('toJsonLine', () => {
  it('should produce valid JSON', () => {
    const normalized = normalizeConversation(sampleConversation);
    const line = toJsonLine(normalized);
    
    expect(() => JSON.parse(line)).not.toThrow();
  });

  it('should not contain newlines', () => {
    const normalized = normalizeConversation(sampleConversation);
    const line = toJsonLine(normalized);
    
    expect(line).not.toContain('\n');
  });

  it('should be parseable back to original', () => {
    const normalized = normalizeConversation(sampleConversation);
    const line = toJsonLine(normalized);
    const parsed = JSON.parse(line);
    
    expect(parsed.id).toBe(normalized.id);
    expect(parsed.title).toBe(normalized.title);
    expect(parsed.messages).toHaveLength(normalized.messages.length);
  });
});

describe('toJsonl', () => {
  it('should produce valid JSONL for multiple conversations', () => {
    const conversations = [sampleConversation, sampleConversation];
    const jsonl = toJsonl(conversations);
    
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
    
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('should handle empty array', () => {
    const jsonl = toJsonl([]);
    
    expect(jsonl).toBe('');
  });

  it('should handle single conversation', () => {
    const jsonl = toJsonl([sampleConversation]);
    
    expect(jsonl.split('\n')).toHaveLength(1);
    expect(() => JSON.parse(jsonl)).not.toThrow();
  });
});

describe('parseJsonLine', () => {
  it('should parse valid JSON line', () => {
    const normalized = normalizeConversation(sampleConversation);
    const line = toJsonLine(normalized);
    const parsed = parseJsonLine(line);
    
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('conv-123');
  });

  it('should return null for invalid JSON', () => {
    const result = parseJsonLine('{ invalid json }');
    
    expect(result).toBeNull();
  });

  it('should return null for empty line', () => {
    const result = parseJsonLine('');
    
    expect(result).toBeNull();
  });

  it('should return null for whitespace only', () => {
    const result = parseJsonLine('   ');
    
    expect(result).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const result = parseJsonLine('{"foo": "bar"}');
    
    expect(result).toBeNull();
  });
});

describe('parseJsonl', () => {
  it('should parse JSONL content', () => {
    const jsonl = toJsonl([sampleConversation, sampleConversation]);
    const parsed = parseJsonl(jsonl);
    
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('conv-123');
  });

  it('should skip invalid lines', () => {
    const jsonl = toJsonl([sampleConversation]) + '\n{ invalid }';
    const parsed = parseJsonl(jsonl);
    
    expect(parsed).toHaveLength(1);
  });

  it('should handle empty content', () => {
    const parsed = parseJsonl('');
    
    expect(parsed).toHaveLength(0);
  });
});

describe('writeJsonlFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-normalize-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should write JSONL file', async () => {
    const outputPath = join(testDir, 'output.jsonl');
    const result = await writeJsonlFile([sampleConversation], outputPath);
    
    expect(result.conversationCount).toBe(1);
    expect(result.messageCount).toBe(2);
    expect(result.outputPath).toBe(outputPath);
    
    const content = await readFile(outputPath, 'utf-8');
    expect(content.trim().split('\n')).toHaveLength(1);
  });

  it('should write multiple conversations', async () => {
    const outputPath = join(testDir, 'multi.jsonl');
    const conversations = [sampleConversation, sampleConversation, sampleConversation];
    const result = await writeJsonlFile(conversations, outputPath);
    
    expect(result.conversationCount).toBe(3);
    expect(result.messageCount).toBe(6);
    
    const content = await readFile(outputPath, 'utf-8');
    expect(content.trim().split('\n')).toHaveLength(3);
  });

  it('should end file with newline', async () => {
    const outputPath = join(testDir, 'newline.jsonl');
    await writeJsonlFile([sampleConversation], outputPath);
    
    const content = await readFile(outputPath, 'utf-8');
    expect(content.endsWith('\n')).toBe(true);
  });
});

describe('JsonlWriter (streaming)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-stream-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should write conversations via stream', async () => {
    const outputPath = join(testDir, 'stream.jsonl');
    const writer = createJsonlStream(outputPath);
    
    writer.write(sampleConversation);
    writer.write(sampleConversation);
    
    const result = await writer.close();
    
    expect(result.conversationCount).toBe(2);
    expect(result.messageCount).toBe(4);
    
    const content = await readFile(outputPath, 'utf-8');
    expect(content.trim().split('\n')).toHaveLength(2);
  });

  it('should throw if writing after close', async () => {
    const outputPath = join(testDir, 'closed.jsonl');
    const writer = createJsonlStream(outputPath);
    
    await writer.close();
    
    expect(() => writer.write(sampleConversation)).toThrow('Writer is closed');
  });

  it('should return same result on multiple close calls', async () => {
    const outputPath = join(testDir, 'multi-close.jsonl');
    const writer = createJsonlStream(outputPath);
    
    writer.write(sampleConversation);
    
    const result1 = await writer.close();
    const result2 = await writer.close();
    
    expect(result1).toEqual(result2);
  });
});
