/**
 * Vault initialization module
 * Creates the vault skeleton structure
 */

import { mkdir, writeFile, access } from 'fs/promises';
import { join } from 'path';

/** Vault directory structure */
export const VAULT_DIRECTORIES = [
  '00_Inbox',
  '01_Daily',
  '10_MOCs',
  '20_Concepts',
  '30_Projects',
  '40_Brain',
  '40_Brain/.agent',
  '40_Brain/.agent/prd',
  '40_Brain/.agent/tasks',
  '40_Brain/.agent/workflows',
  '40_Brain/agents',
  '40_Brain/agents/admin',
  '40_Brain/agents/skills',
  '40_Brain/docs',
  '70_Sources',
  '70_Sources/chatgpt',
  '70_Sources/claude',
  '70_Sources/documents',
  '80_Resources',
  '95_Templates',
  '99_Archive',
] as const;

/** Template file definitions */
export interface TemplateFile {
  path: string;
  content: string;
}

/** Get template files to create */
export function getTemplateFiles(): TemplateFile[] {
  return [
    {
      path: '00_Inbox/README.md',
      content: `# Inbox

Quick capture location for new notes and ideas.

## Usage

Drop anything here that needs to be processed later:
- Quick notes
- Ideas
- Links to process
- Imports to organize

Items should be moved to their proper location during regular reviews.
`,
    },
    {
      path: '01_Daily/README.md',
      content: `# Daily Notes

Daily journal entries and work logs.

## Naming Convention

Use the format: \`YYYY-MM-DD.md\`

Example: \`2026-02-01.md\`
`,
    },
    {
      path: '10_MOCs/README.md',
      content: `# Maps of Content

Index notes that organize and link to related concepts.

## Purpose

MOCs serve as navigational hubs for specific topics or domains.
They don't contain much content themselves but link to detailed notes.
`,
    },
    {
      path: '20_Concepts/README.md',
      content: `# Concepts

Atomic notes about specific concepts, entities, or ideas.

## Guidelines

- One concept per note
- Link to related concepts
- Include source citations
`,
    },
    {
      path: '30_Projects/README.md',
      content: `# Projects

Active project folders with their own context and agents.

## Structure

Each project folder should contain:
- \`README.md\` - Project overview
- \`agent/\` - Project-specific agent (optional)
- Project-specific notes and files
`,
    },
    {
      path: '70_Sources/README.md',
      content: `# Sources

Immutable source files imported into the knowledge base.

## Important

**Never modify files in this directory.**

Sources are the raw evidence that extractions point to.
Modifying them would break citation links.

## Subdirectories

- \`chatgpt/\` - ChatGPT export files
- \`claude/\` - Claude conversation exports  
- \`documents/\` - PDFs, articles, other documents
`,
    },
    {
      path: '80_Resources/README.md',
      content: `# Resources

Reference materials, guides, and supporting documents.

## Contents

- Style guides
- Reference documentation
- Templates and examples
- External resources
`,
    },
    {
      path: '95_Templates/README.md',
      content: `# Templates

Obsidian templates for creating new notes.

## Available Templates

Add your note templates here for use with Obsidian's Templates plugin.
`,
    },
    {
      path: '95_Templates/Daily Note.md',
      content: `---
date: {{date}}
type: daily
---

# {{date}}

## Tasks

- [ ] 

## Notes

## Reflections

`,
    },
    {
      path: '95_Templates/Concept.md',
      content: `---
type: concept
created: {{date}}
aliases: []
tags: []
---

# {{title}}

## Definition

## Related Concepts

## Sources

`,
    },
    {
      path: '95_Templates/Project.md',
      content: `---
type: project
status: active
created: {{date}}
---

# {{title}}

## Overview

## Goals

## Tasks

- [ ] 

## Notes

## Links

`,
    },
    {
      path: '99_Archive/README.md',
      content: `# Archive

Completed projects and outdated content.

## Purpose

Move items here instead of deleting them.
This preserves history and allows future reference.
`,
    },
    {
      path: '40_Brain/agents/admin/AGENT.md',
      content: `---
type: agent
id: admin
name: Wilco
scope: vault
created: {{date}}
---

# Admin Agent (Wilco)

The system-wide orchestrator with full vault awareness.

## Capabilities

- Coordinate work between agents
- Maintain system documentation
- Spawn and manage other agents
- Full access to all vault content

## Scope

Entire vault and all agent configurations.
`,
    },
    {
      path: '40_Brain/agents/admin/MEMORY.md',
      content: `---
type: memory
agent: admin
updated: {{date}}
---

# Admin Agent Memory

## Current State

- System initialized
- No active tasks

## Recent Decisions

## Pending Actions

## Questions

`,
    },
    {
      path: '40_Brain/.agent/tasks/tasks.json',
      content: `{
  "version": "1.0.0",
  "updated": "{{date}}",
  "currentMilestone": "M0",
  "tasks": []
}
`,
    },
  ];
}

/** Options for vault initialization */
export interface InitOptions {
  vaultPath: string;
  force?: boolean;
}

/** Result of vault initialization */
export interface InitResult {
  created: string[];
  skipped: string[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Check if a path exists
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Process template content by replacing placeholders
 */
function processTemplate(content: string): string {
  const date = getCurrentDate();
  return content
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{title\}\}/g, 'Untitled');
}

/**
 * Initialize a vault with the standard directory structure
 * Idempotent - safe to run multiple times
 */
export async function initVault(options: InitOptions): Promise<InitResult> {
  const { vaultPath, force = false } = options;
  const result: InitResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  // Create directories
  for (const dir of VAULT_DIRECTORIES) {
    const fullPath = join(vaultPath, dir);
    try {
      if (await pathExists(fullPath)) {
        result.skipped.push(dir);
      } else {
        await mkdir(fullPath, { recursive: true });
        result.created.push(dir);
      }
    } catch (err) {
      result.errors.push({
        path: dir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Create template files
  const templates = getTemplateFiles();
  for (const template of templates) {
    const fullPath = join(vaultPath, template.path);
    try {
      const exists = await pathExists(fullPath);
      if (exists && !force) {
        result.skipped.push(template.path);
      } else {
        const content = processTemplate(template.content);
        await writeFile(fullPath, content, 'utf-8');
        result.created.push(template.path);
      }
    } catch (err) {
      result.errors.push({
        path: template.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
