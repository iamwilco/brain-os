# Brain System — Complete Capabilities Guide

> A comprehensive overview of all features, functions, and workflows in the Wilco OS Brain system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Web Interface (Frontend)](#web-interface-frontend)
3. [REST API Endpoints](#rest-api-endpoints)
4. [CLI Commands](#cli-commands)
5. [Agent System](#agent-system)
6. [Data Architecture](#data-architecture)

---

## System Overview

The Brain is a **local-first knowledge management system** built for the Wilco OS Obsidian vault. It provides:

- **Project Management** — Track projects with agents, sources, and extracted knowledge
- **AI Agents** — Autonomous agents scoped to projects or skills
- **Knowledge Extraction** — Extract entities, tasks, decisions, and claims from files
- **Full-Text Search** — Search across all indexed content
- **Source Management** — Import and manage external data sources (ChatGPT, Claude exports)
- **Context Export** — Generate context packs for AI assistants

### Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js 22+, Fastify, TypeScript |
| Database | SQLite via better-sqlite3 |
| Frontend | React, Vite, TailwindCSS |
| LLM | Anthropic Claude API |

---

## Web Interface (Frontend)

### Dashboard (`/`)

The main dashboard provides an overview of:
- Active projects count
- Recent activity
- Quick navigation to all sections

### Projects (`/projects`)

#### Project List View
- View all projects with status indicators
- Create new projects with emoji, name, description
- Filter and search projects
- Quick access to project details

#### Project Detail View (`/projects/:id`)

**Tabs:**

1. **Overview Tab**
   - Project stats (total items, linked notes, tasks)
   - Status indicator (active/paused/completed/archived)
   - Last activity timestamp
   - Quick metrics

2. **Knowledge Tab**
   - **File Upload Zone**: Drag-and-drop file upload
     - Supported: `.md`, `.txt`, `.pdf`, `.json`, `.csv`
     - Progress indicator during upload
     - Success/failure feedback
   - **Extract Button**: Trigger knowledge extraction
     - Scans project files
     - Extracts entities, claims, tasks, decisions, notes
     - Shows extraction results (files scanned, items extracted)
   - **Knowledge Items Display**:
     - Filter by type (entity, claim, task, decision, note)
     - Search within items
     - Click to expand with source citation (file, line number)
     - Type-specific icons

3. **Sources Tab**
   - View linked source scopes
   - Add/remove source connections
   - Scope format: `path:`, `tag:`, `collection:`

4. **Chat Tab**
   - Chat with project agent
   - Persistent conversation history
   - Save session to memory
   - Real-time streaming responses

5. **Agent Tab**
   - View agent configuration (AGENT.md)
   - Create agent if none exists
   - Agent status indicator
   - Edit agent config and memory

6. **Tasks Tab**
   - View project-related tasks
   - Task status (pending, in-progress, completed)

### Agents (`/agents`)

#### Agent List View
- All agents (admin, project, skill)
- Type badges and status indicators
- Last run timestamp

#### Agent Detail View (`/agents/:id`)
- **Config Tab**: Edit AGENT.md
- **Memory Tab**: Edit MEMORY.md
- **Sessions Tab**: View conversation history
- Run/Restart agent controls

### Sources (`/sources`)

#### Source Collections List
- View all imported source collections
- Status (pending, processing, complete, error)
- Item counts (conversations, messages, extracted items)

#### Source Detail View (`/sources/:id`)
- Collection metadata
- Import statistics
- Error details if any

---

## REST API Endpoints

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check, returns version |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List all projects (paginated) |
| GET | `/projects/:id` | Get single project |
| POST | `/projects` | Create new project |
| PUT | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |
| PUT | `/projects/:id/sources` | Update linked sources |
| POST | `/projects/:id/agent` | Create project agent |
| POST | `/projects/:id/chat` | Send chat message |
| GET | `/projects/:id/chat/history` | Get chat history |
| POST | `/projects/:id/chat/memory` | Save session to memory |
| POST | `/projects/:id/upload` | Upload files to project |
| POST | `/projects/:id/extract` | Trigger knowledge extraction |
| GET | `/projects/:id/knowledge` | Get extracted knowledge items |

#### Knowledge Items Query Params
- `type`: Filter by item type (entity, claim, task, decision, note)
- `search`: Search within title/content
- `limit`: Max results (default 50, max 100)
- `offset`: Pagination offset

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/agents` | List all agents |
| GET | `/agents/:id` | Get single agent |
| POST | `/agents/:id/spawn` | Spawn new agent |
| POST | `/agents/:id/run` | Execute agent |
| PUT | `/agents/:id/restart` | Restart agent |
| GET | `/agents/:id/config` | Get AGENT.md content |
| PUT | `/agents/:id/config` | Save AGENT.md content |
| GET | `/agents/:id/memory` | Get MEMORY.md content |
| PUT | `/agents/:id/memory` | Save MEMORY.md content |

### Sources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sources` | List source collections |
| GET | `/sources/:id` | Get single collection |
| POST | `/sources/import` | Import new source |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search` | Full-text search |

#### Search Query Params
- `query`: Search query (required)
- `scope`: Scope filter (path:, tag:, collection:)
- `limit`: Max results
- `offset`: Pagination offset
- `filters`: Additional filters (JSON)

### Runs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/runs` | List all runs |
| GET | `/runs/:id` | Get single run |
| POST | `/runs` | Create new run |
| DELETE | `/runs/:id` | Cancel run |

### Events (WebSocket)

| Endpoint | Description |
|----------|-------------|
| `/events` | Real-time event stream |

---

## CLI Commands

### `brain init`

Initialize a new vault or configure an existing one.

```bash
brain init --vault <path> [--force]
```

**Options:**
- `--vault <path>`: Path to Obsidian vault (default: `.`)
- `--force`: Overwrite existing template files

**Creates:**
- Standard folder structure (00_Inbox, 10_MOCs, etc.)
- Template files
- Configuration files

---

### `brain ingest <source>`

Ingest sources into the knowledge base.

```bash
brain ingest chatgpt --input export.zip
brain ingest claude --input conversations.json
brain ingest folder --input ./docs --collection my-docs
```

**Sources:**
- `chatgpt`: ChatGPT conversation export
- `claude`: Claude conversation export
- `folder`: Local folder of files

**Options:**
- `--input <path>`: Input file or directory
- `--collection <name>`: Collection name for folder ingestion

---

### `brain index`

Build or update the search index.

```bash
brain index --vault <path> --scope <scope>
```

**Options:**
- `--vault <path>`: Path to vault (default: `.`)
- `--scope <scope>`: Scope to index
  - `all`: Index everything
  - `collection:<id>`: Specific collection
  - `path:<glob>`: Path pattern

**Output:**
- Files scanned/indexed/skipped/deleted
- Chunks created/deleted
- Total sources and chunks in index

---

### `brain search <query>`

Search the knowledge base.

```bash
brain search "project management" --scope path:30_Projects/* --limit 20
```

**Options:**
- `--scope <scope>`: Scope filter (path:, tag:, moc:)
- `--limit <n>`: Maximum results (default: 10)

---

### `brain extract`

Extract structured knowledge from sources.

```bash
brain extract --vault . --collection chatgpt --limit 50 --since 2024-01-01
```

**Options:**
- `--vault <path>`: Path to vault
- `--collection <name>`: Collection to extract from
- `--limit <n>`: Maximum sources to process
- `--since <date>`: Only process sources after date (YYYY-MM-DD)
- `--dry-run`: Preview without making changes

**Extracts:**
- Entities (people, concepts, tools)
- Facts/Claims
- Tasks
- Insights

---

### `brain synth <type>`

Run synthesis operations.

```bash
brain synth weekly --vault .
brain synth daily --vault .
```

**Types:**

**`weekly`** (Full synthesis):
1. Update entity note sections (hot/warm/cold)
2. Generate status snapshot
3. Generate changelog with highlights

**`daily`** (Light synthesis):
1. Generate changelog only

---

### `brain export context-pack`

Export knowledge as a context pack for AI assistants.

```bash
brain export context-pack --vault . --scope moc:10_MOCs/Brain.md --to ./export --include-citations
```

**Options:**
- `--vault <path>`: Path to vault
- `--scope <scope>`: Scope to export
- `--to <path>`: Destination path
- `--include-citations`: Include CITATIONS.md file
- `--max-files <n>`: Maximum files to include
- `--max-size <kb>`: Maximum total size in KB

**Output:**
- `manifest.json`: File listing and metadata
- `README.md`: Context pack documentation
- `CITATIONS.md`: Source citations (if requested)
- Content files

---

## Agent System

### Agent Types

| Type | Location | Scope | Purpose |
|------|----------|-------|---------|
| **Admin** | `40_Brain/agents/admin/` | Entire vault | Coordinate agents, system management |
| **Project** | `30_Projects/<name>/agent/` | Project folder | Project-specific tasks |
| **Skill** | `40_Brain/agents/skills/<name>/` | Task-based | Specialized capabilities (SEO, Writing) |

### Agent Files

Each agent has:

1. **AGENT.md** — Configuration and identity
   ```yaml
   ---
   id: agent-uuid
   name: Agent Name
   type: project
   status: idle
   scope:
     - "path:30_Projects/MyProject/**"
   created: 2026-01-01
   updated: 2026-01-01
   ---
   ```

2. **MEMORY.md** — Persistent memory
   - Context from previous sessions
   - Key facts and decisions
   - Project-specific knowledge

3. **sessions/** — Conversation transcripts
   - One file per session
   - Append-only logs

### Agent Capabilities

- **Chat**: Conversational interface with project context
- **Memory**: Persistent storage across sessions
- **Scope Enforcement**: Cannot access files outside scope
- **Session Transcripts**: All conversations logged

---

## Data Architecture

### Database Schema (SQLite)

**Core Tables:**
- `projects` — Project metadata
- `agents` — Agent configurations
- `source_collections` — Imported source collections
- `sources` — Individual source files
- `chunks` — Text chunks for search
- `items` — Extracted knowledge items
- `entities` — Named entities
- `runs` — Background job tracking

### File Storage

**Project Knowledge:**
- `30_Projects/<name>/items.json` — Extracted knowledge items

**Agent Data:**
- `<agent>/AGENT.md` — Configuration
- `<agent>/MEMORY.md` — Persistent memory
- `<agent>/sessions/*.md` — Transcripts

### Extraction Item Types

| Type | Description | Pattern Examples |
|------|-------------|------------------|
| **entity** | Named concepts, people, tools | Capitalized multi-word phrases |
| **claim** | Factual statements | `CLAIM:`, `FACT:`, `NOTE:` |
| **task** | Action items | `TODO:`, `TASK:`, `- [ ]` |
| **decision** | Decisions made | `DECISION:`, `DECIDED:` |
| **note** | General notes | Markdown headers (`#`, `##`) |

---

## Environment Configuration

### Required Variables

```env
BRAIN_VAULT_PATH=/path/to/vault       # Obsidian vault location
ANTHROPIC_API_KEY=sk-ant-...          # For LLM features
```

### Optional Variables

```env
BRAIN_DB_PATH=./brain.db              # Database location
BRAIN_PORT=3001                       # API server port
LOG_LEVEL=info                        # Logging verbosity
```

---

## Summary

The Brain system provides:

✅ **Project Management** with agents, sources, and knowledge
✅ **File Upload** with drag-and-drop and progress tracking
✅ **Knowledge Extraction** for entities, claims, tasks, decisions
✅ **Full-Text Search** across all indexed content
✅ **AI Chat** with project-scoped agents
✅ **Persistent Memory** across agent sessions
✅ **CLI Tools** for indexing, extraction, synthesis, export
✅ **REST API** for all operations
✅ **Real-time Events** via WebSocket
