/**
 * Source indexer module
 * Indexes files into the database with chunking and FTS5
 */

import { readdir, stat } from 'fs/promises';
import { join, relative, extname } from 'path';
import type { DatabaseInstance } from '../db/connection.js';
import { hashFile, getMimeType } from '../collection/manifest.js';
import { extractFromFile, isTextFile } from '../extract/text.js';
import { chunkText, chunkMarkdown, chunkCode } from '../chunker/index.js';

/**
 * Index options
 */
export interface IndexOptions {
  scope?: string;
  collection?: string;
  vaultPath: string;
  sourcesPath?: string;
  onProgress?: (progress: IndexProgress) => void;
}

/**
 * Index progress
 */
export interface IndexProgress {
  phase: 'scanning' | 'indexing' | 'complete';
  current: number;
  total: number;
  currentFile?: string;
  message?: string;
}

/**
 * Index result
 */
export interface IndexResult {
  filesScanned: number;
  filesIndexed: number;
  filesSkipped: number;
  filesDeleted: number;
  chunksCreated: number;
  chunksDeleted: number;
  errors: Array<{ path: string; error: string }>;
  duration: number;
}

/**
 * File info for indexing
 */
interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
  hash: string;
}

/**
 * Parse scope string into filter criteria
 */
export function parseScope(scope: string): {
  type: 'all' | 'collection' | 'path';
  value: string;
} {
  if (!scope || scope === 'all') {
    return { type: 'all', value: '' };
  }
  
  if (scope.startsWith('collection:')) {
    return { type: 'collection', value: scope.slice(11) };
  }
  
  if (scope.startsWith('path:')) {
    return { type: 'path', value: scope.slice(5) };
  }
  
  // Default to path pattern
  return { type: 'path', value: scope };
}

/**
 * Check if file matches scope
 */
function matchesScope(
  filePath: string,
  scope: { type: 'all' | 'collection' | 'path'; value: string },
  collection: string
): boolean {
  if (scope.type === 'all') {
    return true;
  }
  
  if (scope.type === 'collection') {
    return collection === scope.value;
  }
  
  if (scope.type === 'path') {
    // Simple glob matching
    const pattern = scope.value.replace(/\*/g, '.*');
    return new RegExp(pattern).test(filePath);
  }
  
  return true;
}

/**
 * Collect files to index from a directory
 */
async function collectFiles(
  dir: string,
  baseDir: string
): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  
  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden files and directories
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isTextFile(fullPath)) {
        const stats = await stat(fullPath);
        const hash = await hashFile(fullPath);
        
        files.push({
          path: fullPath,
          relativePath: relative(baseDir, fullPath),
          size: stats.size,
          hash,
        });
      }
    }
  }
  
  await walk(dir);
  return files;
}

/**
 * Get file type for chunking strategy
 */
function getChunkStrategy(filePath: string): 'markdown' | 'code' | 'text' {
  const ext = extname(filePath).toLowerCase();
  
  if (ext === '.md' || ext === '.markdown') {
    return 'markdown';
  }
  
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'].includes(ext)) {
    return 'code';
  }
  
  return 'text';
}

/**
 * Index a single file
 */
async function indexFile(
  db: DatabaseInstance,
  file: FileInfo,
  collection: string
): Promise<{ chunksCreated: number }> {
  // Check if file already indexed with same hash
  const existing = db.prepare(`
    SELECT id FROM sources WHERE path = ? AND sha256 = ?
  `).get(file.relativePath, file.hash) as { id: number } | undefined;
  
  if (existing) {
    return { chunksCreated: 0 };
  }
  
  // Delete old version if exists
  db.prepare('DELETE FROM sources WHERE path = ?').run(file.relativePath);
  
  // Extract text content
  const extraction = await extractFromFile(file.path);
  
  // Insert source
  db.prepare(`
    INSERT INTO sources (path, collection, file_type, mime_type, sha256, size)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    file.relativePath,
    collection,
    extraction.fileType,
    getMimeType(file.path),
    file.hash,
    file.size
  );
  
  const sourceId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id;
  
  // Chunk content
  const strategy = getChunkStrategy(file.path);
  let chunks;
  
  switch (strategy) {
    case 'markdown':
      chunks = chunkMarkdown(extraction.content);
      break;
    case 'code':
      chunks = chunkCode(extraction.content);
      break;
    default:
      chunks = chunkText(extraction.content);
  }
  
  // Insert chunks
  const insertChunk = db.prepare(`
    INSERT INTO chunks (source_id, chunk_index, content, start_line, end_line, start_char, end_char)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const chunk of chunks) {
    insertChunk.run(
      sourceId,
      chunk.index,
      chunk.content,
      chunk.startLine,
      chunk.endLine,
      chunk.startChar,
      chunk.endChar
    );
  }
  
  return { chunksCreated: chunks.length };
}

/**
 * Index sources into the database
 */
export async function indexSources(
  db: DatabaseInstance,
  options: IndexOptions
): Promise<IndexResult> {
  const startTime = Date.now();
  const result: IndexResult = {
    filesScanned: 0,
    filesIndexed: 0,
    filesSkipped: 0,
    filesDeleted: 0,
    chunksCreated: 0,
    chunksDeleted: 0,
    errors: [],
    duration: 0,
  };
  
  const scope = parseScope(options.scope || 'all');
  const sourcesPath = options.sourcesPath || join(options.vaultPath, '70_Sources');
  const collection = options.collection || 'default';
  
  // Report scanning phase
  options.onProgress?.({
    phase: 'scanning',
    current: 0,
    total: 0,
    message: 'Scanning for files...',
  });
  
  // Collect files
  let files: FileInfo[];
  try {
    files = await collectFiles(sourcesPath, sourcesPath);
  } catch {
    // Directory might not exist
    files = [];
  }
  
  // Filter by scope
  files = files.filter(f => matchesScope(f.relativePath, scope, collection));
  
  result.filesScanned = files.length;
  
  // Index files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    options.onProgress?.({
      phase: 'indexing',
      current: i + 1,
      total: files.length,
      currentFile: file.relativePath,
    });
    
    try {
      const { chunksCreated } = await indexFile(db, file, collection);
      
      if (chunksCreated > 0) {
        result.filesIndexed++;
        result.chunksCreated += chunksCreated;
      } else {
        result.filesSkipped++;
      }
    } catch (err) {
      result.errors.push({
        path: file.relativePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  // Remove deleted files from index
  const currentPaths = new Set(files.map(f => f.relativePath));
  const deleted = removeDeletedSources(db, currentPaths, collection);
  result.filesDeleted = deleted.filesDeleted;
  result.chunksDeleted = deleted.chunksDeleted;
  
  result.duration = Date.now() - startTime;
  
  options.onProgress?.({
    phase: 'complete',
    current: files.length,
    total: files.length,
    message: `Indexed ${result.filesIndexed} files, deleted ${result.filesDeleted} stale entries`,
  });
  
  return result;
}

/**
 * Remove deleted sources from index
 * Returns count of removed sources and chunks
 */
export function removeDeletedSources(
  db: DatabaseInstance,
  currentFilePaths: Set<string>,
  collection?: string
): { filesDeleted: number; chunksDeleted: number } {
  // Get all indexed sources
  let query = 'SELECT id, path FROM sources';
  const params: string[] = [];
  
  if (collection) {
    query += ' WHERE collection = ?';
    params.push(collection);
  }
  
  const indexedSources = db.prepare(query).all(...params) as Array<{ id: number; path: string }>;
  
  let filesDeleted = 0;
  let chunksDeleted = 0;
  
  for (const source of indexedSources) {
    if (!currentFilePaths.has(source.path)) {
      // Count chunks before deletion
      const chunkCount = (db.prepare(
        'SELECT COUNT(*) as count FROM chunks WHERE source_id = ?'
      ).get(source.id) as { count: number }).count;
      
      // Delete source (cascades to chunks due to foreign key)
      db.prepare('DELETE FROM sources WHERE id = ?').run(source.id);
      
      filesDeleted++;
      chunksDeleted += chunkCount;
    }
  }
  
  return { filesDeleted, chunksDeleted };
}

/**
 * Get index statistics
 */
export function getIndexStats(db: DatabaseInstance): {
  sources: number;
  chunks: number;
  collections: string[];
} {
  const sourceCount = (db.prepare('SELECT COUNT(*) as count FROM sources').get() as { count: number }).count;
  const chunkCount = (db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number }).count;
  const collections = (db.prepare('SELECT DISTINCT collection FROM sources').all() as { collection: string }[])
    .map(r => r.collection);
  
  return {
    sources: sourceCount,
    chunks: chunkCount,
    collections,
  };
}
