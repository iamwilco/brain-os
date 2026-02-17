/**
 * Incremental change detection tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  detectChanges,
  getFilesToProcess,
  incrementalUpdate,
  updateManifestFile,
  summarizeChanges,
  type ChangeDetectionResult,
} from './incremental.js';
import { generateManifest, type Manifest } from './manifest.js';

describe('detectChanges', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-incremental-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should detect no changes when files are unchanged', async () => {
    await writeFile(join(testDir, 'file1.txt'), 'content1');
    await writeFile(join(testDir, 'file2.txt'), 'content2');
    
    const manifest = await generateManifest(testDir, { collectionName: 'test' });
    const changes = await detectChanges(testDir, manifest);
    
    expect(changes.hasChanges).toBe(false);
    expect(changes.unchanged.length).toBe(2);
    expect(changes.added.length).toBe(0);
    expect(changes.modified.length).toBe(0);
    expect(changes.deleted.length).toBe(0);
  });

  it('should detect added files', async () => {
    await writeFile(join(testDir, 'file1.txt'), 'content1');
    
    const manifest = await generateManifest(testDir, { collectionName: 'test' });
    
    // Add new file
    await writeFile(join(testDir, 'file2.txt'), 'content2');
    
    const changes = await detectChanges(testDir, manifest);
    
    expect(changes.hasChanges).toBe(true);
    expect(changes.added.length).toBe(1);
    expect(changes.added[0].path).toBe('file2.txt');
    expect(changes.added[0].changeType).toBe('added');
  });

  it('should detect modified files', async () => {
    await writeFile(join(testDir, 'file1.txt'), 'original content');
    
    const manifest = await generateManifest(testDir, { collectionName: 'test' });
    
    // Modify file
    await writeFile(join(testDir, 'file1.txt'), 'modified content');
    
    const changes = await detectChanges(testDir, manifest);
    
    expect(changes.hasChanges).toBe(true);
    expect(changes.modified.length).toBe(1);
    expect(changes.modified[0].path).toBe('file1.txt');
    expect(changes.modified[0].changeType).toBe('modified');
    expect(changes.modified[0].oldHash).not.toBe(changes.modified[0].newHash);
  });

  it('should detect deleted files', async () => {
    await writeFile(join(testDir, 'file1.txt'), 'content1');
    await writeFile(join(testDir, 'file2.txt'), 'content2');
    
    const manifest = await generateManifest(testDir, { collectionName: 'test' });
    
    // Delete file
    await rm(join(testDir, 'file2.txt'));
    
    const changes = await detectChanges(testDir, manifest);
    
    expect(changes.hasChanges).toBe(true);
    expect(changes.deleted.length).toBe(1);
    expect(changes.deleted[0].path).toBe('file2.txt');
    expect(changes.deleted[0].changeType).toBe('deleted');
  });

  it('should detect multiple change types simultaneously', async () => {
    await writeFile(join(testDir, 'unchanged.txt'), 'unchanged');
    await writeFile(join(testDir, 'to-modify.txt'), 'original');
    await writeFile(join(testDir, 'to-delete.txt'), 'delete me');
    
    const manifest = await generateManifest(testDir, { collectionName: 'test' });
    
    // Make various changes
    await writeFile(join(testDir, 'to-modify.txt'), 'modified');
    await rm(join(testDir, 'to-delete.txt'));
    await writeFile(join(testDir, 'new-file.txt'), 'new');
    
    const changes = await detectChanges(testDir, manifest);
    
    expect(changes.hasChanges).toBe(true);
    expect(changes.unchanged.length).toBe(1);
    expect(changes.added.length).toBe(1);
    expect(changes.modified.length).toBe(1);
    expect(changes.deleted.length).toBe(1);
    expect(changes.totalChanges).toBe(3);
  });

  it('should handle nested directories', async () => {
    const subDir = join(testDir, 'sub', 'folder');
    await mkdir(subDir, { recursive: true });
    await writeFile(join(testDir, 'root.txt'), 'root');
    await writeFile(join(subDir, 'nested.txt'), 'nested');
    
    const manifest = await generateManifest(testDir, { collectionName: 'test' });
    
    // Add file in nested dir
    await writeFile(join(subDir, 'new-nested.txt'), 'new nested');
    
    const changes = await detectChanges(testDir, manifest);
    
    expect(changes.added.length).toBe(1);
    expect(changes.added[0].path).toBe('sub/folder/new-nested.txt');
  });
});

describe('getFilesToProcess', () => {
  it('should return added and modified files', () => {
    const changes: ChangeDetectionResult = {
      added: [
        { path: 'new1.txt', changeType: 'added', newHash: 'abc' },
        { path: 'new2.txt', changeType: 'added', newHash: 'def' },
      ],
      modified: [
        { path: 'mod1.txt', changeType: 'modified', oldHash: '123', newHash: '456' },
      ],
      deleted: [
        { path: 'del1.txt', changeType: 'deleted', oldHash: 'xyz' },
      ],
      unchanged: [
        { path: 'same.txt', changeType: 'unchanged', oldHash: '000', newHash: '000' },
      ],
      totalChanges: 4,
      hasChanges: true,
    };
    
    const files = getFilesToProcess(changes);
    
    expect(files).toHaveLength(3);
    expect(files).toContain('new1.txt');
    expect(files).toContain('new2.txt');
    expect(files).toContain('mod1.txt');
    expect(files).not.toContain('del1.txt');
    expect(files).not.toContain('same.txt');
  });

  it('should return sorted list', () => {
    const changes: ChangeDetectionResult = {
      added: [
        { path: 'z.txt', changeType: 'added', newHash: 'a' },
        { path: 'a.txt', changeType: 'added', newHash: 'b' },
      ],
      modified: [
        { path: 'm.txt', changeType: 'modified', oldHash: 'c', newHash: 'd' },
      ],
      deleted: [],
      unchanged: [],
      totalChanges: 3,
      hasChanges: true,
    };
    
    const files = getFilesToProcess(changes);
    
    expect(files).toEqual(['a.txt', 'm.txt', 'z.txt']);
  });
});

describe('incrementalUpdate', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-incr-update-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should treat all files as new when no manifest exists', async () => {
    await writeFile(join(testDir, 'file1.txt'), 'content1');
    await writeFile(join(testDir, 'file2.txt'), 'content2');
    
    const result = await incrementalUpdate(testDir, 'test');
    
    expect(result.changes.added.length).toBe(2);
    expect(result.filesToProcess.length).toBe(2);
    expect(result.manifest.fileCount).toBe(2);
  });

  it('should preserve createdAt from existing manifest', async () => {
    await writeFile(join(testDir, 'file.txt'), 'content');
    
    const oldManifest = await generateManifest(testDir, { collectionName: 'test' });
    const originalCreatedAt = oldManifest.createdAt;
    
    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Modify file
    await writeFile(join(testDir, 'file.txt'), 'modified');
    
    const result = await incrementalUpdate(testDir, 'test', oldManifest);
    
    expect(result.manifest.createdAt).toBe(originalCreatedAt);
    expect(result.manifest.updatedAt).not.toBe(originalCreatedAt);
  });

  it('should return only changed files for processing', async () => {
    await writeFile(join(testDir, 'unchanged.txt'), 'same');
    await writeFile(join(testDir, 'to-modify.txt'), 'original');
    
    const manifest = await generateManifest(testDir, { collectionName: 'test' });
    
    await writeFile(join(testDir, 'to-modify.txt'), 'changed');
    await writeFile(join(testDir, 'new.txt'), 'new');
    
    const result = await incrementalUpdate(testDir, 'test', manifest);
    
    expect(result.filesToProcess).toHaveLength(2);
    expect(result.filesToProcess).toContain('to-modify.txt');
    expect(result.filesToProcess).toContain('new.txt');
    expect(result.filesToProcess).not.toContain('unchanged.txt');
  });
});

describe('updateManifestFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-manifest-update-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create new manifest if none exists', async () => {
    await writeFile(join(testDir, 'file.txt'), 'content');
    const manifestPath = join(testDir, 'manifest.json');
    
    const result = await updateManifestFile(testDir, manifestPath, 'test');
    
    expect(result.manifest.fileCount).toBe(1);
    expect(result.changes.added.length).toBe(1);
  });

  it('should update existing manifest', async () => {
    await writeFile(join(testDir, 'file.txt'), 'original');
    const manifestPath = join(testDir, 'manifest.json');
    
    // Create initial manifest
    await updateManifestFile(testDir, manifestPath, 'test');
    
    // Modify file
    await writeFile(join(testDir, 'file.txt'), 'modified');
    
    const result = await updateManifestFile(testDir, manifestPath, 'test');
    
    expect(result.changes.modified.length).toBe(1);
  });
});

describe('summarizeChanges', () => {
  it('should summarize all change types', () => {
    const changes: ChangeDetectionResult = {
      added: [{ path: 'a', changeType: 'added' }],
      modified: [{ path: 'b', changeType: 'modified' }, { path: 'c', changeType: 'modified' }],
      deleted: [{ path: 'd', changeType: 'deleted' }],
      unchanged: [{ path: 'e', changeType: 'unchanged' }],
      totalChanges: 4,
      hasChanges: true,
    };
    
    const summary = summarizeChanges(changes);
    
    expect(summary).toContain('Added: 1');
    expect(summary).toContain('Modified: 2');
    expect(summary).toContain('Deleted: 1');
    expect(summary).toContain('Unchanged: 1');
  });

  it('should handle no files', () => {
    const changes: ChangeDetectionResult = {
      added: [],
      modified: [],
      deleted: [],
      unchanged: [],
      totalChanges: 0,
      hasChanges: false,
    };
    
    const summary = summarizeChanges(changes);
    
    expect(summary).toBe('No files found');
  });
});
