---
type: prd
version: 1.0.0
created: 2026-02-01
updated: 2026-02-01
status: active
---

# Wilco OS — Product Requirements Document

> A local-first agentic PKM system with multi-agent architecture

---

## Executive Summary

**Wilco OS** is a local-first Personal Knowledge Management system built around an Obsidian vault. It ingests raw sources, extracts durable knowledge, maintains structured memory, and supports scoped retrieval and brainstorming within specific projects or contexts.

The system features a **multi-agent architecture** with:
- **Admin Agent** — System-wide orchestrator with full awareness
- **Project Agents** — Scoped to specific projects with persistent memory
- **Skill Agents** — Specialized capabilities (SEO, Writing, Brainstorming, etc.)

---

## 1. Vision & Objectives

### Primary Outcome

A local system that:
1. **Ingests** raw sources into a Source Lake
2. **Extracts** entities, tasks, decisions, claims/facts, summaries, relationships
3. **Writes** structured outputs into Obsidian vault as Markdown + JSON
4. **Retrieves** with scoped context ("only within this folder/MOC/project")
5. **Orchestrates** multiple specialized agents that communicate and collaborate
6. **Exposes** CLI + optional web UI for all operations

### Non-Negotiables

| Principle | Description |
|-----------|-------------|
| **Local-first** | No required cloud DB; runs entirely on local machine |
| **Plain files** | Markdown/JSON as source of truth; git-friendly |
| **Deterministic** | Re-runnable, idempotent pipelines |
| **Auditable** | Every extracted item points to source + line offsets |
| **Scoped cognition** | Load only relevant notes; don't blow LLM context |
| **Composable** | Projects can import KB subsets via "context packs" |
| **Agent isolation** | Each agent has its own scope, memory, and permissions |

---

## 2. Agent Architecture

### 2.1 Admin Agent (Wilco)

The **Admin Agent** is the system-wide orchestrator with full awareness of the entire knowledge base and all other agents.

**Responsibilities:**
- Understands the complete system architecture
- Coordinates work between agents
- Maintains system-wide documentation
- Can spawn, manage, and communicate with all other agents
- Helps build new features for the entire system

**Scope:** Entire vault + all agent configurations

**Location:** `40_Brain/agents/admin/`

### 2.2 Project Agents

**Project Agents** are scoped to specific project folders and maintain persistent memory within that project.

**Responsibilities:**
- Maintain awareness of project-specific context
- Remember decisions, progress, and state across sessions
- Only access files within their project scope
- Help with project-specific tasks

**Scope:** `30_Projects/<project>/**`

**Location:** `30_Projects/<project>/agent/`

### 2.3 Skill Agents

**Skill Agents** provide specialized capabilities that can be invoked by any other agent or directly by the user.

**Types:**
- **SEO Agent** — Search optimization, keyword research, content analysis
- **Writer Agent** — Content creation, editing, tone adjustment
- **Brainstorm Agent** — Ideation, creative exploration, mind mapping
- **Organizer Agent** — Structure, categorization, cleanup
- **Researcher Agent** — Deep research, fact-checking, source gathering
- **Synthesizer Agent** — Summarization, pattern recognition, insight generation

**Scope:** Task-based (receives context, returns result)

**Location:** `40_Brain/agents/skills/<skill>/`

---

## 3. Information Architecture

### Vault Structure

```
Wilco OS/                          # Obsidian Vault Root
├── 00_Inbox/                      # Quick capture
├── 01_Daily/                      # Daily notes
├── 10_MOCs/                       # Maps of Content (index notes)
├── 20_Concepts/                   # Entity notes (topics, concepts)
├── 30_Projects/                   # Project folders
│   └── <project>/
│       ├── agent/                 # Project agent
│       │   ├── AGENT.md
│       │   ├── CONTEXT.md
│       │   ├── MEMORY.md
│       │   └── sessions/
│       ├── items.json
│       └── ...
├── 40_Brain/                      # Brain's own docs
│   ├── .agent/                    # Agent control layer (Invariant)
│   │   ├── prd/                   # Product requirements
│   │   ├── tasks/                 # Task queue
│   │   └── workflows/             # Reusable procedures
│   ├── agents/                    # Agent definitions
│   │   ├── admin/                 # Admin agent
│   │   └── skills/                # Skill agents
│   ├── docs/                      # System documentation
│   └── src/                       # Source code (brain CLI)
├── 70_Sources/                    # Immutable raw imports
│   ├── ChatGPT/
│   ├── Claude/
│   └── Files/
├── 80_Resources/
├── 95_Templates/
└── 99_Archive/
```

---

## 4. Data Model

### 4.1 Canonical IDs

| Type | Format | Example |
|------|--------|---------|
| Source doc | `src_<hash>` | `src_a7b3c9` |
| Extracted item | `itm_<hash>` | `itm_f2e8d1` |
| Entity | `ent_<slug>_<hash>` | `ent_redirects_x4k2` |
| Agent | `agent_<type>_<name>` | `agent_skill_seo` |

### 4.2 Agent Definition Schema

```yaml
---
name: string                    # Agent display name
id: string                      # Unique agent ID
type: admin | project | skill   # Agent type
scope: string                   # Path glob or scope definition
model: string                   # LLM model to use
created: date
---
```

### 4.3 Extracted Item Schema

```json
{
  "id": "itm_...",
  "type": "decision|task|fact|insight|question|claim",
  "title": "...",
  "body": "...",
  "status": "active|superseded|done|open",
  "timestamp": "2026-01-31",
  "entities": ["ent_..."],
  "source": {
    "sourceId": "src_...",
    "path": "...",
    "anchors": [{"startLine": 120, "endLine": 168}]
  },
  "confidence": 0.78,
  "tags": ["..."]
}
```

---

## 5. Functional Requirements

### 5.1 Ingestion

| Source | Input | Output |
|--------|-------|--------|
| ChatGPT | zip/json export | raw → JSONL → per-convo MD |
| Claude | export | raw → JSONL → per-convo MD |
| Files/folders | directory path | manifest + fingerprinted files + text extraction |

### 5.2 Indexing

- SQLite DB `brain.db` with tables: `sources`, `chunks`, `items`, `entities`, `links`, `agents`
- FTS5 full-text search on chunk content
- Chunking: 800–1500 chars with overlap, line numbers preserved

### 5.3 Retrieval (Scoped)

| Scope Type | Example |
|------------|---------|
| Folder | `path:30_Projects/Brain/**` |
| Tag | `tag:moneta` |
| MOC | `moc:10_MOCs/Brain.md` |
| Agent | `agent:skill_seo` |

### 5.4 Extraction (LLM-assisted)

- Produces: summaries, tasks, decisions, entities, suggested links
- Writes: source MD headers, items.json, entity notes
- Idempotent via hash-based IDs

### 5.5 Agent Communication

Agents communicate via a message protocol:

```json
{
  "from": "agent_admin_wilco",
  "to": "agent_skill_seo",
  "type": "request|response|notify",
  "payload": { ... },
  "context": { ... },
  "timestamp": "..."
}
```

### 5.6 Synthesis

- **Daily**: append log entry from ingestions/extractions
- **Weekly**: update hot/warm sections, project status snapshots

### 5.7 Context Pack Export

- Input: scope + target repo path
- Output: `context-pack/` with README, selected notes, snippets with citations

---

## 6. CLI Specification

```bash
# Core commands
brain init --vault /path/to/vault
brain ingest chatgpt --input /path/export.zip
brain ingest folder --input /path/projects --collection oldprojects
brain index --scope all|collection:<id>|path:<glob>
brain extract --collection chatgpt --limit 50
brain search "query" --scope path:30_Projects/Brain
brain synth weekly
brain export context-pack --scope moc:10_MOCs/Brain.md --to /path/repo

# Agent commands
brain agent list
brain agent status <agent-id>
brain agent chat <agent-id>
brain agent send <agent-id> "message"
brain agent spawn --type skill --name seo
brain agent create --type project --project brain

# Admin commands
brain admin status
brain admin docs update
```

---

## 7. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Index 10k notes comfortably; incremental reindex by file hash |
| **Reliability** | All actions logged; crash-safe transactions; dry-run mode |
| **Privacy** | Local storage only; API keys in .env (never in vault) |
| **Explainability** | Every item links to source + line range |

---

## 8. Acceptance Criteria (V1)

| # | Criterion |
|---|-----------|
| 1 | ChatGPT export → raw stored + JSONL + per-convo MD |
| 2 | `brain search` returns relevant snippets with file+line citations |
| 3 | Extraction creates items.json entries + entity notes |
| 4 | Scoped retrieval (`--scope path:`) never returns outside-path snippets |
| 5 | `brain export context-pack` produces folder with curated notes + README |
| 6 | Rerunning extraction is idempotent (no duplicate items) |
| 7 | Admin agent can list and communicate with all other agents |
| 8 | Project agents maintain memory across sessions |
| 9 | Skill agents can be invoked by name and return structured results |

---

## 9. Scope Definition

### V1 (Must Ship)

- Vault skeleton + schemas
- ChatGPT/Claude ingest
- Folder dump ingest → Source Collection
- Full-text indexing (SQLite FTS5)
- Scoped search with citations
- LLM extraction (tasks/decisions/entities/summaries)
- Idempotent note creation/update
- CLI commands
- Config system + logging
- **Admin Agent** (basic)
- **Project Agents** (basic)

### V2 (Strongly Recommended)

- Vector embeddings + hybrid rerank
- Obsidian plugin
- File watcher (incremental re-index)
- Memory decay (hot/warm/cold)
- **Skill Agents** (full suite)
- **Agent-to-agent communication**
- Web UI

### Out of Scope

- Cloud sync / multi-device conflict resolution
- Always-on daemon without explicit run
- Autonomous task execution across external apps

---

## 10. Invariants

These rules must NEVER be violated:

1. **Evidence is never modified** after storage
2. **Every extracted item must link** to source evidence
3. **Agent scopes are enforced** — agents cannot access outside their scope
4. **Session transcripts are append-only**
5. **MEMORY.md changes are versioned** (git-trackable)
6. **CONTEXT.md is regenerated**, never manually edited
7. **Idempotency** — reruns produce same results without duplicates
8. **Local-first** — no required external services

---

## 11. Frontend — Command Center UI

### 11.1 Vision

A desktop-first **Command Center** that orchestrates knowledge, sources, projects, tasks, and agent runs — while keeping the Obsidian vault and SQLite index as the source of truth.

### 11.2 Principles (Hard Requirements)

| Principle | Description |
|-----------|-------------|
| **Context-first** | Current scope always visible (path/MOC/tags) |
| **Keyboard-driven** | Cmd+K universal command palette, quick switch scopes |
| **Local-first** | Runs without internet except LLM calls |
| **Deterministic** | UI reflects brain DB + filesystem state, not its own truth |
| **Artifact-driven** | Every agent output is an artifact with provenance |

### 11.3 Core Objects

#### Project
```typescript
interface Project {
  id: string;
  name: string;
  emoji: string;
  description: string;
  rootPath: string;
  status: 'active' | 'archived' | 'paused';
  linkedScopes: string[];      // paths, MOCs, tags
  agentIds: string[];          // project agent + optional skills
  createdAt: string;
  updatedAt: string;
}
```

#### Source Collection
```typescript
interface SourceCollection {
  id: string;
  type: 'chatgpt' | 'claude' | 'folder';
  status: 'pending' | 'processing' | 'ready' | 'error';
  counts: { conversations: number; messages: number; items: number };
  errors: string[];
  lastImportedAt: string;
}
```

#### Agent (UI Extended)
```typescript
interface AgentUI {
  id: string;
  name: string;
  type: 'admin' | 'project' | 'skill';
  scope: string[];
  status: 'idle' | 'running' | 'error';
  lastRun: string | null;
  lastError: string | null;
  configPath: string;          // AGENT.md
  memoryPath: string | null;   // MEMORY.md
}
```

#### Run (Execution)
```typescript
interface Run {
  runId: string;
  agentId: string;
  action: 'ingest' | 'index' | 'extract' | 'synth' | 'brainstorm' | 'write' | 'skill';
  status: 'queued' | 'running' | 'success' | 'fail';
  progress: number;            // 0-100
  logs: string[];
  artifacts: string[];         // artifact IDs produced
  startedAt: string;
  completedAt: string | null;
}
```

#### Artifact
```typescript
interface Artifact {
  id: string;
  type: 'markdown' | 'tasks' | 'mindmap' | 'report' | 'diff' | 'context-pack';
  createdBy: { agentId: string; runId: string };
  scopeRef: string;            // project/scope query
  storage: { filePath: string; snippetRefs?: string[] };
  renderHints: string;         // how to display on canvas
  createdAt: string;
}
```

### 11.4 Architecture

#### Backend (Local)
- Existing brain modules (ingest/index/retrieve/extract/synth/export)
- **Fastify** API server
- SQLite `brain.db`
- In-process event bus + WebSocket to UI
- Lightweight run manager (no external queue needed)

#### Frontend
- **React 18** + TypeScript
- **Zustand** (UI state) + **React Query** (API)
- **shadcn/ui** components
- **CodeMirror 6** for markdown editing
- **Monaco** for code panels
- **cmdk** command palette
- WebSocket subscription for real-time runs/agents

#### Desktop Shell
- Start as **web app** talking to local API (fast iteration)
- Wrap later in **Tauri** or Electron
- Single binary distribution

### 11.5 Feature Stages

#### Stage 1: Ops Console (Ship First)

Screens:
1. **Home** — Stats, recent activity, quick actions
2. **Sources** — Import wizard, collection view, run extraction
3. **Search** — Scoped search with preview, add to project
4. **Control Room** — Agents list, run logs, restart, config viewer

*Skip Workshop in Stage 1 — not needed for initial value.*

#### Stage 2: Workshop v1 (Artifact Canvas)
- Canvas renders artifacts
- Right panel: project agent chat + context summary
- Left panel: skill agent launcher
- Modes filter artifact types (Doc/Brainstorm/Tasks/Review)

#### Stage 3: Workshop v2 (Interactive)
- Mindmap editor (JSON artifact, export to Mermaid)
- Kanban board linked to `items.json` tasks

### 11.6 Screen Specifications

#### Home Dashboard
- Quick stats (sources, items, projects, agents)
- Recent activity timeline
- Agent status grid (🟢🟡🔴)
- Quick actions (Import, Search, New Project)

#### Sources
- Collections list with status badges
- Import wizard (drag/drop, progress, preview)
- Extraction preview before commit

#### Search
- Unified search bar (Cmd+K)
- Filters: source, project, date, type, tags
- Preview panel with context
- "Add to Project" action

#### Control Room
- Agent overview grid
- Agent detail: config, memory, sessions, logs
- Run history with status
- Restart/spawn actions

#### Projects
- Project grid/list view
- Project detail: overview, knowledge, agent, tasks
- Create project wizard (spawns agent)
- Link scopes/MOCs

#### Workshop (Stage 2+)
- Three-column layout: Skills | Canvas | Agent Chat
- Canvas modes: Document, Brainstorm, Tasks, Review
- Artifact history and versioning
- Context pack generation on enter

---

## 12. Project Workflow

### 12.1 Overview

A **Project** is a container for focused work with its own dedicated agent, scoped knowledge, and linked sources. The complete workflow enables users to:

1. **Create a project** with name, description, and emoji
2. **Auto-spawn a project agent** with dedicated AGENT.md and MEMORY.md
3. **Link source data** to the project scope
4. **Chat with the project agent** for context-aware assistance

### 12.2 Project Creation Flow

```
User clicks "New Project"
    ↓
Wizard: Name, emoji, description
    ↓
System creates:
  - 30_Projects/{name}/           # Project folder
  - 30_Projects/{name}/agent/     # Agent folder
  - 30_Projects/{name}/agent/AGENT.md
  - 30_Projects/{name}/agent/MEMORY.md
  - Database record in projects table
    ↓
Project detail page opens with chat interface
```

### 12.3 Project Agent Auto-Creation

When a project is created with `createAgent: true`:

1. Create folder: `30_Projects/{project_name}/agent/`
2. Generate `AGENT.md` with:
   - Name: `{Project Name} Agent`
   - ID: `agent_project_{slug}`
   - Type: `project`
   - Scope: `path:30_Projects/{project_name}/**`
3. Create empty `MEMORY.md` for persistent memory
4. Register agent ID in project's `agentIds` array

### 12.4 Source Linking

Projects can link sources to define their knowledge scope:

| Link Type | Example | Description |
|-----------|---------|-------------|
| Path | `path:30_Projects/Brain/**` | Files in folder |
| Tag | `tag:brain` | Notes with tag |
| MOC | `moc:10_MOCs/Brain.md` | Notes linked from MOC |
| Collection | `collection:chatgpt` | Imported source collection |

### 12.5 Project Chat Interface

The project detail page includes a chat panel for conversing with the project agent:

- Agent context loaded from `AGENT.md`
- Memory loaded from `MEMORY.md`
- Scoped search limited to project's `linkedScopes`
- Chat history persisted in `30_Projects/{name}/agent/sessions/`

### 12.6 API Endpoints (Project Workflow)

```
POST /projects                    # Create project (+ auto-create agent)
GET  /projects/:id/agent          # Get project's agent
POST /projects/:id/chat           # Send message to project agent
GET  /projects/:id/chat/history   # Get chat history
PUT  /projects/:id/sources        # Link sources to project
GET  /projects/:id/knowledge      # Search within project scope
```

### 12.7 Acceptance Criteria (Project Workflow)

| # | Criterion |
|---|-----------|
| 1 | Creating project with "Create Agent" creates agent folder + files |
| 2 | Project agent has correct scope limited to project folder |
| 3 | Sources can be linked to project via UI |
| 4 | Chat with project agent returns context-aware responses |
| 5 | Chat history persists across sessions |
| 6 | Project agent memory updates after each session |

---

## 13. Project Knowledge Management

### 13.1 Overview

Projects need robust knowledge management capabilities to ingest, process, and display information. This includes:

1. **File Upload via UI** — Upload files directly to project folder
2. **Extraction Pipeline** — Auto-extract insights from project sources
3. **Knowledge Display** — Show extracted items in the Knowledge tab

### 13.2 File Upload

Users can upload files directly to a project's folder via the UI:

- Drag-and-drop zone in project detail page
- File picker with multi-select support
- Upload progress indicator
- Files saved to `30_Projects/{project}/` folder
- Supported formats: `.md`, `.txt`, `.pdf`, `.json`, `.csv`

#### API Endpoint
```
POST /projects/:id/upload
Content-Type: multipart/form-data
Body: files[] (array of files)
Response: { uploaded: string[], failed: string[] }
```

### 13.3 Extraction Pipeline

Auto-extract knowledge items from project sources:

1. **Trigger**: Manual button or automatic on new file upload
2. **Process**: 
   - Scan all files in project scope (folder + linked sources)
   - Use LLM to extract entities, claims, tasks, decisions
   - Store in `items.json` within project folder
3. **Output**: Structured knowledge items with source citations

#### API Endpoint
```
POST /projects/:id/extract
Body: { force?: boolean }  # Re-extract even if already processed
Response: { itemsExtracted: number, sources: string[] }
```

### 13.4 Knowledge Items Display

The Knowledge tab shows extracted items from the project:

- List view with item type icons (entity, claim, task, decision)
- Filter by item type
- Search within items
- Click to view source citation
- Link to source document

#### API Endpoint
```
GET /projects/:id/knowledge
Query: { type?: string, q?: string, limit?: number, offset?: number }
Response: { items: KnowledgeItem[], total: number }
```

### 13.5 Acceptance Criteria (Knowledge Management)

| # | Criterion |
|---|-----------|
| 1 | Files can be uploaded via drag-drop or file picker |
| 2 | Uploaded files appear in project vault folder |
| 3 | Extraction can be triggered manually |
| 4 | Extracted items appear in Knowledge tab |
| 5 | Items can be filtered by type |
| 6 | Items link back to source document |

### 11.7 API Endpoints

```
GET  /health
GET  /projects           POST /projects
GET  /projects/:id       PUT  /projects/:id
GET  /sources            POST /sources/import
GET  /sources/:id
GET  /search?q=&scope=
GET  /agents             POST /agents/spawn
GET  /agents/:id         PUT  /agents/:id/restart
GET  /runs               POST /runs
GET  /runs/:id
GET  /artifacts
GET  /artifacts/:id
WS   /events             # Real-time run/agent updates
```

### 11.8 Frontend Milestones

| Milestone | Focus | Est. Days |
|-----------|-------|-----------|
| **M13** | API Layer | 3-5 |
| **M14** | UI Shell + Layout + Cmd Palette | 2-3 |
| **M15** | Home Dashboard | 1-2 |
| **M16** | Sources + Import Wizard | 3-5 |
| **M17** | Search Interface | 2-3 |
| **M18** | Control Room | 3-5 |
| **M19** | Projects View | 3-5 |
| **M20** | Workshop v1 | 5-8 |
| **M21** | Settings + Polish | 2-4 |

---

## Related Documents

- [[40_Brain/.agent/tasks/tasks|Task Queue]]
- [[40_Brain/.agent/workflows/test|Test Workflow]]
- [[40_Brain/docs/Architecture|Architecture]]
- [[40_Brain/agents/admin/AGENT|Admin Agent]]
- [[40_Brain/agents/skills/Skills MOC|Skill Agents]]
