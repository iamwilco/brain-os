/**
 * Context Pack Export
 * Exports filtered knowledge for external use (e.g., AI context)
 */

import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { parseScope, matchesScope } from '../scope/parser.js';

/**
 * Export options
 */
export interface ContextPackOptions {
  scope?: string;
  includeMetadata?: boolean;
  maxFiles?: number;
  maxSizeKb?: number;
  flatten?: boolean;
}

/**
 * File entry in context pack
 */
export interface PackFile {
  sourcePath: string;
  packPath: string;
  size: number;
  type: 'markdown' | 'json' | 'other';
}

/**
 * Context pack manifest
 */
export interface PackManifest {
  exportedAt: string;
  scope: string;
  vaultPath: string;
  files: PackFile[];
  totalSize: number;
  totalFiles: number;
}

/**
 * Export result
 */
export interface ExportResult {
  outputPath: string;
  manifest: PackManifest;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Get all markdown files in vault
 */
export async function getVaultFiles(
  vaultPath: string,
  excludePaths: string[] = ['node_modules', '.git', '.obsidian']
): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(vaultPath, fullPath);
      
      // Skip excluded paths
      if (excludePaths.some(ex => relativePath.startsWith(ex))) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(relativePath);
      }
    }
  }
  
  await walk(vaultPath);
  return files;
}

/**
 * Filter files by scope
 */
export async function filterFilesByScope(
  _vaultPath: string,
  files: string[],
  scopeStr: string
): Promise<string[]> {
  const scope = parseScope(scopeStr);
  const filtered: string[] = [];
  
  for (const file of files) {
    // matchesScope checks path patterns
    if (matchesScope(file, scope)) {
      filtered.push(file);
    }
  }
  
  return filtered;
}

/**
 * Get linked files from a markdown file
 */
export function extractLinkedFiles(content: string): string[] {
  const links: string[] = [];
  
  // Wiki-style links: [[filename]] or [[filename|alias]]
  const wikiPattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = wikiPattern.exec(content)) !== null) {
    const link = match[1].trim();
    if (!link.startsWith('http')) {
      links.push(link.endsWith('.md') ? link : `${link}.md`);
    }
  }
  
  // Markdown links: [text](path.md)
  const mdPattern = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  while ((match = mdPattern.exec(content)) !== null) {
    links.push(match[2]);
  }
  
  return [...new Set(links)];
}

/**
 * Resolve linked files to full paths
 */
export async function resolveLinkedFiles(
  vaultPath: string,
  sourceFile: string,
  links: string[]
): Promise<string[]> {
  const resolved: string[] = [];
  const sourceDir = dirname(sourceFile);
  
  for (const link of links) {
    // Try relative to source file first
    const relativePath = join(sourceDir, link);
    if (existsSync(join(vaultPath, relativePath))) {
      resolved.push(relativePath);
      continue;
    }
    
    // Try from vault root
    if (existsSync(join(vaultPath, link))) {
      resolved.push(link);
      continue;
    }
    
    // Search common folders
    const searchFolders = ['20_Concepts', '10_MOCs', '30_Projects'];
    for (const folder of searchFolders) {
      const searchPath = join(folder, basename(link));
      if (existsSync(join(vaultPath, searchPath))) {
        resolved.push(searchPath);
        break;
      }
    }
  }
  
  return resolved;
}

/**
 * Collect all files for export (including linked files)
 */
export async function collectExportFiles(
  vaultPath: string,
  seedFiles: string[],
  maxDepth: number = 2
): Promise<string[]> {
  const collected = new Set<string>(seedFiles);
  let frontier = [...seedFiles];
  
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    
    for (const file of frontier) {
      try {
        const content = await readFile(join(vaultPath, file), 'utf-8');
        const links = extractLinkedFiles(content);
        const resolved = await resolveLinkedFiles(vaultPath, file, links);
        
        for (const linked of resolved) {
          if (!collected.has(linked)) {
            collected.add(linked);
            nextFrontier.push(linked);
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }
    
    frontier = nextFrontier;
  }
  
  return Array.from(collected);
}

/**
 * Create pack file entry
 */
export async function createPackFile(
  vaultPath: string,
  relativePath: string,
  flatten: boolean
): Promise<PackFile> {
  const fullPath = join(vaultPath, relativePath);
  const stats = await stat(fullPath);
  
  return {
    sourcePath: relativePath,
    packPath: flatten ? basename(relativePath) : relativePath,
    size: stats.size,
    type: relativePath.endsWith('.md') ? 'markdown' : 
          relativePath.endsWith('.json') ? 'json' : 'other',
  };
}

/**
 * Copy file to pack maintaining structure
 */
export async function copyToPack(
  vaultPath: string,
  outputPath: string,
  packFile: PackFile
): Promise<void> {
  const src = join(vaultPath, packFile.sourcePath);
  const dest = join(outputPath, packFile.packPath);
  
  // Ensure directory exists
  const destDir = dirname(dest);
  if (!existsSync(destDir)) {
    await mkdir(destDir, { recursive: true });
  }
  
  await copyFile(src, dest);
}

/**
 * Export context pack
 */
export async function exportContextPack(
  vaultPath: string,
  outputPath: string,
  options: ContextPackOptions = {}
): Promise<ExportResult> {
  const errors: Array<{ file: string; error: string }> = [];
  
  // Ensure output directory exists
  if (!existsSync(outputPath)) {
    await mkdir(outputPath, { recursive: true });
  }
  
  // Get all vault files
  let files = await getVaultFiles(vaultPath);
  
  // Filter by scope if provided
  if (options.scope) {
    files = await filterFilesByScope(vaultPath, files, options.scope);
  }
  
  // Collect linked files
  files = await collectExportFiles(vaultPath, files);
  
  // Apply limits
  if (options.maxFiles && files.length > options.maxFiles) {
    files = files.slice(0, options.maxFiles);
  }
  
  // Build pack files
  const packFiles: PackFile[] = [];
  let totalSize = 0;
  
  for (const file of files) {
    try {
      const packFile = await createPackFile(vaultPath, file, options.flatten || false);
      
      // Check size limit
      if (options.maxSizeKb) {
        const newTotal = totalSize + packFile.size;
        if (newTotal > options.maxSizeKb * 1024) {
          break;
        }
      }
      
      packFiles.push(packFile);
      totalSize += packFile.size;
    } catch (error) {
      errors.push({
        file,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  // Copy files to pack
  for (const packFile of packFiles) {
    try {
      await copyToPack(vaultPath, outputPath, packFile);
    } catch (error) {
      errors.push({
        file: packFile.sourcePath,
        error: error instanceof Error ? error.message : 'Copy failed',
      });
    }
  }
  
  // Create manifest
  const manifest: PackManifest = {
    exportedAt: new Date().toISOString(),
    scope: options.scope || 'all',
    vaultPath,
    files: packFiles,
    totalSize,
    totalFiles: packFiles.length,
  };
  
  // Save manifest
  await writeFile(
    join(outputPath, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
  
  // Generate and save README
  await savePackReadme(outputPath, manifest);
  
  return {
    outputPath,
    manifest,
    errors,
  };
}

/**
 * Quick export for AI context
 */
export async function exportForAI(
  vaultPath: string,
  outputPath: string,
  scope: string
): Promise<ExportResult> {
  return exportContextPack(vaultPath, outputPath, {
    scope,
    includeMetadata: true,
    maxSizeKb: 500, // Limit to 500KB for AI context
  });
}

/**
 * Generate README.md for context pack
 */
export function generatePackReadme(manifest: PackManifest): string {
  const lines: string[] = [];
  
  lines.push('# Context Pack');
  lines.push('');
  lines.push('This context pack was exported from a Wilco OS vault for use with AI assistants.');
  lines.push('');
  
  // Metadata
  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **Exported:** ${manifest.exportedAt.split('T')[0]}`);
  lines.push(`- **Scope:** ${manifest.scope}`);
  lines.push(`- **Total Files:** ${manifest.totalFiles}`);
  lines.push(`- **Total Size:** ${formatBytes(manifest.totalSize)}`);
  lines.push('');
  
  // File listing by type
  const byType = groupFilesByType(manifest.files);
  
  lines.push('## Contents');
  lines.push('');
  
  if (byType.markdown.length > 0) {
    lines.push('### Markdown Files');
    lines.push('');
    for (const file of byType.markdown.slice(0, 20)) {
      lines.push(`- \`${file.packPath}\``);
    }
    if (byType.markdown.length > 20) {
      lines.push(`- *...and ${byType.markdown.length - 20} more*`);
    }
    lines.push('');
  }
  
  if (byType.json.length > 0) {
    lines.push('### Data Files');
    lines.push('');
    for (const file of byType.json) {
      lines.push(`- \`${file.packPath}\``);
    }
    lines.push('');
  }
  
  if (byType.other.length > 0) {
    lines.push('### Other Files');
    lines.push('');
    for (const file of byType.other.slice(0, 10)) {
      lines.push(`- \`${file.packPath}\``);
    }
    if (byType.other.length > 10) {
      lines.push(`- *...and ${byType.other.length - 10} more*`);
    }
    lines.push('');
  }
  
  // Folder structure
  const folders = extractFolderStructure(manifest.files);
  if (folders.length > 0) {
    lines.push('## Folder Structure');
    lines.push('');
    lines.push('```');
    for (const folder of folders) {
      lines.push(folder);
    }
    lines.push('```');
    lines.push('');
  }
  
  // Usage instructions
  lines.push('## Usage');
  lines.push('');
  lines.push('### With AI Assistants');
  lines.push('');
  lines.push('You can provide this context pack to AI assistants to give them knowledge about your project:');
  lines.push('');
  lines.push('1. **Direct Upload**: Upload the entire folder to assistants that support file uploads');
  lines.push('2. **Copy Content**: Copy relevant markdown files into your conversation');
  lines.push('3. **Reference**: Point to specific files when asking questions');
  lines.push('');
  lines.push('### File Descriptions');
  lines.push('');
  lines.push('- **Concept notes** (`20_Concepts/`): Entity definitions and knowledge');
  lines.push('- **Project docs** (`30_Projects/`): Project-specific information');
  lines.push('- **MOCs** (`10_MOCs/`): Maps of Content linking related notes');
  lines.push('');
  
  // Manifest reference
  lines.push('## Manifest');
  lines.push('');
  lines.push('See `manifest.json` for complete file listing and metadata.');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Group files by type
 */
function groupFilesByType(files: PackFile[]): {
  markdown: PackFile[];
  json: PackFile[];
  other: PackFile[];
} {
  return {
    markdown: files.filter(f => f.type === 'markdown'),
    json: files.filter(f => f.type === 'json'),
    other: files.filter(f => f.type === 'other'),
  };
}

/**
 * Extract folder structure from files
 */
function extractFolderStructure(files: PackFile[]): string[] {
  const folders = new Set<string>();
  
  for (const file of files) {
    const parts = file.packPath.split('/');
    let path = '';
    for (let i = 0; i < parts.length - 1; i++) {
      path = path ? `${path}/${parts[i]}` : parts[i];
      folders.add(path);
    }
  }
  
  const sorted = Array.from(folders).sort();
  const tree: string[] = [];
  
  for (const folder of sorted) {
    const depth = folder.split('/').length - 1;
    const name = folder.split('/').pop() || folder;
    tree.push(`${'  '.repeat(depth)}${name}/`);
  }
  
  return tree;
}

/**
 * Save README to context pack
 */
export async function savePackReadme(
  outputPath: string,
  manifest: PackManifest
): Promise<void> {
  const readme = generatePackReadme(manifest);
  await writeFile(join(outputPath, 'README.md'), readme, 'utf-8');
}
