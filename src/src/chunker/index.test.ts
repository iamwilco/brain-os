/**
 * Chunker tests
 */

import { describe, it, expect } from 'vitest';
import {
  chunkText,
  chunkMarkdown,
  chunkCode,
  chunkConversation,
  getChunkStats,
} from './index.js';

describe('chunkText', () => {
  it('should return empty array for empty content', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('should return single chunk for small content', () => {
    const content = 'Hello world';
    const chunks = chunkText(content);
    
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Hello world');
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
  });

  it('should preserve line numbers', () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const chunks = chunkText(content);
    
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(5);
  });

  it('should split large content into multiple chunks', () => {
    const paragraph = 'This is a test paragraph with some content. '.repeat(20);
    const content = `${paragraph}\n\n${paragraph}\n\n${paragraph}\n\n${paragraph}`;
    
    const chunks = chunkText(content, { maxChunkSize: 500, minChunkSize: 200 });
    
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should respect minChunkSize', () => {
    const paragraph = 'Short paragraph.\n\n'.repeat(10);
    const content = paragraph.trim();
    
    const chunks = chunkText(content, { minChunkSize: 100, maxChunkSize: 500 });
    
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].charCount).toBeGreaterThanOrEqual(100);
    }
  });

  it('should use correct chunk indices', () => {
    const content = 'Para 1.\n\nPara 2.\n\nPara 3.\n\nPara 4.'.repeat(50);
    const chunks = chunkText(content, { maxChunkSize: 200, minChunkSize: 50 });
    
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it('should handle single line content', () => {
    const content = 'A'.repeat(100);
    const chunks = chunkText(content);
    
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
  });

  it('should handle content with only newlines', () => {
    const content = '\n\n\n\n';
    const chunks = chunkText(content);
    
    expect(chunks).toHaveLength(0);
  });
});

describe('chunkText with splitOn options', () => {
  it('should split on paragraphs by default', () => {
    const content = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const chunks = chunkText(content, { maxChunkSize: 50, minChunkSize: 10 });
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should split on sentences', () => {
    const content = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const chunks = chunkText(content, { 
      splitOn: 'sentence',
      maxChunkSize: 40,
      minChunkSize: 10,
    });
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should split on lines', () => {
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const chunks = chunkText(content, {
      splitOn: 'line',
      maxChunkSize: 20,
      minChunkSize: 5,
    });
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should split on characters', () => {
    const content = 'A'.repeat(3000);
    const chunks = chunkText(content, {
      splitOn: 'char',
      maxChunkSize: 1000,
      minChunkSize: 500,
    });
    
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });
});

describe('chunk line mapping', () => {
  it('should correctly map start and end lines for multi-line content', () => {
    const lines = [];
    for (let i = 1; i <= 100; i++) {
      lines.push(`This is line number ${i} with some content.`);
    }
    const content = lines.join('\n');
    
    const chunks = chunkText(content, { 
      splitOn: 'line',
      maxChunkSize: 500,
      minChunkSize: 200,
    });
    
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[chunks.length - 1].endLine).toBe(100);
    
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startLine).toBeLessThanOrEqual(chunks[i - 1].endLine + 1);
    }
  });

  it('should track character positions', () => {
    const content = 'Hello\nWorld';
    const chunks = chunkText(content);
    
    expect(chunks[0].startChar).toBe(0);
    expect(chunks[0].endChar).toBe(content.length - 1);
  });
});

describe('chunkMarkdown', () => {
  it('should chunk markdown content', () => {
    const content = '# Heading\n\nFirst paragraph.\n\n## Subheading\n\nSecond paragraph.';
    const chunks = chunkMarkdown(content);
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].content).toContain('Heading');
  });

  it('should handle code blocks', () => {
    const content = 'Text.\n\n```js\ncode();\n```\n\nMore text.';
    const chunks = chunkMarkdown(content);
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('chunkCode', () => {
  it('should chunk code content', () => {
    const content = 'function one() {\n  return 1;\n}\n\nfunction two() {\n  return 2;\n}';
    const chunks = chunkCode(content);
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('should use larger chunk sizes for code', () => {
    const content = 'const x = 1;\n'.repeat(200);
    const chunks = chunkCode(content);
    
    if (chunks.length > 1) {
      expect(chunks[0].charCount).toBeGreaterThanOrEqual(500);
    }
  });
});

describe('chunkConversation', () => {
  it('should chunk conversation content', () => {
    const content = 'User: Hello?\n\nAssistant: Hi there!\n\nUser: How are you?';
    const chunks = chunkConversation(content);
    
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getChunkStats', () => {
  it('should return zero stats for empty chunks', () => {
    const stats = getChunkStats([]);
    
    expect(stats.count).toBe(0);
    expect(stats.totalChars).toBe(0);
    expect(stats.avgChunkSize).toBe(0);
  });

  it('should calculate correct statistics', () => {
    const content = 'A'.repeat(3000);
    const chunks = chunkText(content, {
      splitOn: 'char',
      maxChunkSize: 1000,
      minChunkSize: 500,
    });
    
    const stats = getChunkStats(chunks);
    
    expect(stats.count).toBe(chunks.length);
    expect(stats.totalChars).toBeGreaterThan(0);
    expect(stats.avgChunkSize).toBeGreaterThan(0);
    expect(stats.minChunkSize).toBeLessThanOrEqual(stats.maxChunkSize);
  });
});
