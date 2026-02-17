/**
 * Text extraction tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  isTextFile,
  getFileType,
  detectEncoding,
  countWords,
  extractFromString,
  extractFromFile,
  extractLineRange,
  searchInContent,
  formatWithLineNumbers,
} from './text.js';

describe('isTextFile', () => {
  it('should return true for text file extensions', () => {
    expect(isTextFile('file.md')).toBe(true);
    expect(isTextFile('file.txt')).toBe(true);
    expect(isTextFile('file.json')).toBe(true);
    expect(isTextFile('file.py')).toBe(true);
    expect(isTextFile('file.ts')).toBe(true);
  });

  it('should return false for non-text extensions', () => {
    expect(isTextFile('file.pdf')).toBe(false);
    expect(isTextFile('file.docx')).toBe(false);
    expect(isTextFile('file.png')).toBe(false);
    expect(isTextFile('file.zip')).toBe(false);
  });

  it('should handle uppercase extensions', () => {
    expect(isTextFile('file.MD')).toBe(true);
    expect(isTextFile('file.TXT')).toBe(true);
  });
});

describe('getFileType', () => {
  it('should identify markdown files', () => {
    expect(getFileType('file.md')).toBe('markdown');
    expect(getFileType('file.markdown')).toBe('markdown');
  });

  it('should identify plaintext files', () => {
    expect(getFileType('file.txt')).toBe('plaintext');
    expect(getFileType('file.text')).toBe('plaintext');
  });

  it('should identify programming languages', () => {
    expect(getFileType('file.js')).toBe('javascript');
    expect(getFileType('file.ts')).toBe('javascript');
    expect(getFileType('file.py')).toBe('python');
    expect(getFileType('file.go')).toBe('go');
    expect(getFileType('file.rs')).toBe('rust');
  });

  it('should return text for unknown extensions', () => {
    expect(getFileType('file.xyz')).toBe('text');
  });
});

describe('detectEncoding', () => {
  it('should detect UTF-8 BOM', () => {
    const buffer = Buffer.from([0xef, 0xbb, 0xbf, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    expect(detectEncoding(buffer)).toBe('utf-8');
  });

  it('should detect UTF-16 LE BOM', () => {
    const buffer = Buffer.from([0xff, 0xfe, 0x48, 0x00]);
    expect(detectEncoding(buffer)).toBe('utf16le');
  });

  it('should default to UTF-8', () => {
    const buffer = Buffer.from('Hello world');
    expect(detectEncoding(buffer)).toBe('utf-8');
  });
});

describe('countWords', () => {
  it('should count words correctly', () => {
    expect(countWords('hello world')).toBe(2);
    expect(countWords('one two three four')).toBe(4);
    expect(countWords('single')).toBe(1);
  });

  it('should handle multiple spaces', () => {
    expect(countWords('hello    world')).toBe(2);
  });

  it('should handle empty string', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('should handle newlines and tabs', () => {
    expect(countWords('hello\nworld\tthere')).toBe(3);
  });
});

describe('extractFromString', () => {
  it('should extract lines with numbers', () => {
    const content = 'line 1\nline 2\nline 3';
    const result = extractFromString(content);
    
    expect(result.lineCount).toBe(3);
    expect(result.lines[0].lineNumber).toBe(1);
    expect(result.lines[0].content).toBe('line 1');
    expect(result.lines[2].lineNumber).toBe(3);
  });

  it('should preserve empty lines by default', () => {
    const content = 'line 1\n\nline 3';
    const result = extractFromString(content);
    
    expect(result.lineCount).toBe(3);
    expect(result.lines[1].isEmpty).toBe(true);
  });

  it('should skip empty lines when option set', () => {
    const content = 'line 1\n\nline 3';
    const result = extractFromString(content, { skipEmptyLines: true });
    
    expect(result.lineCount).toBe(2);
  });

  it('should trim lines when option set', () => {
    const content = '  line 1  \n  line 2  ';
    const result = extractFromString(content, { trimLines: true });
    
    expect(result.lines[0].content).toBe('line 1');
    expect(result.lines[1].content).toBe('line 2');
  });

  it('should respect maxLines option', () => {
    const content = 'line 1\nline 2\nline 3\nline 4\nline 5';
    const result = extractFromString(content, { maxLines: 3 });
    
    expect(result.lineCount).toBe(3);
  });

  it('should count characters and words', () => {
    const content = 'hello world\nfoo bar';
    const result = extractFromString(content);
    
    expect(result.wordCount).toBe(4);
    expect(result.characterCount).toBe(19);
  });

  it('should handle Windows line endings', () => {
    const content = 'line 1\r\nline 2\r\nline 3';
    const result = extractFromString(content);
    
    expect(result.lineCount).toBe(3);
  });
});

describe('extractFromFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-extract-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should extract text from file', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, 'line 1\nline 2\nline 3');
    
    const result = await extractFromFile(filePath);
    
    expect(result.lineCount).toBe(3);
    expect(result.fileType).toBe('plaintext');
    expect(result.encoding).toBe('utf-8');
  });

  it('should detect markdown file type', async () => {
    const filePath = join(testDir, 'test.md');
    await writeFile(filePath, '# Heading\n\nParagraph');
    
    const result = await extractFromFile(filePath);
    
    expect(result.fileType).toBe('markdown');
  });

  it('should handle UTF-8 BOM', async () => {
    const filePath = join(testDir, 'bom.txt');
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.from('Hello world');
    await writeFile(filePath, Buffer.concat([bom, content]));
    
    const result = await extractFromFile(filePath);
    
    expect(result.content).toBe('Hello world');
    expect(result.encoding).toBe('utf-8');
  });

  it('should handle empty file', async () => {
    const filePath = join(testDir, 'empty.txt');
    await writeFile(filePath, '');
    
    const result = await extractFromFile(filePath);
    
    expect(result.lineCount).toBe(1);
    expect(result.lines[0].isEmpty).toBe(true);
  });
});

describe('extractLineRange', () => {
  const content = 'line 1\nline 2\nline 3\nline 4\nline 5';

  it('should extract specific line range', () => {
    const result = extractLineRange(content, 2, 4);
    
    expect(result.lineCount).toBe(3);
    expect(result.lines[0].lineNumber).toBe(2);
    expect(result.lines[0].content).toBe('line 2');
    expect(result.lines[2].lineNumber).toBe(4);
  });

  it('should handle out of bounds start', () => {
    const result = extractLineRange(content, -5, 2);
    
    expect(result.lines[0].lineNumber).toBe(1);
  });

  it('should handle out of bounds end', () => {
    const result = extractLineRange(content, 4, 100);
    
    expect(result.lineCount).toBe(2);
    expect(result.lines[1].lineNumber).toBe(5);
  });

  it('should preserve original line numbers', () => {
    const result = extractLineRange(content, 3, 5);
    
    expect(result.lines[0].lineNumber).toBe(3);
    expect(result.lines[1].lineNumber).toBe(4);
    expect(result.lines[2].lineNumber).toBe(5);
  });
});

describe('searchInContent', () => {
  it('should find matches with string pattern', () => {
    const result = extractFromString('hello world\nfoo hello\nbar baz');
    const matches = searchInContent(result, 'hello');
    
    expect(matches).toHaveLength(2);
    expect(matches[0].lineNumber).toBe(1);
    expect(matches[1].lineNumber).toBe(2);
  });

  it('should find matches with regex', () => {
    const result = extractFromString('line 1\nline 2\nother 3');
    const matches = searchInContent(result, /line \d/);
    
    expect(matches).toHaveLength(2);
  });

  it('should return empty array for no matches', () => {
    const result = extractFromString('hello world');
    const matches = searchInContent(result, 'xyz');
    
    expect(matches).toHaveLength(0);
  });

  it('should include matched strings', () => {
    const result = extractFromString('hello HELLO Hello');
    const matches = searchInContent(result, 'hello');
    
    expect(matches[0].matches).toHaveLength(3);
  });
});

describe('formatWithLineNumbers', () => {
  it('should format content with line numbers', () => {
    const result = extractFromString('line 1\nline 2');
    const formatted = formatWithLineNumbers(result);
    
    expect(formatted).toContain('   1 | line 1');
    expect(formatted).toContain('   2 | line 2');
  });

  it('should use custom padding', () => {
    const result = extractFromString('line 1');
    const formatted = formatWithLineNumbers(result, { padding: 2 });
    
    expect(formatted).toBe(' 1 | line 1');
  });

  it('should use custom separator', () => {
    const result = extractFromString('line 1');
    const formatted = formatWithLineNumbers(result, { separator: ': ' });
    
    expect(formatted).toBe('   1: line 1');
  });
});
