/**
 * Incremental change detection module
 * Detects changed files by comparing against manifest hashes
 */

import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import {
  hashFile,
  generateManifest,
  readManifest,
  writeManifest,
  type Manifest,
  type ManifestFile,
} from './manifest.js';

/**
 * Change type for a file
 */
export type ChangeType = 'added' | 'modified' | 'deleted' | 'unchanged';

/**
 * File change entry
 */
export interface FileChange {
  path: string;
  changeType: ChangeType;
  oldHash?: string;
  newHash?: string;
  oldSize?: number;
  newSize?: number;
}

/**
 * Change detection result
 */
export interface ChangeDetectionResult {
  added: FileChange[];
  modified: FileChange[];
  deleted: FileChange[];
  unchanged: FileChange[];
  totalChanges: number;
  hasChanges: boolean;
}

/**
 * Incremental processing result
 */
export interface IncrementalResult {
  changes: ChangeDetectionResult;
  filesToProcess: string[];
  manifest: Manifest;
}

/**
 * Options for change detection
 */
export interface ChangeDetectionOptions {
  excludePatterns?: string[];
  includeHidden?: boolean;
}

const DEFAULT_OPTIONS: Required<ChangeDetectionOptions> = {
  excludePatterns: ['manifest.json', '.DS_Store', '__MACOSX'],
  includeHidden: false,
};

/**
 * Check if path should be excluded
 */
function shouldExclude(
  path: string,
  excludePatterns: string[],
  includeHidden: boolean
): boolean {
  const filename = path.split('/').pop() || '';

  if (!includeHidden && filename.startsWith('.')) {
    return true;
  }

  for (const pattern of excludePatterns) {
    if (path.includes(pattern) || filename.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively collect all files in a directory
 */
async function collectCurrentFiles(
  dir: string,
  baseDir: string,
  options: Required<ChangeDetectionOptions>
): Promise<Map<string, { path: string; size: number }>> {
  const files = new Map<string, { path: string; size: number }>();
  
  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relativePath = relative(baseDir, fullPath);

      if (shouldExclude(relativePath, options.excludePatterns, options.includeHidden)) {
        continue;
      }

      if (entry.isFile()) {
        const stats = await stat(fullPath);
        files.set(relativePath, { path: fullPath, size: stats.size });
      } else if (entry.isDirectory()) {
        await walk(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Detect changes between manifest and current directory state
 */
export async function detectChanges(
  collectionDir: string,
  manifest: Manifest,
  options: ChangeDetectionOptions = {}
): Promise<ChangeDetectionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const added: FileChange[] = [];
  const modified: FileChange[] = [];
  const deleted: FileChange[] = [];
  const unchanged: FileChange[] = [];

  // Build map of manifest files
  const manifestFiles = new Map<string, ManifestFile>();
  for (const file of manifest.files) {
    manifestFiles.set(file.path, file);
  }

  // Get current files
  const currentFiles = await collectCurrentFiles(collectionDir, collectionDir, opts);

  // Check each current file against manifest
  for (const [relativePath, fileInfo] of currentFiles) {
    const manifestFile = manifestFiles.get(relativePath);

    if (!manifestFile) {
      // File is new
      const newHash = await hashFile(fileInfo.path);
      added.push({
        path: relativePath,
        changeType: 'added',
        newHash,
        newSize: fileInfo.size,
      });
    } else {
      // File exists in manifest - check if modified
      // Quick check: compare size first
      if (fileInfo.size !== manifestFile.size) {
        const newHash = await hashFile(fileInfo.path);
        modified.push({
          path: relativePath,
          changeType: 'modified',
          oldHash: manifestFile.sha256,
          newHash,
          oldSize: manifestFile.size,
          newSize: fileInfo.size,
        });
      } else {
        // Size matches, check hash
        const newHash = await hashFile(fileInfo.path);
        if (newHash !== manifestFile.sha256) {
          modified.push({
            path: relativePath,
            changeType: 'modified',
            oldHash: manifestFile.sha256,
            newHash,
            oldSize: manifestFile.size,
            newSize: fileInfo.size,
          });
        } else {
          unchanged.push({
            path: relativePath,
            changeType: 'unchanged',
            oldHash: manifestFile.sha256,
            newHash,
            oldSize: manifestFile.size,
            newSize: fileInfo.size,
          });
        }
      }

      // Remove from manifest map (remaining will be deleted)
      manifestFiles.delete(relativePath);
    }
  }

  // Remaining files in manifest are deleted
  for (const [relativePath, manifestFile] of manifestFiles) {
    deleted.push({
      path: relativePath,
      changeType: 'deleted',
      oldHash: manifestFile.sha256,
      oldSize: manifestFile.size,
    });
  }

  const totalChanges = added.length + modified.length + deleted.length;

  return {
    added,
    modified,
    deleted,
    unchanged,
    totalChanges,
    hasChanges: totalChanges > 0,
  };
}

/**
 * Detect changes from manifest file
 */
export async function detectChangesFromManifest(
  collectionDir: string,
  manifestPath: string,
  options: ChangeDetectionOptions = {}
): Promise<ChangeDetectionResult> {
  const manifest = await readManifest(manifestPath);
  return detectChanges(collectionDir, manifest, options);
}

/**
 * Get files that need processing (added or modified)
 */
export function getFilesToProcess(changes: ChangeDetectionResult): string[] {
  const files: string[] = [];
  
  for (const change of changes.added) {
    files.push(change.path);
  }
  
  for (const change of changes.modified) {
    files.push(change.path);
  }
  
  return files.sort();
}

/**
 * Perform incremental update - detect changes and update manifest
 */
export async function incrementalUpdate(
  collectionDir: string,
  collectionName: string,
  existingManifest?: Manifest
): Promise<IncrementalResult> {
  // If no existing manifest, treat all files as new
  if (!existingManifest) {
    const manifest = await generateManifest(collectionDir, { collectionName });
    const filesToProcess = manifest.files.map(f => f.path);
    
    return {
      changes: {
        added: manifest.files.map(f => ({
          path: f.path,
          changeType: 'added' as const,
          newHash: f.sha256,
          newSize: f.size,
        })),
        modified: [],
        deleted: [],
        unchanged: [],
        totalChanges: manifest.files.length,
        hasChanges: manifest.files.length > 0,
      },
      filesToProcess,
      manifest,
    };
  }

  // Detect changes against existing manifest
  const changes = await detectChanges(collectionDir, existingManifest);

  // Generate new manifest
  const manifest = await generateManifest(collectionDir, { collectionName });
  manifest.createdAt = existingManifest.createdAt; // Preserve creation date

  // Get files that need processing
  const filesToProcess = getFilesToProcess(changes);

  return {
    changes,
    filesToProcess,
    manifest,
  };
}

/**
 * Update manifest file incrementally
 */
export async function updateManifestFile(
  collectionDir: string,
  manifestPath: string,
  collectionName: string
): Promise<IncrementalResult> {
  let existingManifest: Manifest | undefined;
  
  try {
    existingManifest = await readManifest(manifestPath);
  } catch {
    // Manifest doesn't exist, will create new
  }

  const result = await incrementalUpdate(collectionDir, collectionName, existingManifest);
  
  // Write updated manifest
  await writeManifest(result.manifest, manifestPath);
  
  return result;
}

/**
 * Summary of changes for display
 */
export function summarizeChanges(changes: ChangeDetectionResult): string {
  const lines: string[] = [];
  
  if (changes.added.length > 0) {
    lines.push(`Added: ${changes.added.length} file(s)`);
  }
  if (changes.modified.length > 0) {
    lines.push(`Modified: ${changes.modified.length} file(s)`);
  }
  if (changes.deleted.length > 0) {
    lines.push(`Deleted: ${changes.deleted.length} file(s)`);
  }
  if (changes.unchanged.length > 0) {
    lines.push(`Unchanged: ${changes.unchanged.length} file(s)`);
  }
  
  if (lines.length === 0) {
    return 'No files found';
  }
  
  return lines.join(', ');
}
