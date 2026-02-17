/**
 * Source header update tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseMarkdownFile,
  generateFrontmatterYaml,
  generateExtractionHeader,
  updateSourceHeader,
  updateSourceFile,
  hasExtractionHeader,
  getExtractionDate,
  createSummaryFromResults,
  type ExtractionSummary,
} from './header.js';

describe('parseMarkdownFile', () => {
  it('should parse frontmatter and body', () => {
    const content = `---
title: Test Document
tags:
  - test
  - demo
---

# Content

This is the body.`;

    const result = parseMarkdownFile(content);

    expect(result.hasFrontmatter).toBe(true);
    expect(result.frontmatter?.title).toBe('Test Document');
    expect(result.frontmatter?.tags).toEqual(['test', 'demo']);
    expect(result.body).toContain('# Content');
  });

  it('should handle file without frontmatter', () => {
    const content = `# No Frontmatter

Just content here.`;

    const result = parseMarkdownFile(content);

    expect(result.hasFrontmatter).toBe(false);
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe(content);
  });

  it('should handle empty arrays', () => {
    const content = `---
title: Empty Arrays
tags: []
aliases: []
---

Content`;

    const result = parseMarkdownFile(content);

    expect(result.frontmatter?.tags).toEqual([]);
    expect(result.frontmatter?.aliases).toEqual([]);
  });
});

describe('generateFrontmatterYaml', () => {
  it('should generate valid YAML', () => {
    const data = {
      title: 'Test',
      tags: ['a', 'b'],
      count: 5,
    };

    const result = generateFrontmatterYaml(data);

    expect(result).toContain('title: Test');
    expect(result).toContain('tags:');
    expect(result).toContain('  - "a"');
    expect(result).toContain('count: 5');
  });

  it('should handle empty arrays', () => {
    const data = { items: [] };
    const result = generateFrontmatterYaml(data);
    expect(result).toContain('items: []');
  });

  it('should escape special characters', () => {
    const data = { desc: 'Value with: colon' };
    const result = generateFrontmatterYaml(data);
    expect(result).toContain('"Value with: colon"');
  });
});

describe('generateExtractionHeader', () => {
  it('should generate extraction header with all sections', () => {
    const summary: ExtractionSummary = {
      summary: 'This document discusses testing.',
      entities: [{ type: 'entity', name: 'Testing' }],
      facts: [{ type: 'fact', name: 'Tests improve quality' }],
      tasks: [{ type: 'task', name: 'Write more tests' }],
      insights: [{ type: 'insight', name: 'Testing is valuable' }],
      extractedAt: '2026-02-01',
      chunkCount: 3,
    };

    const result = generateExtractionHeader(summary);

    expect(result).toContain('## Brain Extraction');
    expect(result).toContain('> This document discusses testing.');
    expect(result).toContain('### Entities');
    expect(result).toContain('[[Testing]]');
    expect(result).toContain('### Facts');
    expect(result).toContain('Tests improve quality');
    expect(result).toContain('### Tasks');
    expect(result).toContain('[ ] Write more tests');
    expect(result).toContain('### Insights');
    expect(result).toContain('💡 Testing is valuable');
    expect(result).toContain('*Extracted: 2026-02-01*');
    expect(result).toContain('*Chunks processed: 3*');
  });

  it('should respect maxItems option', () => {
    const summary: ExtractionSummary = {
      summary: 'Many entities',
      entities: Array.from({ length: 15 }, (_, i) => ({ type: 'entity' as const, name: `Entity ${i}` })),
      facts: [],
      tasks: [],
      insights: [],
      extractedAt: '2026-02-01',
    };

    const result = generateExtractionHeader(summary, { maxItems: 5 });

    expect(result).toContain('[[Entity 0]]');
    expect(result).toContain('[[Entity 4]]');
    expect(result).not.toContain('[[Entity 5]]');
    expect(result).toContain('...and 10 more');
  });

  it('should skip empty sections', () => {
    const summary: ExtractionSummary = {
      summary: 'Just entities',
      entities: [{ type: 'entity', name: 'Only One' }],
      facts: [],
      tasks: [],
      insights: [],
      extractedAt: '2026-02-01',
    };

    const result = generateExtractionHeader(summary);

    expect(result).toContain('### Entities');
    expect(result).not.toContain('### Facts');
    expect(result).not.toContain('### Tasks');
    expect(result).not.toContain('### Insights');
  });
});

describe('updateSourceHeader', () => {
  it('should add extraction header to file with frontmatter', () => {
    const content = `---
title: Original Document
---

# Original Content

This is the original content.`;

    const summary: ExtractionSummary = {
      summary: 'A document about content.',
      entities: [{ type: 'entity', name: 'Content' }],
      facts: [],
      tasks: [],
      insights: [],
      extractedAt: '2026-02-01',
    };

    const result = updateSourceHeader(content, summary);

    expect(result).toContain('title: Original Document');
    expect(result).toContain('brain_extracted: 2026-02-01');
    expect(result).toContain('## Brain Extraction');
    expect(result).toContain('# Original Content');
    expect(result).toContain('This is the original content.');
  });

  it('should add frontmatter to file without it', () => {
    const content = `# No Frontmatter

Just content.`;

    const summary: ExtractionSummary = {
      summary: 'Simple file.',
      entities: [],
      facts: [],
      tasks: [],
      insights: [],
      extractedAt: '2026-02-01',
    };

    const result = updateSourceHeader(content, summary);

    expect(result.startsWith('---')).toBe(true);
    expect(result).toContain('brain_extracted: 2026-02-01');
    expect(result).toContain('## Brain Extraction');
    expect(result).toContain('# No Frontmatter');
  });

  it('should replace existing extraction header', () => {
    const content = `---
title: Updated Doc
brain_extracted: 2026-01-01
---

## Brain Extraction

> Old summary

### Entities
- [[Old Entity]]

---

# Original Content

Keep this.`;

    const summary: ExtractionSummary = {
      summary: 'New summary.',
      entities: [{ type: 'entity', name: 'New Entity' }],
      facts: [],
      tasks: [],
      insights: [],
      extractedAt: '2026-02-01',
    };

    const result = updateSourceHeader(content, summary);

    expect(result).toContain('brain_extracted: 2026-02-01');
    expect(result).toContain('> New summary.');
    expect(result).toContain('[[New Entity]]');
    expect(result).not.toContain('Old summary');
    expect(result).not.toContain('[[Old Entity]]');
    expect(result).toContain('# Original Content');
    expect(result).toContain('Keep this.');
  });

  it('should preserve original content completely', () => {
    const originalContent = `Some code:

\`\`\`javascript
function test() {
  return true;
}
\`\`\`

And more text.`;

    const content = `---
title: Code Doc
---

${originalContent}`;

    const summary: ExtractionSummary = {
      summary: 'Code document.',
      entities: [],
      facts: [],
      tasks: [],
      insights: [],
      extractedAt: '2026-02-01',
    };

    const result = updateSourceHeader(content, summary);

    expect(result).toContain('function test()');
    expect(result).toContain('return true;');
    expect(result).toContain('And more text.');
  });
});

describe('hasExtractionHeader', () => {
  it('should return true if header exists', () => {
    const content = `---
title: Test
---

## Brain Extraction

Content`;

    expect(hasExtractionHeader(content)).toBe(true);
  });

  it('should return false if header missing', () => {
    const content = `---
title: Test
---

# Just Content`;

    expect(hasExtractionHeader(content)).toBe(false);
  });
});

describe('getExtractionDate', () => {
  it('should return extraction date', () => {
    const content = `---
title: Test
brain_extracted: 2026-02-01
---

Content`;

    expect(getExtractionDate(content)).toBe('2026-02-01');
  });

  it('should return null if not extracted', () => {
    const content = `---
title: Test
---

Content`;

    expect(getExtractionDate(content)).toBeNull();
  });
});

describe('createSummaryFromResults', () => {
  it('should create summary from extraction results', () => {
    const result = createSummaryFromResults(
      'A test summary',
      [{ name: 'Entity A' }, { name: 'Entity B' }],
      [{ content: 'Fact 1' }],
      [{ content: 'Task 1' }],
      [{ content: 'Insight 1' }],
      5
    );

    expect(result.summary).toBe('A test summary');
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].name).toBe('Entity A');
    expect(result.facts).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.insights).toHaveLength(1);
    expect(result.chunkCount).toBe(5);
    expect(result.extractedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-header-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('updateSourceFile', () => {
    it('should update existing file', async () => {
      const filePath = join(testDir, 'test.md');
      await writeFile(filePath, `---
title: Test
---

# Content`);

      const summary: ExtractionSummary = {
        summary: 'Updated.',
        entities: [{ type: 'entity', name: 'Test' }],
        facts: [],
        tasks: [],
        insights: [],
        extractedAt: '2026-02-01',
      };

      const result = await updateSourceFile(filePath, summary);

      expect(result.success).toBe(true);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('## Brain Extraction');
      expect(content).toContain('[[Test]]');
    });

    it('should return error for non-existent file', async () => {
      const result = await updateSourceFile('/non/existent/file.md', {
        summary: '',
        entities: [],
        facts: [],
        tasks: [],
        insights: [],
        extractedAt: '2026-02-01',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });
  });
});
