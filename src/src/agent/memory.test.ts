/**
 * Agent memory tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getMemoryPath,
  loadMemory,
  saveMemory,
  generateMemoryMarkdown,
  getSection,
  updateSection,
  addSection,
  removeSection,
  createEmptyMemory,
  loadOrCreateMemory,
  applyMemoryUpdates,
  quickUpdateMemory,
  type AgentMemory,
} from './memory.js';

describe('getMemoryPath', () => {
  it('should return MEMORY.md path', () => {
    const path = getMemoryPath('/agent/path');
    expect(path).toBe('/agent/path/MEMORY.md');
  });
});

describe('Memory operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-memory-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('loadMemory', () => {
    it('should load memory from file', async () => {
      const content = `---
type: agent-memory
agent: agent_test
updated: 2026-02-01
version: 1
---

# Working Memory

## Current State

- **Status:** Active

## Key Context

Some context here.
`;
      await writeFile(join(testDir, 'MEMORY.md'), content);

      const memory = await loadMemory(testDir);

      expect(memory).not.toBeNull();
      expect(memory?.frontmatter.agent).toBe('agent_test');
      expect(memory?.frontmatter.version).toBe(1);
      expect(memory?.sections.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent file', async () => {
      const memory = await loadMemory(testDir);
      expect(memory).toBeNull();
    });

    it('should parse sections correctly', async () => {
      const content = `---
type: agent-memory
agent: agent_test
updated: 2026-02-01
---

# Main Title

## Section One

Content one.

## Section Two

Content two.
`;
      await writeFile(join(testDir, 'MEMORY.md'), content);

      const memory = await loadMemory(testDir);

      expect(memory?.sections).toHaveLength(3);
      expect(memory?.sections[0].title).toBe('Main Title');
      expect(memory?.sections[1].title).toBe('Section One');
      expect(memory?.sections[1].content).toBe('Content one.');
    });
  });

  describe('saveMemory', () => {
    it('should save memory to file', async () => {
      const memory: AgentMemory = {
        frontmatter: {
          type: 'agent-memory',
          agent: 'agent_test',
          updated: '2026-02-01',
          version: 1,
        },
        sections: [
          { title: 'Working Memory', content: '', level: 1 },
          { title: 'Current State', content: 'Active', level: 2 },
        ],
        raw: '',
      };

      await saveMemory(testDir, memory);

      expect(existsSync(join(testDir, 'MEMORY.md'))).toBe(true);
      const content = await readFile(join(testDir, 'MEMORY.md'), 'utf-8');
      expect(content).toContain('agent: agent_test');
      expect(content).toContain('# Working Memory');
    });

    it('should increment version on save', async () => {
      const memory: AgentMemory = {
        frontmatter: {
          type: 'agent-memory',
          agent: 'agent_test',
          updated: '2026-02-01',
          version: 5,
        },
        sections: [],
        raw: '',
      };

      await saveMemory(testDir, memory);

      expect(memory.frontmatter.version).toBe(6);
    });
  });

  describe('generateMemoryMarkdown', () => {
    it('should generate valid markdown', () => {
      const memory: AgentMemory = {
        frontmatter: {
          type: 'agent-memory',
          agent: 'agent_test',
          updated: '2026-02-01',
          version: 1,
        },
        sections: [
          { title: 'Title', content: 'Content here', level: 1 },
          { title: 'Subsection', content: 'More content', level: 2 },
        ],
        raw: '',
      };

      const markdown = generateMemoryMarkdown(memory);

      expect(markdown).toContain('---');
      expect(markdown).toContain('type: agent-memory');
      expect(markdown).toContain('# Title');
      expect(markdown).toContain('## Subsection');
      expect(markdown).toContain('Content here');
    });
  });
});

describe('Section operations', () => {
  let memory: AgentMemory;

  beforeEach(() => {
    memory = {
      frontmatter: {
        type: 'agent-memory',
        agent: 'agent_test',
        updated: '2026-02-01',
      },
      sections: [
        { title: 'Current State', content: 'Active', level: 2 },
        { title: 'Notes', content: 'Some notes', level: 2 },
      ],
      raw: '',
    };
  });

  describe('getSection', () => {
    it('should get section by title', () => {
      const section = getSection(memory, 'Current State');

      expect(section).not.toBeNull();
      expect(section?.content).toBe('Active');
    });

    it('should be case insensitive', () => {
      const section = getSection(memory, 'current state');

      expect(section).not.toBeNull();
    });

    it('should return null for non-existent section', () => {
      const section = getSection(memory, 'Nonexistent');

      expect(section).toBeNull();
    });
  });

  describe('updateSection', () => {
    it('should update section content', () => {
      const success = updateSection(memory, 'Current State', 'Inactive');

      expect(success).toBe(true);
      expect(memory.sections[0].content).toBe('Inactive');
    });

    it('should append to section', () => {
      const success = updateSection(memory, 'Notes', 'More notes', true);

      expect(success).toBe(true);
      expect(memory.sections[1].content).toContain('Some notes');
      expect(memory.sections[1].content).toContain('More notes');
    });

    it('should return false for non-existent section', () => {
      const success = updateSection(memory, 'Nonexistent', 'Content');

      expect(success).toBe(false);
    });
  });

  describe('addSection', () => {
    it('should add new section', () => {
      addSection(memory, 'New Section', 'New content', 2);

      expect(memory.sections).toHaveLength(3);
      expect(memory.sections[2].title).toBe('New Section');
    });
  });

  describe('removeSection', () => {
    it('should remove section', () => {
      const success = removeSection(memory, 'Notes');

      expect(success).toBe(true);
      expect(memory.sections).toHaveLength(1);
    });

    it('should return false for non-existent section', () => {
      const success = removeSection(memory, 'Nonexistent');

      expect(success).toBe(false);
    });
  });
});

describe('createEmptyMemory', () => {
  it('should create memory with default sections', () => {
    const memory = createEmptyMemory('agent_test');

    expect(memory.frontmatter.agent).toBe('agent_test');
    expect(memory.frontmatter.type).toBe('agent-memory');
    expect(memory.sections.length).toBeGreaterThan(0);
    expect(memory.sections.some(s => s.title === 'Working Memory')).toBe(true);
    expect(memory.sections.some(s => s.title === 'Current State')).toBe(true);
  });
});

describe('File-based operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-memory-file-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('loadOrCreateMemory', () => {
    it('should load existing memory', async () => {
      const content = `---
type: agent-memory
agent: agent_existing
updated: 2026-02-01
---

# Working Memory
`;
      await writeFile(join(testDir, 'MEMORY.md'), content);

      const memory = await loadOrCreateMemory(testDir, 'agent_new');

      expect(memory.frontmatter.agent).toBe('agent_existing');
    });

    it('should create new memory if none exists', async () => {
      const memory = await loadOrCreateMemory(testDir, 'agent_new');

      expect(memory.frontmatter.agent).toBe('agent_new');
      expect(existsSync(join(testDir, 'MEMORY.md'))).toBe(true);
    });
  });

  describe('applyMemoryUpdates', () => {
    it('should apply multiple updates', async () => {
      const initial = createEmptyMemory('agent_test');
      await saveMemory(testDir, initial);

      const updated = await applyMemoryUpdates(testDir, [
        { section: 'Current State', content: 'Updated state' },
        { section: 'Key Context', content: 'New context' },
      ]);

      expect(updated).not.toBeNull();
      expect(getSection(updated!, 'Current State')?.content).toBe('Updated state');
      expect(getSection(updated!, 'Key Context')?.content).toBe('New context');
    });

    it('should create missing sections', async () => {
      const initial = createEmptyMemory('agent_test');
      await saveMemory(testDir, initial);

      const updated = await applyMemoryUpdates(testDir, [
        { section: 'New Section', content: 'New content' },
      ]);

      expect(updated?.sections.some(s => s.title === 'New Section')).toBe(true);
    });
  });

  describe('quickUpdateMemory', () => {
    it('should update single section', async () => {
      const initial = createEmptyMemory('agent_test');
      await saveMemory(testDir, initial);

      const success = await quickUpdateMemory(testDir, 'Current State', 'Quick update');

      expect(success).toBe(true);
      const memory = await loadMemory(testDir);
      expect(getSection(memory!, 'Current State')?.content).toBe('Quick update');
    });
  });
});
