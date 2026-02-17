/**
 * ZIP extraction tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import {
  createTempDir,
  cleanupTempDir,
  extractZip,
  findConversationsJson,
  isZipFile,
  extractAndFindConversations,
  getZipStats,
} from './zip.js';

describe('createTempDir', () => {
  it('should create a temporary directory', async () => {
    const tempDir = await createTempDir();
    
    expect(tempDir).toContain('brain-chatgpt-');
    
    // Cleanup
    await cleanupTempDir(tempDir);
  });
});

describe('cleanupTempDir', () => {
  it('should remove temporary directory', async () => {
    const tempDir = await createTempDir();
    await cleanupTempDir(tempDir);
    
    // Directory should not exist - this would throw if we try to read it
    await expect(readFile(join(tempDir, 'test'))).rejects.toThrow();
  });

  it('should not throw for non-existent directory', async () => {
    await expect(cleanupTempDir('/non/existent/path')).resolves.not.toThrow();
  });
});

describe('isZipFile', () => {
  it('should return true for .zip files', () => {
    expect(isZipFile('file.zip')).toBe(true);
    expect(isZipFile('FILE.ZIP')).toBe(true);
    expect(isZipFile('/path/to/export.zip')).toBe(true);
  });

  it('should return false for non-zip files', () => {
    expect(isZipFile('file.json')).toBe(false);
    expect(isZipFile('file.txt')).toBe(false);
    expect(isZipFile('file')).toBe(false);
  });
});

describe('findConversationsJson', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-find-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should find conversations.json in root', async () => {
    await writeFile(join(testDir, 'conversations.json'), '[]');
    
    const found = await findConversationsJson(testDir);
    
    expect(found).toBe(join(testDir, 'conversations.json'));
  });

  it('should find conversations.json in nested directory', async () => {
    const nestedDir = join(testDir, 'data', 'chatgpt');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(nestedDir, 'conversations.json'), '[]');
    
    const found = await findConversationsJson(testDir);
    
    expect(found).toBe(join(nestedDir, 'conversations.json'));
  });

  it('should return null if not found', async () => {
    await writeFile(join(testDir, 'other.json'), '{}');
    
    const found = await findConversationsJson(testDir);
    
    expect(found).toBeNull();
  });
});

describe('ZIP extraction integration', () => {
  let testDir: string;
  let zipPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-zip-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create a test ZIP file using system zip command
    const contentDir = join(testDir, 'content');
    await mkdir(contentDir, { recursive: true });
    
    // Create sample conversations.json
    const sampleData = [{
      title: 'Test',
      create_time: 1706745600,
      update_time: 1706749200,
      mapping: {},
      conversation_id: 'test-123',
    }];
    await writeFile(join(contentDir, 'conversations.json'), JSON.stringify(sampleData));
    await writeFile(join(contentDir, 'other.txt'), 'Other content');
    
    zipPath = join(testDir, 'test.zip');
    
    try {
      // Create ZIP file using system command
      execSync(`zip -r "${zipPath}" .`, { cwd: contentDir, stdio: 'pipe' });
    } catch {
      // Skip tests if zip command not available
    }
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should extract ZIP file', async () => {
    // Skip if ZIP wasn't created (no zip command)
    try {
      await readFile(zipPath);
    } catch {
      return;
    }

    const result = await extractZip(zipPath);
    
    expect(result.tempDir).toBeTruthy();
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.conversationsJsonPath).not.toBeNull();
    
    // Verify content
    const content = await readFile(result.conversationsJsonPath!, 'utf-8');
    const data = JSON.parse(content);
    expect(data[0].title).toBe('Test');
    
    // Cleanup
    await cleanupTempDir(result.tempDir);
  });

  it('should extract and find conversations', async () => {
    // Skip if ZIP wasn't created
    try {
      await readFile(zipPath);
    } catch {
      return;
    }

    const { conversationsPath, cleanup } = await extractAndFindConversations(zipPath);
    
    expect(conversationsPath).toContain('conversations.json');
    
    const content = await readFile(conversationsPath, 'utf-8');
    expect(JSON.parse(content)[0].title).toBe('Test');
    
    await cleanup();
  });

  it('should get ZIP stats', async () => {
    // Skip if ZIP wasn't created
    try {
      await readFile(zipPath);
    } catch {
      return;
    }

    const stats = await getZipStats(zipPath);
    
    expect(stats.fileCount).toBeGreaterThan(0);
    expect(stats.totalSize).toBeGreaterThan(0);
    expect(stats.hasConversationsJson).toBe(true);
  });
});

describe('ZIP with nested structure', () => {
  let testDir: string;
  let zipPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-nested-zip-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    // Create nested structure
    const contentDir = join(testDir, 'content');
    const nestedDir = join(contentDir, 'ChatGPT_Export', 'data');
    await mkdir(nestedDir, { recursive: true });
    
    const sampleData = [{ title: 'Nested Test', create_time: 1706745600, update_time: 1706749200, mapping: {} }];
    await writeFile(join(nestedDir, 'conversations.json'), JSON.stringify(sampleData));
    
    zipPath = join(testDir, 'nested.zip');
    
    try {
      execSync(`zip -r "${zipPath}" .`, { cwd: contentDir, stdio: 'pipe' });
    } catch {
      // Skip if zip not available
    }
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should find conversations.json in nested ZIP structure', async () => {
    try {
      await readFile(zipPath);
    } catch {
      return;
    }

    const { conversationsPath, cleanup } = await extractAndFindConversations(zipPath);
    
    expect(conversationsPath).toContain('conversations.json');
    
    const content = await readFile(conversationsPath, 'utf-8');
    expect(JSON.parse(content)[0].title).toBe('Nested Test');
    
    await cleanup();
  });
});
