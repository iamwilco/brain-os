/**
 * ChatGPT storage tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  CHATGPT_DIRS,
  ensureDirectoryStructure,
  generateTimestampedFilename,
  storeRawFile,
  storeMarkdownFiles,
  importChatGPTExport,
  getStorageStats,
} from './storage.js';
import type { NormalizedConversation } from '../../normalize/chatgpt.js';

// Sample ChatGPT export data
const sampleExport = [
  {
    title: 'Test Conversation',
    create_time: 1706745600,
    update_time: 1706749200,
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
          content: {
            content_type: 'text',
            parts: ['Hello!'],
          },
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
          content: {
            content_type: 'text',
            parts: ['Hi there!'],
          },
          metadata: { model_slug: 'gpt-4' },
        },
        parent: 'msg-1',
        children: [],
      },
    },
    conversation_id: 'conv-123',
  },
];

// Sample normalized conversation
const sampleNormalized: NormalizedConversation = {
  id: 'conv-123',
  title: 'Test Conversation',
  source: 'chatgpt',
  created_at: '2024-02-01T00:00:00.000Z',
  updated_at: '2024-02-01T01:00:00.000Z',
  model: 'gpt-4',
  message_count: 2,
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello!',
      timestamp: '2024-02-01T00:00:00.000Z',
      model: null,
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: '2024-02-01T00:00:01.000Z',
      model: 'gpt-4',
    },
  ],
  metadata: {
    is_archived: false,
    gizmo_id: null,
  },
};

describe('CHATGPT_DIRS', () => {
  it('should define correct directory paths', () => {
    expect(CHATGPT_DIRS.root).toBe('70_Sources/chatgpt');
    expect(CHATGPT_DIRS.raw).toBe('70_Sources/chatgpt/raw');
    expect(CHATGPT_DIRS.parsed).toBe('70_Sources/chatgpt/parsed');
    expect(CHATGPT_DIRS.md).toBe('70_Sources/chatgpt/md');
  });
});

describe('generateTimestampedFilename', () => {
  it('should add timestamp to filename', () => {
    const filename = generateTimestampedFilename('conversations.json');
    
    expect(filename).toMatch(/^conversations-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
  });

  it('should handle files without extension', () => {
    const filename = generateTimestampedFilename('myfile');
    
    expect(filename).toMatch(/^myfile-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it('should preserve extension', () => {
    const filename = generateTimestampedFilename('data.jsonl');
    
    expect(filename).toContain('.jsonl');
  });
});

describe('ensureDirectoryStructure', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-storage-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create all required directories', async () => {
    await ensureDirectoryStructure(testDir);
    
    const dirs = await readdir(join(testDir, '70_Sources/chatgpt'));
    expect(dirs).toContain('raw');
    expect(dirs).toContain('parsed');
    expect(dirs).toContain('md');
  });

  it('should be idempotent', async () => {
    await ensureDirectoryStructure(testDir);
    await ensureDirectoryStructure(testDir);
    
    const dirs = await readdir(join(testDir, '70_Sources/chatgpt'));
    expect(dirs).toHaveLength(3);
  });
});

describe('storeRawFile', () => {
  let testDir: string;
  let sourceFile: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-raw-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create a source file
    sourceFile = join(testDir, 'source.json');
    await writeFile(sourceFile, JSON.stringify(sampleExport));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should copy file to raw directory', async () => {
    const destPath = await storeRawFile(sourceFile, testDir);
    
    expect(destPath).toContain('70_Sources/chatgpt/raw');
    expect(destPath).toContain('source-');
    
    const content = await readFile(destPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(sampleExport);
  });

  it('should create timestamped filename', async () => {
    const destPath = await storeRawFile(sourceFile, testDir);
    
    expect(destPath).toMatch(/source-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/);
  });
});

describe('storeMarkdownFiles', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-md-storage-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should store markdown files in md directory', async () => {
    const result = await storeMarkdownFiles([sampleNormalized], testDir);
    
    expect(result.written).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    
    const mdDir = join(testDir, CHATGPT_DIRS.md);
    const files = await readdir(mdDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.md$/);
  });
});

describe('importChatGPTExport', () => {
  let testDir: string;
  let sourceFile: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-import-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    sourceFile = join(testDir, 'conversations.json');
    await writeFile(sourceFile, JSON.stringify(sampleExport));
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should run full import pipeline', async () => {
    const result = await importChatGPTExport(sourceFile, { vaultPath: testDir });
    
    expect(result.rawFile).not.toBeNull();
    expect(result.jsonlFile).not.toBeNull();
    expect(result.markdownResult).not.toBeNull();
    expect(result.conversationCount).toBe(1);
    expect(result.messageCount).toBe(2);
  });

  it('should skip raw file when option set', async () => {
    const result = await importChatGPTExport(sourceFile, {
      vaultPath: testDir,
      skipRaw: true,
    });
    
    expect(result.rawFile).toBeNull();
    expect(result.jsonlFile).not.toBeNull();
  });

  it('should skip jsonl when option set', async () => {
    const result = await importChatGPTExport(sourceFile, {
      vaultPath: testDir,
      skipJsonl: true,
    });
    
    expect(result.rawFile).not.toBeNull();
    expect(result.jsonlFile).toBeNull();
  });

  it('should skip markdown when option set', async () => {
    const result = await importChatGPTExport(sourceFile, {
      vaultPath: testDir,
      skipMarkdown: true,
    });
    
    expect(result.rawFile).not.toBeNull();
    expect(result.markdownResult).toBeNull();
  });

  it('should create correct directory structure', async () => {
    await importChatGPTExport(sourceFile, { vaultPath: testDir });
    
    const chatgptDir = join(testDir, '70_Sources/chatgpt');
    const dirs = await readdir(chatgptDir);
    
    expect(dirs).toContain('raw');
    expect(dirs).toContain('parsed');
    expect(dirs).toContain('md');
  });
});

describe('getStorageStats', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-stats-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return zero counts for empty vault', async () => {
    const stats = await getStorageStats(testDir);
    
    expect(stats.rawCount).toBe(0);
    expect(stats.parsedCount).toBe(0);
    expect(stats.mdCount).toBe(0);
  });

  it('should count files correctly', async () => {
    // Create directory structure with files
    await ensureDirectoryStructure(testDir);
    
    const rawDir = join(testDir, CHATGPT_DIRS.raw);
    const parsedDir = join(testDir, CHATGPT_DIRS.parsed);
    const mdDir = join(testDir, CHATGPT_DIRS.md);
    
    await writeFile(join(rawDir, 'test1.json'), '{}');
    await writeFile(join(rawDir, 'test2.json'), '{}');
    await writeFile(join(parsedDir, 'test.jsonl'), '{}');
    await writeFile(join(mdDir, 'test.md'), '# Test');
    await writeFile(join(mdDir, 'test2.md'), '# Test 2');
    await writeFile(join(mdDir, 'test3.md'), '# Test 3');
    
    const stats = await getStorageStats(testDir);
    
    expect(stats.rawCount).toBe(2);
    expect(stats.parsedCount).toBe(1);
    expect(stats.mdCount).toBe(3);
  });
});
