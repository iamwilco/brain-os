/**
 * ChatGPT parser tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseChatGPTExport,
  validateConversation,
  getConversationStats,
  type ParsedConversation,
} from './parser.js';

// Sample ChatGPT export data for testing
const sampleConversation = {
  title: 'Test Conversation',
  create_time: 1706745600, // 2024-02-01 00:00:00 UTC
  update_time: 1706749200, // 2024-02-01 01:00:00 UTC
  mapping: {
    'root-id': {
      id: 'root-id',
      message: null,
      parent: null,
      children: ['msg-1'],
    },
    'msg-1': {
      id: 'msg-1',
      message: {
        id: 'msg-1',
        author: { role: 'user' },
        create_time: 1706745600,
        update_time: 1706745600,
        content: {
          content_type: 'text',
          parts: ['Hello, how are you?'],
        },
        status: 'finished',
        metadata: {},
      },
      parent: 'root-id',
      children: ['msg-2'],
    },
    'msg-2': {
      id: 'msg-2',
      message: {
        id: 'msg-2',
        author: { role: 'assistant' },
        create_time: 1706745601,
        update_time: 1706745601,
        content: {
          content_type: 'text',
          parts: ["I'm doing well, thank you! How can I help you today?"],
        },
        status: 'finished',
        metadata: {
          model_slug: 'gpt-4',
          is_complete: true,
        },
      },
      parent: 'msg-1',
      children: ['msg-3'],
    },
    'msg-3': {
      id: 'msg-3',
      message: {
        id: 'msg-3',
        author: { role: 'user' },
        create_time: 1706745602,
        update_time: 1706745602,
        content: {
          content_type: 'text',
          parts: ['Can you explain recursion?'],
        },
        status: 'finished',
        metadata: {},
      },
      parent: 'msg-2',
      children: ['msg-4'],
    },
    'msg-4': {
      id: 'msg-4',
      message: {
        id: 'msg-4',
        author: { role: 'assistant' },
        create_time: 1706745603,
        update_time: 1706745603,
        content: {
          content_type: 'text',
          parts: ['Recursion is when a function calls itself. To understand recursion, you must first understand recursion.'],
        },
        status: 'finished',
        metadata: {
          model_slug: 'gpt-4',
          is_complete: true,
        },
      },
      parent: 'msg-3',
      children: [],
    },
  },
  conversation_id: 'conv-123',
  is_archived: false,
};

const sampleExport = [sampleConversation];

describe('parseChatGPTExport', () => {
  it('should parse valid ChatGPT export', () => {
    const result = parseChatGPTExport(JSON.stringify(sampleExport));
    
    expect(result.parseErrors).toHaveLength(0);
    expect(result.conversations).toHaveLength(1);
    expect(result.totalMessages).toBe(4);
  });

  it('should extract conversation metadata', () => {
    const result = parseChatGPTExport(JSON.stringify(sampleExport));
    const conv = result.conversations[0];
    
    expect(conv.id).toBe('conv-123');
    expect(conv.title).toBe('Test Conversation');
    expect(conv.model).toBe('gpt-4');
    expect(conv.isArchived).toBe(false);
  });

  it('should extract messages in order', () => {
    const result = parseChatGPTExport(JSON.stringify(sampleExport));
    const conv = result.conversations[0];
    
    expect(conv.messages).toHaveLength(4);
    expect(conv.messages[0].role).toBe('user');
    expect(conv.messages[0].content).toBe('Hello, how are you?');
    expect(conv.messages[1].role).toBe('assistant');
    expect(conv.messages[2].role).toBe('user');
    expect(conv.messages[3].role).toBe('assistant');
  });

  it('should extract message metadata', () => {
    const result = parseChatGPTExport(JSON.stringify(sampleExport));
    const assistantMsg = result.conversations[0].messages[1];
    
    expect(assistantMsg.model).toBe('gpt-4');
    expect(assistantMsg.isComplete).toBe(true);
    expect(assistantMsg.createTime).toBeInstanceOf(Date);
  });

  it('should handle invalid JSON', () => {
    const result = parseChatGPTExport('{ invalid json }');
    
    expect(result.conversations).toHaveLength(0);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0].error).toContain('Invalid JSON');
  });

  it('should handle empty export', () => {
    const result = parseChatGPTExport('[]');
    
    expect(result.conversations).toHaveLength(0);
    expect(result.totalMessages).toBe(0);
    expect(result.parseErrors).toHaveLength(0);
  });

  it('should handle conversations with text content type', () => {
    const convWithText = {
      ...sampleConversation,
      mapping: {
        'root': {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg-1'],
        },
        'msg-1': {
          id: 'msg-1',
          message: {
            id: 'msg-1',
            author: { role: 'user' },
            create_time: 1706745600,
            content: {
              content_type: 'text',
              text: 'Direct text content',
            },
            metadata: {},
          },
          parent: 'root',
          children: [],
        },
      },
    };
    
    const result = parseChatGPTExport(JSON.stringify([convWithText]));
    
    expect(result.conversations[0].messages[0].content).toBe('Direct text content');
  });

  it('should handle multi-part messages', () => {
    const convWithParts = {
      ...sampleConversation,
      mapping: {
        'root': {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg-1'],
        },
        'msg-1': {
          id: 'msg-1',
          message: {
            id: 'msg-1',
            author: { role: 'user' },
            create_time: 1706745600,
            content: {
              content_type: 'text',
              parts: ['Part 1', 'Part 2', 'Part 3'],
            },
            metadata: {},
          },
          parent: 'root',
          children: [],
        },
      },
    };
    
    const result = parseChatGPTExport(JSON.stringify([convWithParts]));
    
    expect(result.conversations[0].messages[0].content).toBe('Part 1\nPart 2\nPart 3');
  });

  it('should skip messages with no content', () => {
    const convWithEmpty = {
      ...sampleConversation,
      mapping: {
        'root': {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg-1'],
        },
        'msg-1': {
          id: 'msg-1',
          message: {
            id: 'msg-1',
            author: { role: 'user' },
            create_time: 1706745600,
            content: {
              content_type: 'text',
              parts: [''],
            },
            metadata: {},
          },
          parent: 'root',
          children: ['msg-2'],
        },
        'msg-2': {
          id: 'msg-2',
          message: {
            id: 'msg-2',
            author: { role: 'assistant' },
            create_time: 1706745601,
            content: {
              content_type: 'text',
              parts: ['Real content'],
            },
            metadata: {},
          },
          parent: 'msg-1',
          children: [],
        },
      },
    };
    
    const result = parseChatGPTExport(JSON.stringify([convWithEmpty]));
    
    // Should only have the message with content
    expect(result.conversations[0].messages).toHaveLength(1);
    expect(result.conversations[0].messages[0].content).toBe('Real content');
  });

  it('should handle multiple conversations', () => {
    const multiExport = [
      sampleConversation,
      { ...sampleConversation, title: 'Second Conversation', conversation_id: 'conv-456' },
    ];
    
    const result = parseChatGPTExport(JSON.stringify(multiExport));
    
    expect(result.conversations).toHaveLength(2);
    expect(result.conversations[0].title).toBe('Test Conversation');
    expect(result.conversations[1].title).toBe('Second Conversation');
  });
});

describe('validateConversation', () => {
  it('should validate correct conversation', () => {
    const result = validateConversation(sampleConversation);
    
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Test Conversation');
  });

  it('should return null for invalid conversation', () => {
    const result = validateConversation({ invalid: 'data' });
    
    expect(result).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const result = validateConversation({
      title: 'Test',
      // missing create_time, update_time, mapping
    });
    
    expect(result).toBeNull();
  });
});

describe('getConversationStats', () => {
  it('should calculate conversation statistics', () => {
    const result = parseChatGPTExport(JSON.stringify(sampleExport));
    const conv = result.conversations[0];
    const stats = getConversationStats(conv);
    
    expect(stats.userMessageCount).toBe(2);
    expect(stats.assistantMessageCount).toBe(2);
    expect(stats.systemMessageCount).toBe(0);
    expect(stats.totalCharacters).toBeGreaterThan(0);
    expect(stats.averageMessageLength).toBeGreaterThan(0);
    expect(stats.durationMs).toBeGreaterThan(0);
  });

  it('should handle empty conversation', () => {
    const emptyConv: ParsedConversation = {
      id: 'empty',
      title: 'Empty',
      createTime: new Date(),
      updateTime: new Date(),
      model: null,
      messageCount: 0,
      messages: [],
      isArchived: false,
      gizmoId: null,
    };
    
    const stats = getConversationStats(emptyConv);
    
    expect(stats.userMessageCount).toBe(0);
    expect(stats.assistantMessageCount).toBe(0);
    expect(stats.totalCharacters).toBe(0);
    expect(stats.averageMessageLength).toBe(0);
  });
});

describe('Edge cases', () => {
  it('should handle conversation with system message', () => {
    const convWithSystem = {
      ...sampleConversation,
      mapping: {
        'root': {
          id: 'root',
          message: {
            id: 'root',
            author: { role: 'system' },
            create_time: 1706745600,
            content: {
              content_type: 'text',
              parts: ['You are a helpful assistant.'],
            },
            metadata: {},
          },
          parent: null,
          children: ['msg-1'],
        },
        'msg-1': {
          id: 'msg-1',
          message: {
            id: 'msg-1',
            author: { role: 'user' },
            create_time: 1706745601,
            content: {
              content_type: 'text',
              parts: ['Hello'],
            },
            metadata: {},
          },
          parent: 'root',
          children: [],
        },
      },
    };
    
    const result = parseChatGPTExport(JSON.stringify([convWithSystem]));
    
    expect(result.conversations[0].messages[0].role).toBe('system');
    expect(result.conversations[0].messages[1].role).toBe('user');
  });

  it('should handle null timestamps', () => {
    const convWithNullTime = {
      ...sampleConversation,
      mapping: {
        'root': {
          id: 'root',
          message: null,
          parent: null,
          children: ['msg-1'],
        },
        'msg-1': {
          id: 'msg-1',
          message: {
            id: 'msg-1',
            author: { role: 'user' },
            create_time: null,
            update_time: null,
            content: {
              content_type: 'text',
              parts: ['Test'],
            },
            metadata: {},
          },
          parent: 'root',
          children: [],
        },
      },
    };
    
    const result = parseChatGPTExport(JSON.stringify([convWithNullTime]));
    
    expect(result.conversations[0].messages[0].createTime).toBeNull();
    expect(result.conversations[0].messages[0].updateTime).toBeNull();
  });

  it('should handle conversation with gizmo (custom GPT)', () => {
    const convWithGizmo = {
      ...sampleConversation,
      gizmo_id: 'g-abc123',
    };
    
    const result = parseChatGPTExport(JSON.stringify([convWithGizmo]));
    
    expect(result.conversations[0].gizmoId).toBe('g-abc123');
  });

  it('should handle archived conversations', () => {
    const archivedConv = {
      ...sampleConversation,
      is_archived: true,
    };
    
    const result = parseChatGPTExport(JSON.stringify([archivedConv]));
    
    expect(result.conversations[0].isArchived).toBe(true);
  });
});
