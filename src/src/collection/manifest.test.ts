/**
 * Collection manifest tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getMimeType,
  hashFile,
  hashString,
  generateManifest,
  writeManifest,
  readManifest,
  verifyManifest,
  updateManifest,
  type Manifest,
} from './manifest.js';

describe('getMimeType', () => {
  it('should return correct MIME type for known extensions', () => {
    expect(getMimeType('file.json')).toBe('application/json');
    expect(getMimeType('file.md')).toBe('text/markdown');
    expect(getMimeType('file.txt')).toBe('text/plain');
    expect(getMimeType('file.pdf')).toBe('application/pdf');
    expect(getMimeType('file.png')).toBe('image/png');
  });

  it('should return octet-stream for unknown extensions', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream');
    expect(getMimeType('file')).toBe('application/octet-stream');
  });

  it('should handle uppercase extensions', () => {
    expect(getMimeType('file.JSON')).toBe('application/json');
    expect(getMimeType('file.MD')).toBe('text/markdown');
  });

  it('should handle jsonl files', () => {
    expect(getMimeType('data.jsonl')).toBe('application/x-ndjson');
  });
});

describe('hashString', () => {
  it('should generate consistent SHA256 hash', () => {
    const hash1 = hashString('hello world');
    const hash2 = hashString('hello world');
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should generate different hashes for different content', () => {
    const hash1 = hashString('hello');
    const hash2 = hashString('world');
    
    expect(hash1).not.toBe(hash2);
  });
});

describe('hashFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-hash-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should hash file contents', async () => {
    const filePath = join(testDir, 'test.txt');
    await writeFile(filePath, 'hello world');
    
    const hash = await hashFile(filePath);
    
    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashString('hello world'));
  });

  it('should produce same hash for same content', async () => {
    const file1 = join(testDir, 'file1.txt');
    const file2 = join(testDir, 'file2.txt');
    await writeFile(file1, 'same content');
    await writeFile(file2, 'same content');
    
    const hash1 = await hashFile(file1);
    const hash2 = await hashFile(file2);
    
    expect(hash1).toBe(hash2);
  });
});

describe('generateManifest', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-manifest-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should generate manifest for directory', async () => {
    await writeFile(join(testDir, 'file1.json'), '{"test": 1}');
    await writeFile(join(testDir, 'file2.md'), '# Test');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test-collection',
    });
    
    expect(manifest.version).toBe('1.0');
    expect(manifest.collection).toBe('test-collection');
    expect(manifest.fileCount).toBe(2);
    expect(manifest.files).toHaveLength(2);
  });

  it('should include correct file metadata', async () => {
    const content = '{"test": "data"}';
    await writeFile(join(testDir, 'data.json'), content);
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    const file = manifest.files[0];
    expect(file.filename).toBe('data.json');
    expect(file.size).toBe(content.length);
    expect(file.mimeType).toBe('application/json');
    expect(file.sha256).toBe(hashString(content));
  });

  it('should handle nested directories', async () => {
    const subDir = join(testDir, 'sub', 'folder');
    await mkdir(subDir, { recursive: true });
    await writeFile(join(testDir, 'root.txt'), 'root');
    await writeFile(join(subDir, 'nested.txt'), 'nested');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'nested-test',
    });
    
    expect(manifest.fileCount).toBe(2);
    expect(manifest.files.map(f => f.path).sort()).toEqual([
      'root.txt',
      'sub/folder/nested.txt',
    ]);
  });

  it('should exclude hidden files by default', async () => {
    await writeFile(join(testDir, 'visible.txt'), 'visible');
    await writeFile(join(testDir, '.hidden'), 'hidden');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    expect(manifest.fileCount).toBe(1);
    expect(manifest.files[0].filename).toBe('visible.txt');
  });

  it('should exclude specified patterns', async () => {
    await writeFile(join(testDir, 'keep.txt'), 'keep');
    await writeFile(join(testDir, 'exclude-me.txt'), 'exclude');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
      excludePatterns: ['exclude-me', 'manifest.json'],
    });
    
    expect(manifest.fileCount).toBe(1);
    expect(manifest.files[0].filename).toBe('keep.txt');
  });

  it('should calculate total size', async () => {
    await writeFile(join(testDir, 'file1.txt'), '12345');
    await writeFile(join(testDir, 'file2.txt'), '67890');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    expect(manifest.totalSize).toBe(10);
  });

  it('should sort files by path', async () => {
    await writeFile(join(testDir, 'z.txt'), 'z');
    await writeFile(join(testDir, 'a.txt'), 'a');
    await writeFile(join(testDir, 'm.txt'), 'm');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    expect(manifest.files.map(f => f.filename)).toEqual(['a.txt', 'm.txt', 'z.txt']);
  });
});

describe('writeManifest / readManifest', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-manifest-io-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should write and read manifest', async () => {
    const manifest: Manifest = {
      version: '1.0',
      collection: 'test',
      createdAt: '2024-02-01T00:00:00.000Z',
      updatedAt: '2024-02-01T00:00:00.000Z',
      fileCount: 1,
      totalSize: 100,
      files: [{
        path: 'test.txt',
        filename: 'test.txt',
        size: 100,
        mimeType: 'text/plain',
        sha256: 'abc123',
        modifiedAt: '2024-02-01T00:00:00.000Z',
      }],
    };
    
    const manifestPath = join(testDir, 'manifest.json');
    await writeManifest(manifest, manifestPath);
    
    const loaded = await readManifest(manifestPath);
    
    expect(loaded.collection).toBe('test');
    expect(loaded.files).toHaveLength(1);
    expect(loaded.files[0].sha256).toBe('abc123');
  });
});

describe('verifyManifest', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-verify-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return valid for unchanged files', async () => {
    await writeFile(join(testDir, 'file.txt'), 'content');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    const result = await verifyManifest(manifest, testDir);
    
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
  });

  it('should detect missing files', async () => {
    await writeFile(join(testDir, 'file.txt'), 'content');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    // Delete the file
    await rm(join(testDir, 'file.txt'));
    
    const result = await verifyManifest(manifest, testDir);
    
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('file.txt');
  });

  it('should detect modified files', async () => {
    await writeFile(join(testDir, 'file.txt'), 'original');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    // Modify the file
    await writeFile(join(testDir, 'file.txt'), 'modified');
    
    const result = await verifyManifest(manifest, testDir);
    
    expect(result.valid).toBe(false);
    expect(result.modified).toContain('file.txt');
  });

  it('should detect extra files', async () => {
    await writeFile(join(testDir, 'file.txt'), 'content');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    // Add a new file
    await writeFile(join(testDir, 'extra.txt'), 'extra');
    
    const result = await verifyManifest(manifest, testDir);
    
    expect(result.valid).toBe(false);
    expect(result.extra).toContain('extra.txt');
  });
});

describe('updateManifest', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-update-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should preserve createdAt when updating', async () => {
    await writeFile(join(testDir, 'file.txt'), 'original');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    
    // Modify file
    await writeFile(join(testDir, 'file.txt'), 'modified');
    
    const updated = await updateManifest(manifest, testDir);
    
    expect(updated.createdAt).toBe(manifest.createdAt);
    expect(updated.updatedAt).not.toBe(manifest.updatedAt);
  });

  it('should update file hashes', async () => {
    await writeFile(join(testDir, 'file.txt'), 'original');
    
    const manifest = await generateManifest(testDir, {
      collectionName: 'test',
    });
    const originalHash = manifest.files[0].sha256;
    
    // Modify file
    await writeFile(join(testDir, 'file.txt'), 'modified content');
    
    const updated = await updateManifest(manifest, testDir);
    
    expect(updated.files[0].sha256).not.toBe(originalHash);
  });
});
