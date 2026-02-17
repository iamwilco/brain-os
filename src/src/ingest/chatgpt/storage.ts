/**
 * ChatGPT storage module
 * Manages file storage in 70_Sources/chatgpt/ directory structure
 */

import { mkdir, copyFile, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { parseChatGPTExport } from './parser.js';
import { writeJsonlFile } from '../../normalize/chatgpt.js';
import { writeMarkdownFiles } from '../../export/markdown.js';
import type { ParseResult } from './parser.js';
import type { NormalizedConversation } from '../../normalize/chatgpt.js';
import type { BatchWriteResult } from '../../export/markdown.js';

/**
 * Directory structure for ChatGPT sources
 */
export const CHATGPT_DIRS = {
  root: '70_Sources/chatgpt',
  raw: '70_Sources/chatgpt/raw',
  parsed: '70_Sources/chatgpt/parsed',
  md: '70_Sources/chatgpt/md',
} as const;

/**
 * Import options
 */
export interface ImportOptions {
  vaultPath: string;
  skipRaw?: boolean;
  skipJsonl?: boolean;
  skipMarkdown?: boolean;
}

/**
 * Import result
 */
export interface ImportResult {
  rawFile: string | null;
  jsonlFile: string | null;
  markdownResult: BatchWriteResult | null;
  parseResult: ParseResult;
  conversationCount: number;
  messageCount: number;
}

/**
 * Ensure ChatGPT directory structure exists
 */
export async function ensureDirectoryStructure(vaultPath: string): Promise<void> {
  const dirs = [
    join(vaultPath, CHATGPT_DIRS.root),
    join(vaultPath, CHATGPT_DIRS.raw),
    join(vaultPath, CHATGPT_DIRS.parsed),
    join(vaultPath, CHATGPT_DIRS.md),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Generate a unique filename with timestamp
 */
export function generateTimestampedFilename(originalName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const ext = originalName.includes('.') 
    ? originalName.slice(originalName.lastIndexOf('.'))
    : '';
  const base = originalName.includes('.')
    ? originalName.slice(0, originalName.lastIndexOf('.'))
    : originalName;
  
  return `${base}-${timestamp}${ext}`;
}

/**
 * Copy raw export file to storage
 */
export async function storeRawFile(
  sourcePath: string,
  vaultPath: string
): Promise<string> {
  const rawDir = join(vaultPath, CHATGPT_DIRS.raw);
  await mkdir(rawDir, { recursive: true });

  const filename = generateTimestampedFilename(basename(sourcePath));
  const destPath = join(rawDir, filename);

  await copyFile(sourcePath, destPath);
  return destPath;
}

/**
 * Store parsed JSONL file
 */
export async function storeParsedJsonl(
  conversations: NormalizedConversation[],
  vaultPath: string,
  baseFilename: string = 'conversations'
): Promise<string> {
  const parsedDir = join(vaultPath, CHATGPT_DIRS.parsed);
  await mkdir(parsedDir, { recursive: true });

  const filename = generateTimestampedFilename(`${baseFilename}.jsonl`);
  const destPath = join(parsedDir, filename);

  await writeJsonlFile(
    conversations.map(c => ({
      id: c.id,
      title: c.title,
      createTime: new Date(c.created_at),
      updateTime: new Date(c.updated_at),
      model: c.model,
      messageCount: c.message_count,
      messages: c.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createTime: m.timestamp ? new Date(m.timestamp) : null,
        updateTime: null,
        model: m.model,
        isComplete: true,
        parentId: null,
      })),
      isArchived: c.metadata.is_archived,
      gizmoId: c.metadata.gizmo_id,
    })),
    destPath
  );

  return destPath;
}

/**
 * Store markdown files
 */
export async function storeMarkdownFiles(
  conversations: NormalizedConversation[],
  vaultPath: string
): Promise<BatchWriteResult> {
  const mdDir = join(vaultPath, CHATGPT_DIRS.md);
  return writeMarkdownFiles(conversations, mdDir);
}

/**
 * Import a ChatGPT export file
 * Full pipeline: raw → parsed → markdown
 */
export async function importChatGPTExport(
  sourcePath: string,
  options: ImportOptions
): Promise<ImportResult> {
  const { vaultPath, skipRaw, skipJsonl, skipMarkdown } = options;

  // Ensure directory structure
  await ensureDirectoryStructure(vaultPath);

  // Read and parse the export
  const content = await readFile(sourcePath, 'utf-8');
  const parseResult = parseChatGPTExport(content);

  // Normalize conversations
  const { normalizeConversation } = await import('../../normalize/chatgpt.js');
  const normalized = parseResult.conversations.map(normalizeConversation);

  let rawFile: string | null = null;
  let jsonlFile: string | null = null;
  let markdownResult: BatchWriteResult | null = null;

  // Store raw file
  if (!skipRaw) {
    rawFile = await storeRawFile(sourcePath, vaultPath);
  }

  // Store JSONL
  if (!skipJsonl && normalized.length > 0) {
    jsonlFile = await storeParsedJsonl(normalized, vaultPath);
  }

  // Store markdown files
  if (!skipMarkdown && normalized.length > 0) {
    markdownResult = await storeMarkdownFiles(normalized, vaultPath);
  }

  return {
    rawFile,
    jsonlFile,
    markdownResult,
    parseResult,
    conversationCount: normalized.length,
    messageCount: parseResult.totalMessages,
  };
}

/**
 * Get storage statistics for a vault
 */
export async function getStorageStats(vaultPath: string): Promise<{
  rawCount: number;
  parsedCount: number;
  mdCount: number;
}> {
  const { readdir } = await import('fs/promises');
  
  let rawCount = 0;
  let parsedCount = 0;
  let mdCount = 0;

  try {
    const rawDir = join(vaultPath, CHATGPT_DIRS.raw);
    rawCount = (await readdir(rawDir)).filter(f => f.endsWith('.json')).length;
  } catch {
    // Directory doesn't exist
  }

  try {
    const parsedDir = join(vaultPath, CHATGPT_DIRS.parsed);
    parsedCount = (await readdir(parsedDir)).filter(f => f.endsWith('.jsonl')).length;
  } catch {
    // Directory doesn't exist
  }

  try {
    const mdDir = join(vaultPath, CHATGPT_DIRS.md);
    mdCount = (await readdir(mdDir)).filter(f => f.endsWith('.md')).length;
  } catch {
    // Directory doesn't exist
  }

  return { rawCount, parsedCount, mdCount };
}
