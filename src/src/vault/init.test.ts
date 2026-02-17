/**
 * Vault initialization tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { initVault, VAULT_DIRECTORIES, getTemplateFiles } from './init.js';

describe('VAULT_DIRECTORIES', () => {
  it('should include all required directories', () => {
    expect(VAULT_DIRECTORIES).toContain('00_Inbox');
    expect(VAULT_DIRECTORIES).toContain('01_Daily');
    expect(VAULT_DIRECTORIES).toContain('10_MOCs');
    expect(VAULT_DIRECTORIES).toContain('20_Concepts');
    expect(VAULT_DIRECTORIES).toContain('30_Projects');
    expect(VAULT_DIRECTORIES).toContain('40_Brain');
    expect(VAULT_DIRECTORIES).toContain('70_Sources');
    expect(VAULT_DIRECTORIES).toContain('80_Resources');
    expect(VAULT_DIRECTORIES).toContain('95_Templates');
    expect(VAULT_DIRECTORIES).toContain('99_Archive');
  });

  it('should include agent directories', () => {
    expect(VAULT_DIRECTORIES).toContain('40_Brain/agents');
    expect(VAULT_DIRECTORIES).toContain('40_Brain/agents/admin');
    expect(VAULT_DIRECTORIES).toContain('40_Brain/agents/skills');
  });

  it('should include source subdirectories', () => {
    expect(VAULT_DIRECTORIES).toContain('70_Sources/chatgpt');
    expect(VAULT_DIRECTORIES).toContain('70_Sources/claude');
    expect(VAULT_DIRECTORIES).toContain('70_Sources/documents');
  });
});

describe('getTemplateFiles', () => {
  it('should return template files', () => {
    const templates = getTemplateFiles();
    
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every(t => t.path && t.content)).toBe(true);
  });

  it('should include README files for main directories', () => {
    const templates = getTemplateFiles();
    const paths = templates.map(t => t.path);
    
    expect(paths).toContain('00_Inbox/README.md');
    expect(paths).toContain('70_Sources/README.md');
    expect(paths).toContain('95_Templates/README.md');
  });

  it('should include note templates', () => {
    const templates = getTemplateFiles();
    const paths = templates.map(t => t.path);
    
    expect(paths).toContain('95_Templates/Daily Note.md');
    expect(paths).toContain('95_Templates/Concept.md');
    expect(paths).toContain('95_Templates/Project.md');
  });

  it('should include admin agent files', () => {
    const templates = getTemplateFiles();
    const paths = templates.map(t => t.path);
    
    expect(paths).toContain('40_Brain/agents/admin/AGENT.md');
    expect(paths).toContain('40_Brain/agents/admin/MEMORY.md');
  });
});

describe('initVault', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create all directories', async () => {
    const result = await initVault({ vaultPath: testDir });
    
    expect(result.errors).toHaveLength(0);
    
    // Check some directories were created
    for (const dir of ['00_Inbox', '40_Brain', '70_Sources']) {
      await expect(access(join(testDir, dir))).resolves.toBeUndefined();
    }
  });

  it('should create template files', async () => {
    const result = await initVault({ vaultPath: testDir });
    
    expect(result.errors).toHaveLength(0);
    expect(result.created.length).toBeGreaterThan(0);
    
    // Check a template file was created
    const content = await readFile(join(testDir, '00_Inbox/README.md'), 'utf-8');
    expect(content).toContain('# Inbox');
  });

  it('should be idempotent - skip existing items on second run', async () => {
    // First run
    const result1 = await initVault({ vaultPath: testDir });
    expect(result1.errors).toHaveLength(0);
    const createdCount = result1.created.length;
    
    // Second run
    const result2 = await initVault({ vaultPath: testDir });
    expect(result2.errors).toHaveLength(0);
    expect(result2.created.length).toBe(0);
    expect(result2.skipped.length).toBe(createdCount);
  });

  it('should overwrite files when force is true', async () => {
    // First run
    await initVault({ vaultPath: testDir });
    
    // Second run with force
    const result = await initVault({ vaultPath: testDir, force: true });
    
    expect(result.errors).toHaveLength(0);
    // Files should be recreated, directories still skipped
    expect(result.created.length).toBeGreaterThan(0);
  });

  it('should replace date placeholders in templates', async () => {
    await initVault({ vaultPath: testDir });
    
    const content = await readFile(
      join(testDir, '40_Brain/.agent/tasks/tasks.json'),
      'utf-8'
    );
    
    // Should have a real date, not {{date}}
    expect(content).not.toContain('{{date}}');
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
