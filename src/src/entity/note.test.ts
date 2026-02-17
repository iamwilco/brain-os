/**
 * Entity note creation tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  generateFrontmatter,
  generateNoteContent,
  parseExistingNote,
  getEntityNotePath,
  upsertEntityNote,
  upsertEntityNotes,
  addBacklink,
  moveFact,
  type EntityData,
  type EntityFrontmatter,
} from './note.js';

describe('generateFrontmatter', () => {
  it('should generate valid YAML frontmatter', () => {
    const data: EntityFrontmatter = {
      name: 'Test Entity',
      type: 'concept',
      aliases: ['TE', 'Test'],
      tags: ['entity/concept', 'test'],
      created: '2026-02-01',
      updated: '2026-02-01',
      sources: ['Source A', 'Source B'],
    };

    const result = generateFrontmatter(data);

    expect(result).toContain('---');
    expect(result).toContain('name: "Test Entity"');
    expect(result).toContain('type: concept');
    expect(result).toContain('aliases:');
    expect(result).toContain('  - "TE"');
    expect(result).toContain('tags:');
    expect(result).toContain('  - entity/concept');
    expect(result).toContain('created: 2026-02-01');
    expect(result).toContain('sources:');
  });

  it('should handle empty arrays', () => {
    const data: EntityFrontmatter = {
      name: 'Simple',
      type: 'person',
      aliases: [],
      tags: [],
      created: '2026-02-01',
      updated: '2026-02-01',
      sources: [],
    };

    const result = generateFrontmatter(data);

    expect(result).toContain('aliases: []');
    expect(result).toContain('tags: []');
    expect(result).toContain('sources: []');
  });

  it('should escape special characters', () => {
    const data: EntityFrontmatter = {
      name: 'Entity "With" Quotes',
      type: 'concept',
      aliases: ['Test\nNewline'],
      tags: [],
      created: '2026-02-01',
      updated: '2026-02-01',
      sources: [],
    };

    const result = generateFrontmatter(data);

    expect(result).toContain('name: "Entity \\"With\\" Quotes"');
    expect(result).toContain('\\n');
  });
});

describe('generateNoteContent', () => {
  it('should generate complete note structure', () => {
    const entity: EntityData = {
      name: 'Test Concept',
      type: 'concept',
      description: 'A test concept for testing.',
      tags: ['test'],
      facts: ['Fact one', 'Fact two'],
      sources: ['Source File'],
    };

    const result = generateNoteContent(entity);

    expect(result).toContain('# Test Concept');
    expect(result).toContain('A test concept for testing.');
    expect(result).toContain('## Hot');
    expect(result).toContain('## Warm');
    expect(result).toContain('## Cold');
    expect(result).toContain('## Backlinks');
    expect(result).toContain('- Fact one');
    expect(result).toContain('[[Source File]]');
  });

  it('should preserve existing sections on update', () => {
    const existingNote = {
      frontmatter: {
        name: 'Existing',
        type: 'concept' as const,
        aliases: [],
        tags: [],
        created: '2026-01-01',
        updated: '2026-01-15',
        sources: [],
      },
      hotSection: ['- Existing hot fact'],
      warmSection: ['- Existing warm fact'],
      coldSection: ['- Archived item'],
      backlinks: ['- [[Old Source]]'],
    };

    const entity: EntityData = {
      name: 'Existing',
      type: 'concept',
      facts: ['New fact'],
      sources: ['New Source'],
    };

    const result = generateNoteContent(entity, existingNote);

    expect(result).toContain('- New fact');
    expect(result).toContain('- Existing hot fact');
    expect(result).toContain('- Existing warm fact');
    expect(result).toContain('- Archived item');
    expect(result).toContain('[[Old Source]]');
    expect(result).toContain('[[New Source]]');
    expect(result).toContain('created: 2026-01-01');
  });

  it('should distribute facts to hot/warm sections', () => {
    const entity: EntityData = {
      name: 'Many Facts',
      type: 'concept',
      facts: Array.from({ length: 12 }, (_, i) => `Fact ${i + 1}`),
    };

    const result = generateNoteContent(entity);

    // First 5 facts should be in hot section
    expect(result).toContain('- Fact 1');
    expect(result).toContain('- Fact 5');
    // Facts 6-15 should be in warm section
    expect(result).toContain('- Fact 6');
  });
});

describe('parseExistingNote', () => {
  it('should parse frontmatter and sections', () => {
    const content = `---
name: "Test Entity"
type: concept
aliases:
  - "TE"
tags:
  - test
created: 2026-02-01
updated: 2026-02-01
sources: []
---

# Test Entity

## Hot

- Hot fact 1
- Hot fact 2

## Warm

- Warm fact

## Cold

*No archived items*

## Backlinks

- [[Source A]]
`;

    const result = parseExistingNote(content);

    expect(result).not.toBeNull();
    expect(result?.frontmatter.name).toBe('Test Entity');
    expect(result?.frontmatter.type).toBe('concept');
    expect(result?.frontmatter.aliases).toContain('TE');
    expect(result?.hotSection).toHaveLength(2);
    expect(result?.hotSection[0]).toContain('Hot fact 1');
    expect(result?.warmSection).toHaveLength(1);
    expect(result?.coldSection).toHaveLength(0);
    expect(result?.backlinks).toHaveLength(1);
  });

  it('should return null for invalid content', () => {
    const result = parseExistingNote('No frontmatter here');
    expect(result).toBeNull();
  });

  it('should handle empty sections', () => {
    const content = `---
name: "Empty"
type: person
aliases: []
tags: []
created: 2026-02-01
updated: 2026-02-01
sources: []
---

# Empty

## Hot

*No hot items yet*

## Warm

*No warm items yet*

## Cold

*No archived items*

## Backlinks

*No backlinks yet*
`;

    const result = parseExistingNote(content);

    expect(result?.hotSection).toHaveLength(0);
    expect(result?.warmSection).toHaveLength(0);
    expect(result?.coldSection).toHaveLength(0);
    expect(result?.backlinks).toHaveLength(0);
  });
});

describe('getEntityNotePath', () => {
  it('should generate correct path', () => {
    const entity: EntityData = { name: 'Test Entity', type: 'concept' };
    const result = getEntityNotePath('/vault', entity);

    expect(result).toBe('/vault/20_Concepts/Test Entity.md');
  });

  it('should sanitize file names', () => {
    const entity: EntityData = { name: 'Entity: With/Special?Chars', type: 'concept' };
    const result = getEntityNotePath('/vault', entity);

    expect(result).not.toContain(':');
    expect(result).not.toContain('/Special');
    expect(result).not.toContain('?');
  });

  it('should use custom concepts folder', () => {
    const entity: EntityData = { name: 'Test', type: 'person' };
    const result = getEntityNotePath('/vault', entity, 'Custom/Concepts');

    expect(result).toBe('/vault/Custom/Concepts/Test.md');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-entity-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('upsertEntityNote', () => {
    it('should create new note', async () => {
      const entity: EntityData = {
        name: 'New Entity',
        type: 'concept',
        description: 'A new entity',
        facts: ['Fact 1'],
      };

      const result = await upsertEntityNote(testDir, entity);

      expect(result.created).toBe(true);
      expect(result.updated).toBe(false);
      expect(existsSync(result.path)).toBe(true);

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('# New Entity');
      expect(content).toContain('A new entity');
    });

    it('should update existing note', async () => {
      const entity: EntityData = {
        name: 'Update Test',
        type: 'concept',
        facts: ['Initial fact'],
      };

      // Create initial
      await upsertEntityNote(testDir, entity);

      // Update
      entity.facts = ['New fact', 'Initial fact'];
      const result = await upsertEntityNote(testDir, entity);

      expect(result.created).toBe(false);
      expect(result.updated).toBe(true);

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('New fact');
      expect(content).toContain('Initial fact');
    });

    it('should create directory if needed', async () => {
      const entity: EntityData = { name: 'Deep Entity', type: 'concept' };
      const result = await upsertEntityNote(testDir, entity);

      expect(existsSync(result.path)).toBe(true);
    });
  });

  describe('upsertEntityNotes', () => {
    it('should batch create notes', async () => {
      const entities: EntityData[] = [
        { name: 'Entity A', type: 'concept' },
        { name: 'Entity B', type: 'person' },
        { name: 'Entity C', type: 'project' },
      ];

      const result = await upsertEntityNotes(testDir, entities);

      expect(result.created).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should count updates on rerun', async () => {
      const entities: EntityData[] = [
        { name: 'Entity A', type: 'concept' },
        { name: 'Entity B', type: 'person' },
      ];

      await upsertEntityNotes(testDir, entities);
      const result = await upsertEntityNotes(testDir, entities);

      expect(result.created).toBe(0);
      expect(result.updated).toBe(2);
    });
  });

  describe('addBacklink', () => {
    it('should add backlink to existing note', async () => {
      const entity: EntityData = { name: 'Backlink Test', type: 'concept' };
      await upsertEntityNote(testDir, entity);

      const added = await addBacklink(testDir, 'Backlink Test', 'New Source');

      expect(added).toBe(true);

      const notePath = getEntityNotePath(testDir, entity);
      const content = await readFile(notePath, 'utf-8');
      expect(content).toContain('[[New Source]]');
    });

    it('should not duplicate backlinks', async () => {
      const entity: EntityData = {
        name: 'No Dupe',
        type: 'concept',
        sources: ['Existing'],
      };
      await upsertEntityNote(testDir, entity);

      const added = await addBacklink(testDir, 'No Dupe', 'Existing');

      expect(added).toBe(false);
    });

    it('should return false for non-existent note', async () => {
      const added = await addBacklink(testDir, 'Does Not Exist', 'Source');
      expect(added).toBe(false);
    });
  });

  describe('moveFact', () => {
    it('should move fact between sections', async () => {
      const entity: EntityData = {
        name: 'Move Test',
        type: 'concept',
        facts: ['Movable fact'],
      };
      await upsertEntityNote(testDir, entity);

      const moved = await moveFact(testDir, 'Move Test', 'Movable fact', 'hot', 'warm');

      expect(moved).toBe(true);

      const notePath = getEntityNotePath(testDir, entity);
      const content = await readFile(notePath, 'utf-8');
      
      // Check fact is in warm section
      const warmIndex = content.indexOf('## Warm');
      const coldIndex = content.indexOf('## Cold');
      const factIndex = content.indexOf('Movable fact');
      
      expect(factIndex).toBeGreaterThan(warmIndex);
      expect(factIndex).toBeLessThan(coldIndex);
    });

    it('should return false for non-existent fact', async () => {
      const entity: EntityData = { name: 'No Fact', type: 'concept' };
      await upsertEntityNote(testDir, entity);

      const moved = await moveFact(testDir, 'No Fact', 'Non existent', 'hot', 'warm');

      expect(moved).toBe(false);
    });
  });
});
