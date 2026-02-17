/**
 * Session compaction tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  isImportantMessage,
  calculateMessageTokens,
  extractKeyPoints,
  generateSummary,
  selectMessagesToPreserve,
  compactMessages,
  needsCompaction,
  getHistoryWithinBudget,
  formatCompactedHistory,
  DEFAULT_COMPACTION_CONFIG,
} from './compaction.js';
import { createSession, appendToTranscript } from './session.js';
import type { TranscriptMessage } from './session.js';

function createMessage(
  role: 'user' | 'assistant' | 'system',
  content: string,
  id?: string
): TranscriptMessage {
  return {
    id: id || `msg-${Date.now()}-${Math.random()}`,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

describe('isImportantMessage', () => {
  it('should detect important markers', () => {
    expect(isImportantMessage(createMessage('user', 'This is important!'))).toBe(true);
    expect(isImportantMessage(createMessage('user', 'Remember this for later'))).toBe(true);
    expect(isImportantMessage(createMessage('user', 'Note: key information'))).toBe(true);
    expect(isImportantMessage(createMessage('user', 'Decision: we will use X'))).toBe(true);
  });

  it('should return false for normal messages', () => {
    expect(isImportantMessage(createMessage('user', 'Hello there'))).toBe(false);
    expect(isImportantMessage(createMessage('user', 'What time is it?'))).toBe(false);
  });
});

describe('calculateMessageTokens', () => {
  it('should calculate tokens for messages', () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi there!'),
    ];

    const tokens = calculateMessageTokens(messages);

    expect(tokens).toBeGreaterThan(0);
  });

  it('should handle empty array', () => {
    expect(calculateMessageTokens([])).toBe(0);
  });
});

describe('extractKeyPoints', () => {
  it('should extract important points', () => {
    const messages = [
      createMessage('user', 'Note: This is a key point'),
      createMessage('assistant', 'I understand'),
      createMessage('user', 'TODO: Complete the task'),
    ];

    const points = extractKeyPoints(messages);

    expect(points.length).toBeGreaterThan(0);
    expect(points.some(p => p.includes('key point'))).toBe(true);
  });

  it('should extract questions', () => {
    const messages = [
      createMessage('user', 'What is the status? How can we proceed?'),
    ];

    const points = extractKeyPoints(messages);

    expect(points.some(p => p.startsWith('Q:'))).toBe(true);
  });
});

describe('generateSummary', () => {
  it('should generate summary from messages', () => {
    const messages = [
      createMessage('user', 'Hello, I need help with X'),
      createMessage('assistant', 'Sure, I can help with X'),
      createMessage('user', 'Note: This is important context'),
      createMessage('assistant', 'Got it, noted.'),
    ];

    const summary = generateSummary(messages);

    expect(summary).toContain('[Session Summary]');
    expect(summary).toContain('Messages:');
  });

  it('should respect token limit', () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      createMessage('user', `This is a very long message number ${i} with lots of content`)
    );

    const summary = generateSummary(messages, 100);

    expect(summary.length).toBeLessThan(1000);
  });
});

describe('selectMessagesToPreserve', () => {
  it('should preserve recent messages', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      createMessage('user', `Message ${i}`, `msg-${i}`)
    );

    const preserved = selectMessagesToPreserve(messages, {
      ...DEFAULT_COMPACTION_CONFIG,
      preserveRecent: 3,
    });

    expect(preserved.length).toBeGreaterThanOrEqual(3);
    expect(preserved.some(m => m.id === 'msg-9')).toBe(true);
    expect(preserved.some(m => m.id === 'msg-8')).toBe(true);
  });

  it('should preserve important messages', () => {
    const messages = [
      createMessage('user', 'Regular message', 'msg-1'),
      createMessage('user', 'Important: This must be preserved', 'msg-2'),
      createMessage('user', 'Another regular', 'msg-3'),
      createMessage('user', 'Last message', 'msg-4'),
    ];

    const preserved = selectMessagesToPreserve(messages, {
      ...DEFAULT_COMPACTION_CONFIG,
      preserveRecent: 1,
      preserveImportant: true,
    });

    expect(preserved.some(m => m.id === 'msg-2')).toBe(true);
    expect(preserved.some(m => m.id === 'msg-4')).toBe(true);
  });
});

describe('compactMessages', () => {
  it('should not compact if within budget', async () => {
    const messages = [
      createMessage('user', 'Hello'),
      createMessage('assistant', 'Hi'),
    ];

    const result = await compactMessages(messages, { maxTokens: 10000 });

    expect(result.wasCompacted).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  it('should compact long conversations', async () => {
    const messages = Array.from({ length: 100 }, (_, i) =>
      createMessage('user', `This is message number ${i} with substantial content that takes up tokens`)
    );

    const result = await compactMessages(messages, { maxTokens: 500 });

    expect(result.wasCompacted).toBe(true);
    expect(result.compactedCount).toBeLessThan(result.originalCount);
    expect(result.summary).not.toBeNull();
  });

  it('should preserve recent messages after compaction', async () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      createMessage('user', `Message ${i}`, `msg-${i}`)
    );

    const result = await compactMessages(messages, {
      maxTokens: 200,
      preserveRecent: 3,
    });

    expect(result.messages.some(m => m.id === 'msg-49')).toBe(true);
    expect(result.messages.some(m => m.id === 'msg-48')).toBe(true);
  });
});

describe('needsCompaction', () => {
  it('should return true for long conversations', () => {
    const messages = Array.from({ length: 100 }, () =>
      createMessage('user', 'A long message that takes up many tokens')
    );

    expect(needsCompaction(messages, 500)).toBe(true);
  });

  it('should return false for short conversations', () => {
    const messages = [createMessage('user', 'Hi')];

    expect(needsCompaction(messages, 10000)).toBe(false);
  });
});

describe('getHistoryWithinBudget', () => {
  it('should return messages within budget', () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      createMessage('user', `Message ${i}`)
    );

    const result = getHistoryWithinBudget(messages, 100);

    expect(result.length).toBeLessThan(messages.length);
    expect(result[result.length - 1].content).toBe('Message 19');
  });

  it('should prioritize recent messages', () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      createMessage('user', `Message ${i}`, `msg-${i}`)
    );

    const result = getHistoryWithinBudget(messages, 50);

    // Should include most recent
    expect(result[result.length - 1].id).toBe('msg-9');
  });
});

describe('formatCompactedHistory', () => {
  it('should format compaction result', () => {
    const result = {
      messages: [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there'),
      ],
      summary: '[Session Summary]\n\nSome summary content',
      originalCount: 10,
      compactedCount: 2,
      tokensUsed: 50,
      wasCompacted: true,
    };

    const formatted = formatCompactedHistory(result);

    expect(formatted).toContain('[Session Summary]');
    expect(formatted).toContain('USER: Hello');
    expect(formatted).toContain('ASSISTANT: Hi there');
  });

  it('should skip summary if not compacted', () => {
    const result = {
      messages: [createMessage('user', 'Hello')],
      summary: null,
      originalCount: 1,
      compactedCount: 1,
      tokensUsed: 10,
      wasCompacted: false,
    };

    const formatted = formatCompactedHistory(result);

    expect(formatted).not.toContain('[Session Summary]');
    expect(formatted).toContain('USER: Hello');
  });
});

describe('File-based operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-compaction-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should compact session from file', async () => {
    // Create session with many messages
    const session = await createSession(testDir, 'agent_test');
    
    for (let i = 0; i < 30; i++) {
      await appendToTranscript(testDir, session.id, {
        role: 'user',
        content: `This is message ${i} with enough content to accumulate tokens`,
      });
    }

    // Import the function
    const { compactSessionTranscript } = await import('./compaction.js');
    const result = await compactSessionTranscript(testDir, session.id, {
      maxTokens: 300,
    });

    expect(result.originalCount).toBe(30);
    expect(result.wasCompacted).toBe(true);
  });
});

describe('DEFAULT_COMPACTION_CONFIG', () => {
  it('should have reasonable defaults', () => {
    expect(DEFAULT_COMPACTION_CONFIG.maxTokens).toBeGreaterThan(0);
    expect(DEFAULT_COMPACTION_CONFIG.summaryTokens).toBeGreaterThan(0);
    expect(DEFAULT_COMPACTION_CONFIG.preserveRecent).toBeGreaterThan(0);
  });
});
