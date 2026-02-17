/**
 * Context pack export tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getVaultFiles,
  filterFilesByScope,
  extractLinkedFiles,
  resolveLinkedFiles,
  collectExportFiles,
  createPackFile,
  exportContextPack,
  generatePackReadme,
  savePackReadme,
  type PackManifest,
} from './context-pack.js';

describe('getVaultFiles', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-pack-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '20_Concepts'), { recursive: true });
    await mkdir(join(testDir, '30_Projects'), { recursive: true });
    await mkdir(join(testDir, 'node_modules'), { recursive: true });

    await writeFile(join(testDir, 'README.md'), '# Root');
    await writeFile(join(testDir, '20_Concepts', 'Entity.md'), '# Entity');
    await writeFile(join(testDir, '30_Projects', 'Project.md'), '# Project');
    await writeFile(join(testDir, 'node_modules', 'skip.md'), '# Skip');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should find all markdown files', async () => {
    const files = await getVaultFiles(testDir);

    expect(files).toHaveLength(3);
    expect(files).toContain('README.md');
    expect(files).toContain('20_Concepts/Entity.md');
  });

  it('should exclude node_modules', async () => {
    const files = await getVaultFiles(testDir);

    expect(files).not.toContain('node_modules/skip.md');
  });
});

describe('filterFilesByScope', () => {
  it('should filter by path scope', async () => {
    const files = ['20_Concepts/A.md', '30_Projects/B.md', 'README.md'];

    const filtered = await filterFilesByScope('/vault', files, 'path:20_Concepts/**');

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toBe('20_Concepts/A.md');
  });

  it('should return all for scope:all', async () => {
    const files = ['a.md', 'b.md', 'c.md'];

    const filtered = await filterFilesByScope('/vault', files, 'all');

    expect(filtered).toHaveLength(3);
  });
});

describe('extractLinkedFiles', () => {
  it('should extract wiki-style links', () => {
    const content = 'Check [[Entity A]] and [[Entity B|alias]] for more.';

    const links = extractLinkedFiles(content);

    expect(links).toContain('Entity A.md');
    expect(links).toContain('Entity B.md');
  });

  it('should extract markdown links', () => {
    const content = 'See [details](path/to/file.md) for more.';

    const links = extractLinkedFiles(content);

    expect(links).toContain('path/to/file.md');
  });

  it('should not include http links', () => {
    const content = 'Check [[https://example.com]] for more.';

    const links = extractLinkedFiles(content);

    expect(links).toHaveLength(0);
  });

  it('should deduplicate links', () => {
    const content = '[[Entity]] and [[Entity]] again.';

    const links = extractLinkedFiles(content);

    expect(links).toHaveLength(1);
  });
});

describe('resolveLinkedFiles', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-resolve-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '20_Concepts'), { recursive: true });

    await writeFile(join(testDir, '20_Concepts', 'Entity.md'), '# Entity');
    await writeFile(join(testDir, 'local.md'), '# Local');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should resolve from concepts folder', async () => {
    const resolved = await resolveLinkedFiles(testDir, 'README.md', ['Entity.md']);

    expect(resolved).toContain('20_Concepts/Entity.md');
  });

  it('should resolve from vault root', async () => {
    const resolved = await resolveLinkedFiles(testDir, 'sub/file.md', ['local.md']);

    expect(resolved).toContain('local.md');
  });
});

describe('collectExportFiles', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-collect-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, '20_Concepts'), { recursive: true });

    await writeFile(join(testDir, 'main.md'), '# Main\n\nSee [[Entity]] for details.');
    await writeFile(join(testDir, '20_Concepts', 'Entity.md'), '# Entity');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should collect seed files and linked files', async () => {
    const collected = await collectExportFiles(testDir, ['main.md'], 1);

    expect(collected).toContain('main.md');
    expect(collected).toContain('20_Concepts/Entity.md');
  });
});

describe('createPackFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-packfile-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, 'test.md'), '# Test content');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should create pack file entry', async () => {
    const packFile = await createPackFile(testDir, 'test.md', false);

    expect(packFile.sourcePath).toBe('test.md');
    expect(packFile.packPath).toBe('test.md');
    expect(packFile.type).toBe('markdown');
    expect(packFile.size).toBeGreaterThan(0);
  });

  it('should flatten path when requested', async () => {
    await mkdir(join(testDir, 'sub'), { recursive: true });
    await writeFile(join(testDir, 'sub', 'nested.md'), '# Nested');

    const packFile = await createPackFile(testDir, 'sub/nested.md', true);

    expect(packFile.packPath).toBe('nested.md');
  });
});

describe('exportContextPack', () => {
  let vaultDir: string;
  let outputDir: string;

  beforeEach(async () => {
    vaultDir = join(tmpdir(), `brain-vault-test-${Date.now()}`);
    outputDir = join(tmpdir(), `brain-output-test-${Date.now()}`);

    await mkdir(vaultDir, { recursive: true });
    await mkdir(join(vaultDir, '20_Concepts'), { recursive: true });

    await writeFile(join(vaultDir, 'README.md'), '# Vault');
    await writeFile(join(vaultDir, '20_Concepts', 'Entity.md'), '# Entity');
  });

  afterEach(async () => {
    try {
      await rm(vaultDir, { recursive: true, force: true });
      await rm(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should export context pack', async () => {
    const result = await exportContextPack(vaultDir, outputDir);

    expect(result.manifest.totalFiles).toBeGreaterThan(0);
    expect(existsSync(join(outputDir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'README.md'))).toBe(true);
  });

  it('should filter by scope', async () => {
    const result = await exportContextPack(vaultDir, outputDir, {
      scope: 'path:20_Concepts/**',
    });

    expect(result.manifest.files.some(f => f.sourcePath.includes('Entity'))).toBe(true);
  });

  it('should respect maxFiles limit', async () => {
    const result = await exportContextPack(vaultDir, outputDir, {
      maxFiles: 1,
    });

    expect(result.manifest.totalFiles).toBe(1);
  });

  it('should save manifest', async () => {
    await exportContextPack(vaultDir, outputDir);

    const manifestContent = await readFile(join(outputDir, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestContent);

    expect(manifest.exportedAt).toBeDefined();
    expect(manifest.files).toBeDefined();
  });

  it('should generate README', async () => {
    await exportContextPack(vaultDir, outputDir);

    expect(existsSync(join(outputDir, 'README.md'))).toBe(true);
    const readme = await readFile(join(outputDir, 'README.md'), 'utf-8');
    expect(readme).toContain('# Context Pack');
    expect(readme).toContain('## Usage');
  });
});

describe('generatePackReadme', () => {
  it('should generate README with metadata', () => {
    const manifest: PackManifest = {
      exportedAt: '2026-02-01T12:00:00Z',
      scope: 'path:20_Concepts/**',
      vaultPath: '/vault',
      files: [
        { sourcePath: '20_Concepts/Entity.md', packPath: '20_Concepts/Entity.md', size: 1024, type: 'markdown' },
        { sourcePath: 'README.md', packPath: 'README.md', size: 512, type: 'markdown' },
      ],
      totalSize: 1536,
      totalFiles: 2,
    };

    const readme = generatePackReadme(manifest);

    expect(readme).toContain('# Context Pack');
    expect(readme).toContain('## Metadata');
    expect(readme).toContain('**Exported:** 2026-02-01');
    expect(readme).toContain('**Scope:** path:20_Concepts/**');
    expect(readme).toContain('**Total Files:** 2');
  });

  it('should list files by type', () => {
    const manifest: PackManifest = {
      exportedAt: '2026-02-01T12:00:00Z',
      scope: 'all',
      vaultPath: '/vault',
      files: [
        { sourcePath: 'doc.md', packPath: 'doc.md', size: 100, type: 'markdown' },
        { sourcePath: 'data.json', packPath: 'data.json', size: 50, type: 'json' },
      ],
      totalSize: 150,
      totalFiles: 2,
    };

    const readme = generatePackReadme(manifest);

    expect(readme).toContain('### Markdown Files');
    expect(readme).toContain('`doc.md`');
    expect(readme).toContain('### Data Files');
    expect(readme).toContain('`data.json`');
  });

  it('should include folder structure', () => {
    const manifest: PackManifest = {
      exportedAt: '2026-02-01T12:00:00Z',
      scope: 'all',
      vaultPath: '/vault',
      files: [
        { sourcePath: '20_Concepts/Entity.md', packPath: '20_Concepts/Entity.md', size: 100, type: 'markdown' },
        { sourcePath: '30_Projects/Brain/README.md', packPath: '30_Projects/Brain/README.md', size: 100, type: 'markdown' },
      ],
      totalSize: 200,
      totalFiles: 2,
    };

    const readme = generatePackReadme(manifest);

    expect(readme).toContain('## Folder Structure');
    expect(readme).toContain('20_Concepts/');
    expect(readme).toContain('30_Projects/');
  });

  it('should include usage instructions', () => {
    const manifest: PackManifest = {
      exportedAt: '2026-02-01T12:00:00Z',
      scope: 'all',
      vaultPath: '/vault',
      files: [],
      totalSize: 0,
      totalFiles: 0,
    };

    const readme = generatePackReadme(manifest);

    expect(readme).toContain('## Usage');
    expect(readme).toContain('### With AI Assistants');
    expect(readme).toContain('Direct Upload');
    expect(readme).toContain('Copy Content');
  });

  it('should truncate long file lists', () => {
    const files = Array.from({ length: 30 }, (_, i) => ({
      sourcePath: `file${i}.md`,
      packPath: `file${i}.md`,
      size: 100,
      type: 'markdown' as const,
    }));

    const manifest: PackManifest = {
      exportedAt: '2026-02-01T12:00:00Z',
      scope: 'all',
      vaultPath: '/vault',
      files,
      totalSize: 3000,
      totalFiles: 30,
    };

    const readme = generatePackReadme(manifest);

    expect(readme).toContain('...and 10 more');
  });
});

describe('savePackReadme', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-readme-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should save README to output path', async () => {
    const manifest: PackManifest = {
      exportedAt: '2026-02-01T12:00:00Z',
      scope: 'all',
      vaultPath: '/vault',
      files: [],
      totalSize: 0,
      totalFiles: 0,
    };

    await savePackReadme(testDir, manifest);

    expect(existsSync(join(testDir, 'README.md'))).toBe(true);
    const content = await readFile(join(testDir, 'README.md'), 'utf-8');
    expect(content).toContain('# Context Pack');
  });
});
