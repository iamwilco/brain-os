/**
 * Markdown export tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { NormalizedConversation } from '../normalize/chatgpt.js';
import {
  slugify,
  generateFilename,
  generateFrontmatter,
  formatMessage,
  toMarkdown,
  writeMarkdownFile,
  writeMarkdownFiles,
  parseMarkdownFrontmatter,
} from './markdown.js';

// Sample normalized conversation for testing
const sampleConversation: NormalizedConversation = {
  id: 'conv-123',
  title: 'Test Conversation About Coding',
  source: 'chatgpt',
  created_at: '2024-02-01T12:00:00.000Z',
  updated_at: '2024-02-01T13:00:00.000Z',
  model: 'gpt-4',
  message_count: 2,
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello, can you help me with TypeScript?',
      timestamp: '2024-02-01T12:00:00.000Z',
      model: null,
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Of course! I would be happy to help you with TypeScript. What would you like to know?',
      timestamp: '2024-02-01T12:00:05.000Z',
      model: 'gpt-4',
    },
  ],
  metadata: {
    is_archived: false,
    gizmo_id: null,
  },
};

describe('slugify', () => {
  it('should convert title to URL-safe slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('should remove special characters', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('should handle multiple spaces', () => {
    expect(slugify('Hello   World')).toBe('hello-world');
  });

  it('should truncate long titles', () => {
    const longTitle = 'A'.repeat(100);
    expect(slugify(longTitle).length).toBeLessThanOrEqual(50);
  });

  it('should return untitled for empty string', () => {
    expect(slugify('')).toBe('untitled');
  });

  it('should handle titles with only special chars', () => {
    expect(slugify('!@#$%')).toBe('untitled');
  });
});

describe('generateFilename', () => {
  it('should generate filename with date and slug', () => {
    const filename = generateFilename(sampleConversation);
    
    expect(filename).toBe('2024-02-01-test-conversation-about-coding.md');
  });

  it('should handle conversation with special characters in title', () => {
    const conv: NormalizedConversation = {
      ...sampleConversation,
      title: 'What is C++? A Guide!',
    };
    
    const filename = generateFilename(conv);
    
    expect(filename).toBe('2024-02-01-what-is-c-a-guide.md');
  });
});

describe('generateFrontmatter', () => {
  it('should generate valid YAML frontmatter', () => {
    const frontmatter = generateFrontmatter(sampleConversation);
    
    expect(frontmatter).toContain('---');
    expect(frontmatter).toContain('title: "Test Conversation About Coding"');
    expect(frontmatter).toContain('id: conv-123');
    expect(frontmatter).toContain('source: chatgpt');
    expect(frontmatter).toContain('model: gpt-4');
  });

  it('should include tags', () => {
    const frontmatter = generateFrontmatter(sampleConversation);
    
    expect(frontmatter).toContain('tags:');
    expect(frontmatter).toContain('  - chatgpt');
    expect(frontmatter).toContain('  - conversation');
  });

  it('should include gizmo_id when present', () => {
    const conv: NormalizedConversation = {
      ...sampleConversation,
      metadata: { ...sampleConversation.metadata, gizmo_id: 'g-abc123' },
    };
    
    const frontmatter = generateFrontmatter(conv);
    
    expect(frontmatter).toContain('gizmo_id: g-abc123');
  });

  it('should include archived flag when true', () => {
    const conv: NormalizedConversation = {
      ...sampleConversation,
      metadata: { ...sampleConversation.metadata, is_archived: true },
    };
    
    const frontmatter = generateFrontmatter(conv);
    
    expect(frontmatter).toContain('archived: true');
  });

  it('should escape quotes in title', () => {
    const conv: NormalizedConversation = {
      ...sampleConversation,
      title: 'What is "TypeScript"?',
    };
    
    const frontmatter = generateFrontmatter(conv);
    
    expect(frontmatter).toContain('title: "What is \\"TypeScript\\"?"');
  });
});

describe('formatMessage', () => {
  const defaultOptions = {
    includeMetadata: true,
    includeTimestamps: true,
    roleLabels: {
      user: '**User**',
      assistant: '**Assistant**',
      system: '**System**',
      tool: '**Tool**',
    },
  };

  it('should format user message correctly', () => {
    const formatted = formatMessage(sampleConversation.messages[0], defaultOptions);
    
    expect(formatted).toContain('### **User**');
    expect(formatted).toContain('Hello, can you help me with TypeScript?');
  });

  it('should include timestamp when enabled', () => {
    const formatted = formatMessage(sampleConversation.messages[0], defaultOptions);
    
    expect(formatted).toMatch(/\(\d{2}:\d{2}/);
  });

  it('should omit timestamp when disabled', () => {
    const options = { ...defaultOptions, includeTimestamps: false };
    const formatted = formatMessage(sampleConversation.messages[0], options);
    
    expect(formatted).not.toContain('(');
    expect(formatted).toContain('### **User**');
  });

  it('should handle null timestamp', () => {
    const msg = { ...sampleConversation.messages[0], timestamp: null };
    const formatted = formatMessage(msg, defaultOptions);
    
    expect(formatted).toContain('### **User**');
    expect(formatted).not.toContain('(');
  });
});

describe('toMarkdown', () => {
  it('should generate complete markdown document', () => {
    const markdown = toMarkdown(sampleConversation);
    
    expect(markdown).toContain('---');
    expect(markdown).toContain('# Test Conversation About Coding');
    expect(markdown).toContain('**User**');
    expect(markdown).toContain('**Assistant**');
  });

  it('should include all messages', () => {
    const markdown = toMarkdown(sampleConversation);
    
    expect(markdown).toContain('Hello, can you help me with TypeScript?');
    expect(markdown).toContain('Of course!');
  });

  it('should omit frontmatter when disabled', () => {
    const markdown = toMarkdown(sampleConversation, { includeMetadata: false });
    
    expect(markdown).not.toMatch(/^---/);
    expect(markdown).toContain('# Test Conversation About Coding');
  });
});

describe('writeMarkdownFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-md-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should write markdown file', async () => {
    const result = await writeMarkdownFile(sampleConversation, testDir);
    
    expect(result.filename).toBe('2024-02-01-test-conversation-about-coding.md');
    expect(result.bytesWritten).toBeGreaterThan(0);
    
    const content = await readFile(result.filePath, 'utf-8');
    expect(content).toContain('# Test Conversation About Coding');
  });

  it('should create directory if it does not exist', async () => {
    const nestedDir = join(testDir, 'nested', 'path');
    const result = await writeMarkdownFile(sampleConversation, nestedDir);
    
    const content = await readFile(result.filePath, 'utf-8');
    expect(content).toContain('# Test Conversation About Coding');
  });
});

describe('writeMarkdownFiles', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-md-batch-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should write multiple markdown files', async () => {
    const conversations = [
      sampleConversation,
      { ...sampleConversation, id: 'conv-456', title: 'Another Conversation' },
    ];
    
    const result = await writeMarkdownFiles(conversations, testDir);
    
    expect(result.written).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.totalBytesWritten).toBeGreaterThan(0);
    
    const files = await readdir(testDir);
    expect(files).toHaveLength(2);
  });

  it('should handle empty array', async () => {
    const result = await writeMarkdownFiles([], testDir);
    
    expect(result.written).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.totalBytesWritten).toBe(0);
  });
});

describe('parseMarkdownFrontmatter', () => {
  it('should parse frontmatter and content', () => {
    const markdown = `---
title: "Test"
id: 123
archived: true
---
# Content here`;

    const { frontmatter, content } = parseMarkdownFrontmatter(markdown);
    
    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.title).toBe('Test');
    expect(frontmatter?.id).toBe(123);
    expect(frontmatter?.archived).toBe(true);
    expect(content).toContain('# Content here');
  });

  it('should return null frontmatter for content without frontmatter', () => {
    const markdown = '# Just content\n\nNo frontmatter here.';
    
    const { frontmatter, content } = parseMarkdownFrontmatter(markdown);
    
    expect(frontmatter).toBeNull();
    expect(content).toBe(markdown);
  });

  it('should handle empty frontmatter', () => {
    const markdown = `---
---
# Content`;

    const { frontmatter, content } = parseMarkdownFrontmatter(markdown);
    
    expect(frontmatter).toEqual({});
    expect(content).toContain('# Content');
  });
});
