---
type: documentation
category: architecture
created: 2026-02-01
updated: 2026-02-01
---

# Wilco OS Architecture

> System design and data flow for the Wilco OS knowledge management system.

## Overview

Wilco OS is a **layered intelligence system** built on local-first principles. Each layer has specific responsibilities and strict rules about data flow.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INPUTS                                      │
│  ChatGPT │ Claude │ Files │ Folders │ Manual Notes │ Inbox              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         1. SOURCE LAKE                                   │
│                           (Immutable)                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Raw Storage │  │  Manifest   │  │   Parsing   │  │  Normalize  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         2. INDEX LAYER                                   │
│                      (SQLite + FTS5)                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Chunker   │  │    FTS5     │  │   Sources   │  │   Metadata  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      3. EXTRACTION PIPELINE                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ LLM Extract │  │   Schema    │  │   Items     │  │  Entities   │    │
│  │   Skills    │  │  Validation │  │   Store     │  │   Notes     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       4. KNOWLEDGE LAYER                                 │
│                    (Obsidian Vault)                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Concepts   │  │  Projects   │  │    MOCs     │  │   Items     │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────┐  ┌───────────────────────────────────────┐
│      5. AGENT LAYER           │  │        6. OUTPUT LAYER                │
│      (Multi-Agent System)     │  │    (Context Packs, Exports)           │
│  ┌─────────────────────────┐  │  │  ┌─────────────┐  ┌─────────────┐    │
│  │ Admin Agent (Wilco)     │  │  │  │Context Pack │  │   Synth     │    │
│  │ Project Agents          │  │  │  │   Export    │  │  Reports    │    │
│  │ Skill Agents            │  │  │  └─────────────┘  └─────────────┘    │
│  └─────────────────────────┘  │  └───────────────────────────────────────┘
└───────────────────────────────┘
```

---

## Layer Details

### 1. Source Lake

**Purpose:** Store raw, immutable inputs as the source of truth.

**Characteristics:**
- **Immutable** — Once stored, sources are never modified
- **Fingerprinted** — SHA256 hash for deduplication
- **Manifest-tracked** — Every collection has a manifest.json

**Location:** `70_Sources/`

**Storage Structure:**
```
70_Sources/
├── ChatGPT/
│   ├── raw/           # Original exports
│   ├── parsed/        # Normalized JSONL
│   └── md/            # Per-conversation markdown
├── Claude/
│   ├── raw/
│   ├── parsed/
│   └── md/
└── Files/
    └── <collection-id>/
        ├── manifest.json
        ├── raw/
        └── extracted/
```

### 2. Index Layer

**Purpose:** Enable fast, scoped search across all content.

**Components:**
- **SQLite** — `brain.db` in `40_Brain/`
- **FTS5** — Full-text search with ranking
- **Chunker** — 800-1500 char chunks with line mapping

**Schema:**
```sql
-- Sources table
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  collection TEXT,
  hash TEXT NOT NULL,
  indexed_at TEXT,
  metadata JSON
);

-- Chunks table with FTS
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  source_id,
  start_line,
  end_line
);

-- Items table
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT,
  source_id TEXT,
  created_at TEXT,
  metadata JSON
);

-- Entities table
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  aliases JSON,
  note_path TEXT
);
```

### 3. Extraction Pipeline

**Purpose:** Convert unstructured content into structured knowledge.

**Process:**
1. **Chunk Selection** — Retrieve relevant chunks for extraction
2. **LLM Extraction** — Run extraction prompt with schema
3. **Schema Validation** — Zod validates output
4. **Idempotent Write** — Hash-based IDs prevent duplicates

**Extraction Types:**
| Type | Description |
|------|-------------|
| `decision` | A choice that was made |
| `task` | An actionable item |
| `fact` | A verified piece of information |
| `insight` | A derived understanding |
| `question` | An open question |
| `claim` | An unverified assertion |

### 4. Knowledge Layer

**Purpose:** Human-readable knowledge graph in Obsidian.

**Structure (LYT-compatible):**
```
/Vault
  /00_Inbox           # Capture
  /01_Daily           # Daily notes
  /10_MOCs            # Maps of Content
  /20_Concepts        # Entity notes
  /30_Projects        # Project folders
  /40_Brain           # System docs + code
  /70_Sources         # Raw imports
  /80_Resources       # Reference material
  /95_Templates       # Note templates
  /99_Archive         # Archived content
```

### 5. Agent Layer

**Purpose:** Multi-agent system for intelligent assistance.

**Agent Types:**

| Type | Scope | Memory | Communication |
|------|-------|--------|---------------|
| Admin | Full vault | Persistent | Can reach all agents |
| Project | Project folder | Persistent | Can request skills |
| Skill | Task-based | Stateless | Receives context, returns result |

**Agent Communication Protocol:**
```json
{
  "from": "agent_admin_wilco",
  "to": "agent_skill_seo",
  "type": "request",
  "payload": {
    "action": "analyze",
    "content": "...",
    "options": {}
  },
  "timestamp": "2026-02-01T14:00:00Z"
}
```

### 6. Output Layer

**Purpose:** Generate useful artifacts from the knowledge base.

**Outputs:**
| Type | Description | Trigger |
|------|-------------|---------|
| Context Pack | Curated notes for code repos | On-demand |
| Weekly Synth | Status updates, hot/warm | Weekly |
| Project Brief | Project summary | On-demand |
| Entity Profile | Entity overview with citations | On-demand |

---

## Data Flow Examples

### Ingestion Flow

```
1. User runs: brain ingest chatgpt --input export.zip
2. ZIP extracted to 70_Sources/ChatGPT/raw/
3. Conversations parsed to JSONL in parsed/
4. Per-conversation MD generated in md/
5. Sources registered in brain.db
6. User runs: brain index
7. Content chunked with line numbers
8. Chunks indexed in FTS5
```

### Retrieval Flow

```
1. User runs: brain search "redirect setup" --scope path:30_Projects/Brain
2. Scope parsed: path glob filter
3. FTS5 query executed
4. Results filtered by scope
5. Snippets extracted with citations
6. Context bundle returned:
   - File paths
   - Relevant snippets
   - Line number citations
```

### Agent Interaction Flow

```
1. User: @Wilco help me optimize this content
2. Admin Agent receives message
3. Admin identifies SEO skill needed
4. Admin sends request to agent_skill_seo
5. SEO agent analyzes content
6. SEO agent returns recommendations
7. Admin aggregates and presents to user
```

---

## CLI Architecture

```
brain
├── init          # Initialize vault
├── ingest        # Import sources
│   ├── chatgpt
│   ├── claude
│   └── folder
├── index         # Build search index
├── search        # Query knowledge base
├── extract       # Run extraction pipeline
├── synth         # Synthesis operations
│   └── weekly
├── export        # Export operations
│   └── context-pack
└── agent         # Agent operations
    ├── list
    ├── status
    ├── chat
    ├── send
    ├── create
    └── refresh
```

---

## Security Model

1. **Local-first** — All data stays on local machine
2. **API key isolation** — Keys in .env, never in vault
3. **Agent scope enforcement** — Agents cannot access outside their scope
4. **Audit trail** — All operations logged
5. **Idempotency** — Operations are safe to rerun

---

## Invariants

These rules must **NEVER** be violated:

1. Sources are **never** modified after storage
2. Every extracted item **must** link to source evidence
3. Agent scopes are **strictly** enforced
4. Session transcripts are **append-only**
5. CONTEXT.md is **regenerated**, never manually edited
6. Hash-based IDs ensure **idempotency**

---

## Related Documentation

- [[40_Brain/.agent/prd/core|PRD]]
- [[40_Brain/.agent/tasks/tasks|Task Queue]]
- [[40_Brain/agents/admin/AGENT|Admin Agent]]
- [[40_Brain/agents/skills/Skills MOC|Skill Agents]]
