/**
 * Database connection and migration management
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { mkdir } from 'fs/promises';
import { SCHEMA_VERSION, SCHEMA_MIGRATION } from './schema.js';

/**
 * Database instance type
 */
export type DatabaseInstance = Database.Database;

/**
 * Database options
 */
export interface DatabaseOptions {
  readonly?: boolean;
  verbose?: boolean;
}

/**
 * Open or create a database connection
 */
export async function openDatabase(
  dbPath: string,
  options: DatabaseOptions = {}
): Promise<DatabaseInstance> {
  // Ensure directory exists
  await mkdir(dirname(dbPath), { recursive: true });

  // Build options object, only include defined values
  const dbOptions: Database.Options = {};
  if (options.readonly !== undefined) {
    dbOptions.readonly = options.readonly;
  }
  if (options.verbose) {
    dbOptions.verbose = console.log;
  }

  const db = new Database(dbPath, dbOptions);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  return db;
}

/**
 * Close a database connection
 */
export function closeDatabase(db: DatabaseInstance): void {
  db.close();
}

/**
 * Get current schema version
 */
export function getSchemaVersion(db: DatabaseInstance): number {
  try {
    const row = db.prepare(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    ).get() as { version: number } | undefined;
    return row?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Apply schema migrations
 */
export function applyMigrations(db: DatabaseInstance): MigrationResult {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion >= SCHEMA_VERSION) {
    return {
      applied: false,
      fromVersion: currentVersion,
      toVersion: currentVersion,
      message: 'Schema is up to date',
    };
  }

  // Apply the migration
  db.exec(SCHEMA_MIGRATION);

  // Record the migration
  db.prepare(
    'INSERT OR REPLACE INTO schema_version (version) VALUES (?)'
  ).run(SCHEMA_VERSION);

  return {
    applied: true,
    fromVersion: currentVersion,
    toVersion: SCHEMA_VERSION,
    message: `Migrated from version ${currentVersion} to ${SCHEMA_VERSION}`,
  };
}

/**
 * Migration result
 */
export interface MigrationResult {
  applied: boolean;
  fromVersion: number;
  toVersion: number;
  message: string;
}

/**
 * Initialize database with schema
 */
export async function initDatabase(
  dbPath: string,
  options: DatabaseOptions = {}
): Promise<{ db: DatabaseInstance; migration: MigrationResult }> {
  const db = await openDatabase(dbPath, options);
  const migration = applyMigrations(db);
  return { db, migration };
}

/**
 * Check if database exists and has valid schema
 */
export function isDatabaseValid(db: DatabaseInstance): boolean {
  try {
    const version = getSchemaVersion(db);
    return version > 0;
  } catch {
    return false;
  }
}

/**
 * Get database statistics
 */
export function getDatabaseStats(db: DatabaseInstance): DatabaseStats {
  const counts: Record<string, number> = {};
  
  const tables = [
    'sources', 'chunks', 'items', 'entities', 'entity_mentions', 'links',
    'projects', 'runs', 'artifacts', 'source_collections'
  ];
  
  for (const table of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      counts[table] = row.count;
    } catch {
      counts[table] = 0;
    }
  }

  return {
    schemaVersion: getSchemaVersion(db),
    sourceCount: counts.sources,
    chunkCount: counts.chunks,
    itemCount: counts.items,
    entityCount: counts.entities,
    mentionCount: counts.entity_mentions,
    linkCount: counts.links,
    projectCount: counts.projects,
    runCount: counts.runs,
    artifactCount: counts.artifacts,
    collectionCount: counts.source_collections,
  };
}

/**
 * Database statistics
 */
export interface DatabaseStats {
  schemaVersion: number;
  sourceCount: number;
  chunkCount: number;
  itemCount: number;
  entityCount: number;
  mentionCount: number;
  linkCount: number;
  projectCount: number;
  runCount: number;
  artifactCount: number;
  collectionCount: number;
}

/**
 * Run a transaction
 */
export function runTransaction<T>(
  db: DatabaseInstance,
  fn: () => T
): T {
  return db.transaction(fn)();
}

/**
 * Default database path relative to vault
 */
export function getDefaultDbPath(vaultPath: string): string {
  return join(vaultPath, '40_Brain', '.brain.db');
}
