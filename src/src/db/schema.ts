/**
 * SQLite database schema
 * Defines tables for sources, chunks, items, entities, and links
 */

/**
 * Schema version for migrations
 */
export const SCHEMA_VERSION = 2;

/**
 * Migration to create all tables
 */
export const SCHEMA_MIGRATION = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sources: imported files and collections
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  collection TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT -- JSON blob for extra metadata
);

-- Chunks: text segments from sources
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  start_char INTEGER,
  end_char INTEGER,
  token_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
  UNIQUE(source_id, chunk_index)
);

-- Items: extracted knowledge items (facts, concepts, etc.)
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chunk_id INTEGER NOT NULL,
  item_type TEXT NOT NULL, -- 'fact', 'concept', 'quote', 'reference', etc.
  content TEXT NOT NULL,
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT, -- JSON blob
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

-- Entities: named entities (people, places, concepts)
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'person', 'place', 'concept', 'project', etc.
  canonical_name TEXT, -- normalized form
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT, -- JSON blob
  UNIQUE(name, entity_type)
);

-- Entity mentions: links items to entities
CREATE TABLE IF NOT EXISTS entity_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  entity_id INTEGER NOT NULL,
  mention_text TEXT,
  start_pos INTEGER,
  end_pos INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Links: relationships between entities
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_entity_id INTEGER NOT NULL,
  target_entity_id INTEGER NOT NULL,
  link_type TEXT NOT NULL, -- 'relates_to', 'part_of', 'created_by', etc.
  weight REAL DEFAULT 1.0,
  evidence_item_id INTEGER, -- item that supports this link
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT, -- JSON blob
  FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_item_id) REFERENCES items(id) ON DELETE SET NULL,
  UNIQUE(source_entity_id, target_entity_id, link_type)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sources_collection ON sources(collection);
CREATE INDEX IF NOT EXISTS idx_sources_sha256 ON sources(sha256);
CREATE INDEX IF NOT EXISTS idx_chunks_source_id ON chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_items_chunk_id ON items(chunk_id);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_item ON entity_mentions(item_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity ON entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_links_type ON links(link_type);

-- Full-text search indexes
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  content,
  content='chunks',
  content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
  content,
  content='items',
  content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  name,
  description,
  content='entities',
  content_rowid='id'
);

-- Triggers to keep FTS indexes in sync
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO items_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, name, description) VALUES (new.id, new.name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, description) VALUES('delete', old.id, old.name, old.description);
END;

CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, name, description) VALUES('delete', old.id, old.name, old.description);
  INSERT INTO entities_fts(rowid, name, description) VALUES (new.id, new.name, new.description);
END;

-- Projects: user projects with agents
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  description TEXT,
  root_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'archived'
  linked_scopes TEXT, -- JSON array of scope strings
  agent_ids TEXT, -- JSON array of agent IDs
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Runs: execution tracking for operations
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  action TEXT NOT NULL, -- 'ingest', 'index', 'extract', 'synth', 'skill', etc.
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'running', 'success', 'fail'
  progress INTEGER DEFAULT 0, -- 0-100
  logs TEXT, -- JSON array of log lines
  artifact_ids TEXT, -- JSON array of artifact IDs produced
  error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Artifacts: outputs from agent runs
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'markdown', 'tasks', 'mindmap', 'report', 'diff', 'context-pack'
  title TEXT,
  agent_id TEXT,
  run_id TEXT,
  project_id TEXT,
  scope_ref TEXT, -- scope query that produced this
  file_path TEXT, -- path to artifact file
  content TEXT, -- inline content for small artifacts
  render_hints TEXT, -- JSON hints for UI rendering
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Source collections: tracking import batches
CREATE TABLE IF NOT EXISTS source_collections (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'chatgpt', 'claude', 'folder'
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'ready', 'error'
  conversation_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  item_count INTEGER DEFAULT 0,
  errors TEXT, -- JSON array of error messages
  import_path TEXT, -- original import path
  last_imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_action ON runs(action);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_source_collections_type ON source_collections(type);
CREATE INDEX IF NOT EXISTS idx_source_collections_status ON source_collections(status);
`;

/**
 * Table definitions for TypeScript types
 */
export interface Source {
  id: number;
  path: string;
  collection: string;
  file_type: string;
  mime_type: string | null;
  sha256: string;
  size: number;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

export interface Chunk {
  id: number;
  source_id: number;
  chunk_index: number;
  content: string;
  start_line: number | null;
  end_line: number | null;
  start_char: number | null;
  end_char: number | null;
  token_count: number | null;
  created_at: string;
}

export interface Item {
  id: number;
  chunk_id: number;
  item_type: string;
  content: string;
  confidence: number;
  created_at: string;
  metadata: string | null;
}

export interface Entity {
  id: number;
  name: string;
  entity_type: string;
  canonical_name: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

export interface EntityMention {
  id: number;
  item_id: number;
  entity_id: number;
  mention_text: string | null;
  start_pos: number | null;
  end_pos: number | null;
  created_at: string;
}

export interface Link {
  id: number;
  source_entity_id: number;
  target_entity_id: number;
  link_type: string;
  weight: number;
  evidence_item_id: number | null;
  created_at: string;
  metadata: string | null;
}

/**
 * Project record
 */
export interface Project {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  root_path: string;
  status: 'active' | 'paused' | 'archived';
  linked_scopes: string | null; // JSON array
  agent_ids: string | null; // JSON array
  created_at: string;
  updated_at: string;
}

/**
 * Run record
 */
export interface Run {
  id: string;
  agent_id: string | null;
  action: 'ingest' | 'index' | 'extract' | 'synth' | 'skill' | 'brainstorm' | 'write';
  status: 'queued' | 'running' | 'success' | 'fail';
  progress: number;
  logs: string | null; // JSON array
  artifact_ids: string | null; // JSON array
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

/**
 * Artifact record
 */
export interface Artifact {
  id: string;
  type: 'markdown' | 'tasks' | 'mindmap' | 'report' | 'diff' | 'context-pack';
  title: string | null;
  agent_id: string | null;
  run_id: string | null;
  project_id: string | null;
  scope_ref: string | null;
  file_path: string | null;
  content: string | null;
  render_hints: string | null; // JSON
  created_at: string;
}

/**
 * Source collection record
 */
export interface SourceCollection {
  id: string;
  type: 'chatgpt' | 'claude' | 'folder';
  name: string | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  conversation_count: number;
  message_count: number;
  item_count: number;
  errors: string | null; // JSON array
  import_path: string | null;
  last_imported_at: string | null;
  created_at: string;
  updated_at: string;
}
