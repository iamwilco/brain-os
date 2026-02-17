/**
 * ZIP extraction module for ChatGPT exports
 * Handles extraction of ZIP files with nested folder structures
 */

import { createWriteStream } from 'fs';
import { mkdir, rm, readdir, stat } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';

/**
 * Extraction result
 */
export interface ExtractionResult {
  tempDir: string;
  files: ExtractedFile[];
  conversationsJsonPath: string | null;
}

/**
 * Extracted file info
 */
export interface ExtractedFile {
  path: string;
  filename: string;
  size: number;
}

/**
 * Create a temporary directory for extraction
 */
export async function createTempDir(): Promise<string> {
  const tempDir = join(tmpdir(), `brain-chatgpt-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Open a ZIP file and return a yauzl ZipFile instance
 */
function openZipFile(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipFile) => {
      if (err) reject(err);
      else if (zipFile) resolve(zipFile);
      else reject(new Error('Failed to open ZIP file'));
    });
  });
}

/**
 * Extract a single entry from the ZIP file
 */
function extractEntry(
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
  destPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, async (err, readStream) => {
      if (err) {
        reject(err);
        return;
      }
      if (!readStream) {
        reject(new Error('Failed to open read stream'));
        return;
      }

      try {
        await mkdir(dirname(destPath), { recursive: true });
        const writeStream = createWriteStream(destPath);
        await pipeline(readStream, writeStream);
        resolve();
      } catch (pipeErr) {
        reject(pipeErr);
      }
    });
  });
}

/**
 * Extract a ZIP file to a temporary directory
 */
export async function extractZip(zipPath: string): Promise<ExtractionResult> {
  const tempDir = await createTempDir();
  const files: ExtractedFile[] = [];
  let conversationsJsonPath: string | null = null;

  const zipFile = await openZipFile(zipPath);

  return new Promise((resolve, reject) => {
    zipFile.on('error', reject);

    zipFile.on('entry', async (entry: yauzl.Entry) => {
      const fileName = entry.fileName;

      // Skip directories
      if (fileName.endsWith('/')) {
        zipFile.readEntry();
        return;
      }

      // Skip macOS metadata files
      if (fileName.includes('__MACOSX') || fileName.startsWith('.')) {
        zipFile.readEntry();
        return;
      }

      const destPath = join(tempDir, fileName);

      try {
        await extractEntry(zipFile, entry, destPath);

        const fileStats = await stat(destPath);
        files.push({
          path: destPath,
          filename: basename(fileName),
          size: fileStats.size,
        });

        // Track conversations.json
        if (basename(fileName) === 'conversations.json') {
          conversationsJsonPath = destPath;
        }

        zipFile.readEntry();
      } catch (err) {
        reject(err);
      }
    });

    zipFile.on('end', () => {
      resolve({
        tempDir,
        files,
        conversationsJsonPath,
      });
    });

    // Start reading entries
    zipFile.readEntry();
  });
}

/**
 * Find conversations.json in a directory (handles nested structures)
 */
export async function findConversationsJson(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isFile() && entry.name === 'conversations.json') {
      return fullPath;
    }

    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const found = await findConversationsJson(fullPath);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Check if a file is a ZIP file by extension
 */
export function isZipFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.zip');
}

/**
 * Extract ZIP and find conversations.json
 * Returns the path to conversations.json and cleanup function
 */
export async function extractAndFindConversations(
  zipPath: string
): Promise<{
  conversationsPath: string;
  tempDir: string;
  cleanup: () => Promise<void>;
}> {
  const result = await extractZip(zipPath);

  // First check if we found it during extraction
  let conversationsPath = result.conversationsJsonPath;

  // If not found, search recursively
  if (!conversationsPath) {
    conversationsPath = await findConversationsJson(result.tempDir);
  }

  if (!conversationsPath) {
    await cleanupTempDir(result.tempDir);
    throw new Error('conversations.json not found in ZIP file');
  }

  return {
    conversationsPath,
    tempDir: result.tempDir,
    cleanup: () => cleanupTempDir(result.tempDir),
  };
}

/**
 * Get ZIP file statistics
 */
export async function getZipStats(zipPath: string): Promise<{
  fileCount: number;
  totalSize: number;
  hasConversationsJson: boolean;
}> {
  const zipFile = await openZipFile(zipPath);
  let fileCount = 0;
  let totalSize = 0;
  let hasConversationsJson = false;

  return new Promise((resolve, reject) => {
    zipFile.on('error', reject);

    zipFile.on('entry', (entry: yauzl.Entry) => {
      if (!entry.fileName.endsWith('/')) {
        fileCount++;
        totalSize += entry.uncompressedSize;

        if (basename(entry.fileName) === 'conversations.json') {
          hasConversationsJson = true;
        }
      }
      zipFile.readEntry();
    });

    zipFile.on('end', () => {
      zipFile.close();
      resolve({ fileCount, totalSize, hasConversationsJson });
    });

    zipFile.readEntry();
  });
}
