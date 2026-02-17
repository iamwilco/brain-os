/**
 * Utility functions
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';

/**
 * Generate a short hash for IDs
 */
export function generateHash(content: string, length = 8): string {
  return createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, length);
}

/**
 * Generate a hash from a file
 */
export function hashFile(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Generate a source ID
 */
export function generateSourceId(path: string, hash: string): string {
  return `src_${generateHash(`${path}:${hash}`, 8)}`;
}

/**
 * Generate an item ID
 */
export function generateItemId(
  type: string,
  title: string,
  sourceId: string,
  startLine?: number
): string {
  const content = `${type}:${title}:${sourceId}:${startLine ?? 0}`;
  return `itm_${generateHash(content, 8)}`;
}

/**
 * Generate an entity ID
 */
export function generateEntityId(name: string, type: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20);
  const hash = generateHash(`${type}:${name}`, 4);
  return `ent_${slug}_${hash}`;
}

/**
 * Slugify a string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Format a date as ISO string (date only)
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format a date as ISO string (full timestamp)
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}
