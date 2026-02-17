/**
 * Database connection and schema tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  openDatabase,
  closeDatabase,
  getSchemaVersion,
  applyMigrations,
  initDatabase,
  isDatabaseValid,
  getDatabaseStats,
  runTransaction,
  getDefaultDbPath,
} from './connection.js';
import { SCHEMA_VERSION } from './schema.js';

describe('openDatabase / closeDatabase', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-db-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create database file', async () => {
    const dbPath = join(testDir, 'test.db');
    const db = await openDatabase(dbPath);
    
    expect(db).toBeDefined();
    
    closeDatabase(db);
  });

  it('should enable foreign keys', async () => {
    const dbPath = join(testDir, 'fk.db');
    const db = await openDatabase(dbPath);
    
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
    
    closeDatabase(db);
  });

  it('should create nested directories', async () => {
    const dbPath = join(testDir, 'nested', 'path', 'test.db');
    const db = await openDatabase(dbPath);
    
    expect(db).toBeDefined();
    
    closeDatabase(db);
  });
});

describe('applyMigrations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-migration-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should apply migrations to new database', async () => {
    const dbPath = join(testDir, 'migrate.db');
    const db = await openDatabase(dbPath);
    
    const result = applyMigrations(db);
    
    expect(result.applied).toBe(true);
    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(SCHEMA_VERSION);
    
    closeDatabase(db);
  });

  it('should not re-apply migrations', async () => {
    const dbPath = join(testDir, 'already.db');
    const db = await openDatabase(dbPath);
    
    applyMigrations(db);
    const result = applyMigrations(db);
    
    expect(result.applied).toBe(false);
    expect(result.message).toContain('up to date');
    
    closeDatabase(db);
  });

  it('should create all tables', async () => {
    const dbPath = join(testDir, 'tables.db');
    const db = await openDatabase(dbPath);
    applyMigrations(db);
    
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('sources');
    expect(tableNames).toContain('chunks');
    expect(tableNames).toContain('items');
    expect(tableNames).toContain('entities');
    expect(tableNames).toContain('entity_mentions');
    expect(tableNames).toContain('links');
    expect(tableNames).toContain('schema_version');
    
    closeDatabase(db);
  });

  it('should create FTS tables', async () => {
    const dbPath = join(testDir, 'fts.db');
    const db = await openDatabase(dbPath);
    applyMigrations(db);
    
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts%'"
    ).all() as { name: string }[];
    
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('chunks_fts');
    expect(tableNames).toContain('items_fts');
    expect(tableNames).toContain('entities_fts');
    
    closeDatabase(db);
  });

  it('should create indexes', async () => {
    const dbPath = join(testDir, 'indexes.db');
    const db = await openDatabase(dbPath);
    applyMigrations(db);
    
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).all() as { name: string }[];
    
    expect(indexes.length).toBeGreaterThan(0);
    
    closeDatabase(db);
  });
});

describe('getSchemaVersion', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-version-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return 0 for new database', async () => {
    const dbPath = join(testDir, 'new.db');
    const db = await openDatabase(dbPath);
    
    const version = getSchemaVersion(db);
    
    expect(version).toBe(0);
    
    closeDatabase(db);
  });

  it('should return current version after migration', async () => {
    const dbPath = join(testDir, 'migrated.db');
    const db = await openDatabase(dbPath);
    applyMigrations(db);
    
    const version = getSchemaVersion(db);
    
    expect(version).toBe(SCHEMA_VERSION);
    
    closeDatabase(db);
  });
});

describe('initDatabase', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-init-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should initialize database with schema', async () => {
    const dbPath = join(testDir, 'init.db');
    
    const { db, migration } = await initDatabase(dbPath);
    
    expect(migration.applied).toBe(true);
    expect(getSchemaVersion(db)).toBe(SCHEMA_VERSION);
    
    closeDatabase(db);
  });
});

describe('isDatabaseValid', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-valid-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return false for new database', async () => {
    const dbPath = join(testDir, 'empty.db');
    const db = await openDatabase(dbPath);
    
    expect(isDatabaseValid(db)).toBe(false);
    
    closeDatabase(db);
  });

  it('should return true for initialized database', async () => {
    const dbPath = join(testDir, 'valid.db');
    const { db } = await initDatabase(dbPath);
    
    expect(isDatabaseValid(db)).toBe(true);
    
    closeDatabase(db);
  });
});

describe('getDatabaseStats', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-stats-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should return zero counts for empty database', async () => {
    const dbPath = join(testDir, 'empty-stats.db');
    const { db } = await initDatabase(dbPath);
    
    const stats = getDatabaseStats(db);
    
    expect(stats.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stats.sourceCount).toBe(0);
    expect(stats.chunkCount).toBe(0);
    expect(stats.itemCount).toBe(0);
    expect(stats.entityCount).toBe(0);
    
    closeDatabase(db);
  });

  it('should count records correctly', async () => {
    const dbPath = join(testDir, 'with-data.db');
    const { db } = await initDatabase(dbPath);
    
    // Insert test data
    db.prepare(`
      INSERT INTO sources (path, collection, file_type, sha256, size)
      VALUES ('test.txt', 'test', 'text', 'abc123', 100)
    `).run();
    
    db.prepare(`
      INSERT INTO entities (name, entity_type) VALUES ('Test Entity', 'concept')
    `).run();
    
    const stats = getDatabaseStats(db);
    
    expect(stats.sourceCount).toBe(1);
    expect(stats.entityCount).toBe(1);
    
    closeDatabase(db);
  });
});

describe('runTransaction', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-txn-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should commit successful transaction', async () => {
    const dbPath = join(testDir, 'txn.db');
    const { db } = await initDatabase(dbPath);
    
    runTransaction(db, () => {
      db.prepare(`
        INSERT INTO sources (path, collection, file_type, sha256, size)
        VALUES ('file1.txt', 'test', 'text', 'hash1', 100)
      `).run();
      db.prepare(`
        INSERT INTO sources (path, collection, file_type, sha256, size)
        VALUES ('file2.txt', 'test', 'text', 'hash2', 200)
      `).run();
    });
    
    const stats = getDatabaseStats(db);
    expect(stats.sourceCount).toBe(2);
    
    closeDatabase(db);
  });

  it('should rollback failed transaction', async () => {
    const dbPath = join(testDir, 'rollback.db');
    const { db } = await initDatabase(dbPath);
    
    try {
      runTransaction(db, () => {
        db.prepare(`
          INSERT INTO sources (path, collection, file_type, sha256, size)
          VALUES ('file1.txt', 'test', 'text', 'hash1', 100)
        `).run();
        throw new Error('Simulated failure');
      });
    } catch {
      // Expected
    }
    
    const stats = getDatabaseStats(db);
    expect(stats.sourceCount).toBe(0);
    
    closeDatabase(db);
  });
});

describe('getDefaultDbPath', () => {
  it('should return path in 40_Brain folder', () => {
    const vaultPath = '/path/to/vault';
    const dbPath = getDefaultDbPath(vaultPath);
    
    expect(dbPath).toBe('/path/to/vault/40_Brain/.brain.db');
  });
});
