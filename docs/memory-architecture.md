---
type: specification
category: architecture
created: 2026-02-05
updated: 2026-02-05
status: canonical
---

# Memory Architecture

> Defines memory types, storage formats, access patterns, and lifecycle rules for the Brain agent system.

---

## Overview

Memory in the Brain system serves three purposes:
1. **Persistence** — Knowledge survives context resets
2. **Retrieval** — Agents can recall relevant information
3. **Auditability** — All memory changes are traceable

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MEMORY ARCHITECTURE                           │
│                                                                      │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │
│   │   WORKING   │   │  EPISODIC   │   │  LONG-TERM  │              │
│   │   MEMORY    │   │   MEMORY    │   │   MEMORY    │              │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘              │
│          │                 │                 │                       │
│          ▼                 ▼                 ▼                       │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │
│   │  In-context │   │   Session   │   │  MEMORY.md  │              │
│   │   (tokens)  │   │   (.jsonl)  │   │  items.json │              │
│   └─────────────┘   └─────────────┘   └─────────────┘              │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                      TASK MEMORY                             │   │
│   │                    (tasks.json)                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Memory Types

### 1. Working Memory (In-Context)

**What**: The current context window sent to the LLM.

**Characteristics**:
- Volatile — Lost on context reset
- Token-limited — Bounded by model context window
- Fast — Immediate access

**Contents**:
- System prompt
- Conversation history
- Tool call results
- Injected memory snippets

**Storage**: None (runtime only)

**Lifecycle**:
- Created: Loop starts
- Updated: Each message/tool result
- Destroyed: Loop ends or compaction

---

### 2. Episodic Memory (Session Transcripts)

**What**: Complete record of agent-user interactions.

**Characteristics**:
- Append-only — Never modified (except compaction)
- Per-session — One file per conversation
- Auditable — Full history preserved

**Contents**:
- User messages
- Assistant responses
- Tool calls and results
- Timestamps
- Compaction summaries

**Storage**: `<agent>/sessions/<sessionId>.jsonl`

**Format**:
```jsonl
{"id":"msg_001","role":"user","content":"Hello","timestamp":"2026-02-05T10:00:00Z"}
{"id":"msg_002","role":"assistant","content":"Hi there!","timestamp":"2026-02-05T10:00:01Z"}
{"id":"tool_001","role":"tool_call","name":"read","input":{"path":"README.md"},"timestamp":"2026-02-05T10:00:02Z"}
{"id":"tool_001","role":"tool_result","content":"# Project...","timestamp":"2026-02-05T10:00:03Z"}
```

**Lifecycle**:
- Created: First message in session
- Updated: After each loop PERSIST stage
- Compacted: When context threshold crossed
- Archived: On session expiry (configurable)

---

### 3. Long-Term Memory (Persistent Knowledge)

**What**: Curated facts, decisions, and context that persist across sessions.

**Characteristics**:
- Human-readable — Markdown format
- Searchable — Indexed for retrieval
- Editable — Agent and human can modify

**Storage**: `<agent>/MEMORY.md`

**Format**:
```markdown
# Agent Memory

## Key Decisions
- 2026-02-01: Chose SQLite over PostgreSQL for local-first architecture
- 2026-02-03: API uses Fastify, not Express

## User Preferences
- Prefers concise responses
- Uses VSCode as primary editor

## Project Context
- Brain system version: 0.1.0
- Main languages: TypeScript, React

## Session Summaries
### 2026-02-05
- Discussed agent loop implementation
- Decided on 4-stage loop: INTAKE → CONTEXT → EXECUTE → PERSIST
```

**Lifecycle**:
- Created: Agent creation
- Updated: Agent writes during loop, or memory flush
- Pruned: Manual or scheduled cleanup

---

### 4. Extracted Knowledge (items.json)

**What**: Structured knowledge extracted from project files.

**Characteristics**:
- Typed — Entities, claims, tasks, decisions, notes
- Cited — Links to source file and line
- Queryable — Filter by type, search by content

**Storage**: `<project>/items.json`

**Format**:
```json
[
  {
    "id": "item_abc123",
    "type": "decision",
    "title": "Use Fastify for API",
    "content": "We chose Fastify over Express for better TypeScript support and performance.",
    "sourceFile": "docs/Architecture.md",
    "lineNumber": 45,
    "confidence": 0.9,
    "extractedAt": "2026-02-05T10:00:00Z"
  }
]
```

**Lifecycle**:
- Created: Extraction triggered
- Updated: Re-extraction overwrites
- Deleted: Manual cleanup

---

### 5. Task Memory (tasks.json)

**What**: Current execution state and pending work.

**Characteristics**:
- Structured — JSON with defined schema
- Prioritized — Tasks ordered by priority
- Stateful — Tracks completion

**Storage**: `40_Brain/.agent/tasks/tasks.json`

**Format**:
```json
{
  "tasks": [
    {
      "id": "TASK-001",
      "milestone": "M1",
      "priority": 1,
      "status": "pending",
      "description": "Implement session locking",
      "acceptance_criteria": ["Lock acquired before execution", "Lock released after"],
      "created": "2026-02-05",
      "completed": null,
      "blocked_by": []
    }
  ]
}
```

**Lifecycle**:
- Created: Task planning
- Updated: Status changes
- Archived: After milestone completion

---

## Storage Justification

| Memory Type | Format | Why |
|-------------|--------|-----|
| Working | Runtime | Speed, no persistence needed |
| Episodic | JSONL | Append-only, streaming writes, line-by-line parsing |
| Long-term | Markdown | Human-readable, Obsidian-native, easy editing |
| Extracted | JSON | Structured queries, type safety, API-friendly |
| Tasks | JSON | Structured, tooling support, status tracking |

### Why Not a Database for Everything?

- **Local-first principle**: Files work offline, sync naturally
- **Human-readable**: Users can read/edit without tools
- **Obsidian integration**: Markdown is native format
- **Simplicity**: No migrations, no schema management

### When to Use SQLite

SQLite (`brain.db`) is used for:
- Full-text search indexes (FTS5)
- Source metadata and deduplication
- Chunk storage for large content
- Future: Vector embeddings

---

## Read/Write Rules

### Reading Memory

| Memory Type | When Loaded | How |
|-------------|-------------|-----|
| Working | Always in context | Direct access |
| Episodic | Loop CONTEXT stage | Read session JSONL |
| Long-term | Loop CONTEXT stage | Read MEMORY.md, inject into prompt |
| Extracted | On query | API call to `/projects/:id/knowledge` |
| Tasks | Loop start | Read tasks.json |

### Writing Memory

| Memory Type | When Written | By Whom |
|-------------|--------------|---------|
| Working | Never | N/A |
| Episodic | Loop PERSIST stage | Agent loop |
| Long-term | Tool call or memory flush | Agent via `write` tool |
| Extracted | Extraction triggered | Extraction pipeline |
| Tasks | Task status change | Agent or human |

### Write Rules

1. **Episodic memory is append-only** — Never delete lines (except compaction)
2. **Long-term memory is agent-writable** — Agent can call `write` tool
3. **Extracted knowledge is pipeline-only** — Only extraction pipeline writes
4. **Tasks require explicit update** — Status changes must be deliberate

---

## Update & Pruning Strategy

### Episodic Memory Pruning

**In-memory pruning** (does not modify transcript):
- Remove tool results older than N messages
- Keep tool calls for context
- Applied during CONTEXT stage

**Compaction** (modifies transcript):
- Summarize old messages into single entry
- Keep recent N messages intact
- Triggered by token threshold

```
Before compaction:
[msg1, msg2, msg3, msg4, msg5, msg6, msg7, msg8, msg9, msg10]

After compaction:
[summary_of_1_to_7, msg8, msg9, msg10]
```

### Long-Term Memory Pruning

Manual or scheduled:
1. Agent reviews MEMORY.md
2. Removes outdated entries
3. Consolidates related facts

Automated (future):
- Staleness detection based on last-referenced date
- Relevance scoring against recent conversations
- Prompt agent to prune low-value entries

### Extracted Knowledge Pruning

- Re-extraction replaces previous items
- Items from deleted sources auto-expire (future)
- Manual cleanup via UI

---

## Cross-Agent Memory Access

### Scope Rules

| Agent Type | Can Read | Can Write |
|------------|----------|-----------|
| Admin | All memory | All memory |
| Project | Own + Admin memory | Own memory only |
| Skill | Context passed to it | None (stateless) |

### Memory Sharing Protocol

When Admin spawns a Skill agent:
```json
{
  "from": "agent_admin_wilco",
  "to": "agent_skill_seo",
  "type": "request",
  "payload": {
    "action": "analyze",
    "context": {
      "memory_snippet": "User prefers concise responses...",
      "project_context": "SEO optimization for blog..."
    }
  }
}
```

Skill agents receive context but cannot:
- Read MEMORY.md directly
- Write to any persistent memory
- Access session transcripts

---

## Memory Search

### Current: FTS5 (Keyword)

```sql
SELECT * FROM chunks_fts 
WHERE chunks_fts MATCH 'agent loop implementation'
ORDER BY rank;
```

### Future: Hybrid Search

Combine vector similarity with keyword matching:

```
finalScore = vectorWeight * cosineSimilarity(query, chunk)
           + textWeight * bm25Score(query, chunk)
```

### Search Scope

| Scope | What's Searched |
|-------|-----------------|
| `memory` | MEMORY.md content |
| `items` | Extracted knowledge items |
| `sessions` | Session transcripts (opt-in) |
| `sources` | Indexed source files |

---

## Memory Events

The system MUST emit:

| Event | When | Payload |
|-------|------|---------|
| `memory:read` | Memory loaded | `{ type, path, size }` |
| `memory:write` | Memory written | `{ type, path, delta }` |
| `memory:flush` | Pre-compaction flush | `{ sessionId }` |
| `memory:compact` | Compaction complete | `{ sessionId, before, after }` |
| `memory:search` | Search executed | `{ query, results }` |

---

## Configuration

```typescript
interface MemoryConfig {
  // Long-term memory
  memoryPath: string;           // Default: "<agent>/MEMORY.md"
  maxMemorySize: number;        // Max chars (default: 50000)
  
  // Session memory
  sessionsPath: string;         // Default: "<agent>/sessions/"
  sessionRetentionDays: number; // Auto-archive after (default: 30)
  
  // Compaction
  compactionThreshold: number;  // Tokens before compact (default: 100000)
  compactionKeepRecent: number; // Messages to keep (default: 10)
  
  // Memory flush
  flushEnabled: boolean;        // Enable pre-compaction flush (default: true)
  flushThreshold: number;       // Tokens before flush (default: 80000)
  
  // Search
  searchProvider: string;       // "fts5" | "hybrid" (default: "fts5")
  vectorModel: string;          // Embedding model (default: null)
  
  // Pruning
  toolResultRetention: number;  // Keep last N tool results (default: 5)
}
```

---

## File Layout

```
<agent>/
├── AGENT.md              # Agent definition
├── MEMORY.md             # Long-term memory
├── sessions/
│   ├── sessions.json     # Session index
│   ├── <sessionId>.jsonl # Session transcript
│   └── ...
└── context/              # Future: cached context

<project>/
├── items.json            # Extracted knowledge
├── agent/                # Project agent (if exists)
│   ├── AGENT.md
│   ├── MEMORY.md
│   └── sessions/
└── ...

40_Brain/
├── .agent/
│   ├── tasks/
│   │   └── tasks.json    # Task memory
│   └── ...
└── brain.db              # SQLite (FTS5, metadata)
```

---

## Invariants

1. **Episodic memory is append-only** — Except during compaction
2. **All writes are logged** — Memory events emitted
3. **Scope is enforced** — Agents cannot read/write outside scope
4. **Human-readable first** — Markdown preferred over binary
5. **Searchable** — All memory indexed for retrieval
6. **Timestamped** — All entries have creation time

---

## Implementation Checklist

- [ ] MEMORY.md read/write in CONTEXT stage
- [ ] Session JSONL append in PERSIST stage
- [ ] Tool result pruning in CONTEXT stage
- [ ] Compaction flow implementation
- [ ] Memory flush before compaction
- [ ] FTS5 indexing of memory
- [ ] Memory search API endpoint
- [ ] Cross-agent memory protocol
- [ ] Memory events emission
- [ ] Session retention/archival

---

## Related Documents

- [[agent-loop]] — Loop stages that use memory
- [[system-comparison-openclaw]] — OpenClaw memory patterns
- [[Architecture]] — Overall system design
