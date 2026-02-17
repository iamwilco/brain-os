/**
 * Collection manifest module
 * Generates manifests with file hashing for source collections
 */

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, extname, relative } from 'path';

/**
 * File entry in the manifest
 */
export interface ManifestFile {
  path: string;
  filename: string;
  size: number;
  mimeType: string;
  sha256: string;
  modifiedAt: string;
}

/**
 * Collection manifest
 */
export interface Manifest {
  version: '1.0';
  collection: string;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  totalSize: number;
  files: ManifestFile[];
}

/**
 * MIME type mapping by extension
 */
const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.jsonl': 'application/x-ndjson',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'text/xml',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/**
 * Get MIME type from file extension
 */
export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Calculate SHA256 hash of a file
 */
export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Calculate SHA256 hash of a string
 */
export function hashString(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Options for manifest generation
 */
export interface ManifestOptions {
  collectionName: string;
  excludePatterns?: string[];
  includeHidden?: boolean;
}

/**
 * Check if a path should be excluded
 */
function shouldExclude(
  path: string,
  excludePatterns: string[],
  includeHidden: boolean
): boolean {
  const filename = path.split('/').pop() || '';

  // Skip hidden files unless explicitly included
  if (!includeHidden && filename.startsWith('.')) {
    return true;
  }

  // Check exclude patterns
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
async function collectFiles(
  dir: string,
  baseDir: string,
  excludePatterns: string[],
  includeHidden: boolean
): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = relative(baseDir, fullPath);

    if (shouldExclude(relativePath, excludePatterns, includeHidden)) {
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      const subFiles = await collectFiles(
        fullPath,
        baseDir,
        excludePatterns,
        includeHidden
      );
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * Generate manifest entry for a single file
 */
async function generateFileEntry(
  filePath: string,
  baseDir: string
): Promise<ManifestFile> {
  const stats = await stat(filePath);
  const sha256 = await hashFile(filePath);

  return {
    path: relative(baseDir, filePath),
    filename: filePath.split('/').pop() || '',
    size: stats.size,
    mimeType: getMimeType(filePath),
    sha256,
    modifiedAt: stats.mtime.toISOString(),
  };
}

/**
 * Generate a manifest for a collection directory
 */
export async function generateManifest(
  collectionDir: string,
  options: ManifestOptions
): Promise<Manifest> {
  const {
    collectionName,
    excludePatterns = ['manifest.json', '.DS_Store', '__MACOSX'],
    includeHidden = false,
  } = options;

  const filePaths = await collectFiles(
    collectionDir,
    collectionDir,
    excludePatterns,
    includeHidden
  );

  const files: ManifestFile[] = [];
  let totalSize = 0;

  for (const filePath of filePaths) {
    const entry = await generateFileEntry(filePath, collectionDir);
    files.push(entry);
    totalSize += entry.size;
  }

  // Sort files by path for consistent ordering
  files.sort((a, b) => a.path.localeCompare(b.path));

  const now = new Date().toISOString();

  return {
    version: '1.0',
    collection: collectionName,
    createdAt: now,
    updatedAt: now,
    fileCount: files.length,
    totalSize,
    files,
  };
}

/**
 * Write manifest to file
 */
export async function writeManifest(
  manifest: Manifest,
  outputPath: string
): Promise<void> {
  const content = JSON.stringify(manifest, null, 2);
  await writeFile(outputPath, content + '\n', 'utf-8');
}

/**
 * Read manifest from file
 */
export async function readManifest(manifestPath: string): Promise<Manifest> {
  const content = await readFile(manifestPath, 'utf-8');
  return JSON.parse(content) as Manifest;
}

/**
 * Verify manifest against actual files
 * Returns list of discrepancies
 */
export async function verifyManifest(
  manifest: Manifest,
  collectionDir: string
): Promise<VerificationResult> {
  const missing: string[] = [];
  const modified: string[] = [];
  const extra: string[] = [];

  // Check each file in manifest
  for (const file of manifest.files) {
    const fullPath = join(collectionDir, file.path);

    try {
      const currentHash = await hashFile(fullPath);
      if (currentHash !== file.sha256) {
        modified.push(file.path);
      }
    } catch {
      missing.push(file.path);
    }
  }

  // Check for extra files not in manifest
  const manifestPaths = new Set(manifest.files.map((f) => f.path));
  const currentFiles = await collectFiles(
    collectionDir,
    collectionDir,
    ['manifest.json', '.DS_Store', '__MACOSX'],
    false
  );

  for (const filePath of currentFiles) {
    const relativePath = relative(collectionDir, filePath);
    if (!manifestPaths.has(relativePath)) {
      extra.push(relativePath);
    }
  }

  return {
    valid: missing.length === 0 && modified.length === 0 && extra.length === 0,
    missing,
    modified,
    extra,
  };
}

/**
 * Verification result
 */
export interface VerificationResult {
  valid: boolean;
  missing: string[];
  modified: string[];
  extra: string[];
}

/**
 * Update an existing manifest with changes
 */
export async function updateManifest(
  existingManifest: Manifest,
  collectionDir: string
): Promise<Manifest> {
  const verification = await verifyManifest(existingManifest, collectionDir);

  // If no changes, just update timestamp
  if (verification.valid) {
    return {
      ...existingManifest,
      updatedAt: new Date().toISOString(),
    };
  }

  // Regenerate manifest
  const newManifest = await generateManifest(collectionDir, {
    collectionName: existingManifest.collection,
  });

  return {
    ...newManifest,
    createdAt: existingManifest.createdAt,
  };
}
