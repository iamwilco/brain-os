/**
 * Markdown export module
 * Generates markdown files from normalized conversations
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import type { NormalizedConversation, NormalizedMessage } from '../normalize/chatgpt.js';

/**
 * Options for markdown generation
 */
export interface MarkdownOptions {
  includeMetadata?: boolean;
  includeTimestamps?: boolean;
  roleLabels?: {
    user?: string;
    assistant?: string;
    system?: string;
    tool?: string;
  };
}

const DEFAULT_OPTIONS: Required<MarkdownOptions> = {
  includeMetadata: true,
  includeTimestamps: true,
  roleLabels: {
    user: '**User**',
    assistant: '**Assistant**',
    system: '**System**',
    tool: '**Tool**',
  },
};

/**
 * Generate a URL-safe slug from a title
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'untitled';
}

/**
 * Generate filename from conversation
 * Format: YYYY-MM-DD-slug.md
 */
export function generateFilename(conv: NormalizedConversation): string {
  const date = conv.created_at.split('T')[0];
  const slug = slugify(conv.title);
  return `${date}-${slug}.md`;
}

/**
 * Generate YAML frontmatter
 */
export function generateFrontmatter(conv: NormalizedConversation): string {
  const lines = [
    '---',
    `title: "${conv.title.replace(/"/g, '\\"')}"`,
    `id: ${conv.id}`,
    `source: ${conv.source}`,
    `created: ${conv.created_at}`,
    `updated: ${conv.updated_at}`,
    `message_count: ${conv.message_count}`,
  ];

  if (conv.model) {
    lines.push(`model: ${conv.model}`);
  }

  if (conv.metadata.gizmo_id) {
    lines.push(`gizmo_id: ${conv.metadata.gizmo_id}`);
  }

  if (conv.metadata.is_archived) {
    lines.push(`archived: true`);
  }

  lines.push('tags:');
  lines.push('  - chatgpt');
  lines.push('  - conversation');
  lines.push('---');

  return lines.join('\n');
}

/**
 * Format a single message for markdown
 */
export function formatMessage(
  msg: NormalizedMessage,
  options: Required<MarkdownOptions>
): string {
  const roleLabel = options.roleLabels[msg.role] || `**${msg.role}**`;
  const lines: string[] = [];

  // Role header with optional timestamp
  if (options.includeTimestamps && msg.timestamp) {
    const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    lines.push(`### ${roleLabel} (${time})`);
  } else {
    lines.push(`### ${roleLabel}`);
  }

  lines.push('');
  lines.push(msg.content);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate markdown content for a conversation
 */
export function toMarkdown(
  conv: NormalizedConversation,
  options: MarkdownOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sections: string[] = [];

  // Frontmatter
  if (opts.includeMetadata) {
    sections.push(generateFrontmatter(conv));
  }

  // Title
  sections.push(`# ${conv.title}`);
  sections.push('');

  // Messages
  for (const msg of conv.messages) {
    sections.push(formatMessage(msg, opts));
  }

  return sections.join('\n');
}

/**
 * Write result information
 */
export interface WriteMarkdownResult {
  filePath: string;
  filename: string;
  bytesWritten: number;
}

/**
 * Write a conversation to a markdown file
 */
export async function writeMarkdownFile(
  conv: NormalizedConversation,
  outputDir: string,
  options: MarkdownOptions = {}
): Promise<WriteMarkdownResult> {
  const filename = generateFilename(conv);
  const filePath = join(outputDir, filename);
  const content = toMarkdown(conv, options);

  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');

  return {
    filePath,
    filename,
    bytesWritten: Buffer.byteLength(content, 'utf-8'),
  };
}

/**
 * Batch write result
 */
export interface BatchWriteResult {
  written: WriteMarkdownResult[];
  errors: Array<{ conversationId: string; error: string }>;
  totalBytesWritten: number;
}

/**
 * Write multiple conversations to markdown files
 */
export async function writeMarkdownFiles(
  conversations: NormalizedConversation[],
  outputDir: string,
  options: MarkdownOptions = {}
): Promise<BatchWriteResult> {
  const written: WriteMarkdownResult[] = [];
  const errors: Array<{ conversationId: string; error: string }> = [];
  let totalBytesWritten = 0;

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  for (const conv of conversations) {
    try {
      const result = await writeMarkdownFile(conv, outputDir, options);
      written.push(result);
      totalBytesWritten += result.bytesWritten;
    } catch (err) {
      errors.push({
        conversationId: conv.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    written,
    errors,
    totalBytesWritten,
  };
}

/**
 * Parse markdown frontmatter
 * Returns the frontmatter as object and content separately
 */
export function parseMarkdownFrontmatter(content: string): {
  frontmatter: Record<string, unknown> | null;
  content: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ||
                content.match(/^---\n---\n([\s\S]*)$/);
  
  if (!match) {
    return { frontmatter: null, content };
  }
  
  // Handle empty frontmatter case
  if (match.length === 2) {
    return { frontmatter: {}, content: match[1] };
  }

  const [, yaml, body] = match;
  
  // Simple YAML parser for basic key-value pairs
  const frontmatter: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = line.slice(0, colonIndex).trim();
    let value: unknown = line.slice(colonIndex + 1).trim();
    
    // Parse basic types
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^\d+$/.test(value as string)) value = parseInt(value as string, 10);
    else if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
      value = (value as string).slice(1, -1);
    }
    
    if (key && !key.startsWith(' ')) {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: body };
}
