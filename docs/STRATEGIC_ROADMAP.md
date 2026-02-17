---
type: strategy
category: architecture
created: 2026-02-17
updated: 2026-02-17
status: active
---

# Wilco OS Brain — Strategic Roadmap & Gap Analysis

> Deep review of what's built, what's missing, and a refined path forward — informed by Spacebot, OpenClaw, and emerging multi-agent patterns.

---

## 1. What We've Built (Inventory)

### 1.1 Completed Milestones (tasks_vNext.json)

| Milestone | Tasks | Status | Key Files |
|-----------|-------|--------|-----------|
| **M1: Deterministic Loop** | TASK-100 → 107 | ✅ All complete | `agent/loop/`, `session-lock.ts`, `tokens.ts` |
| **M2: Memory System** | TASK-200 → 205 | ✅ All complete | `compaction.ts`, `memory-flush.ts`, `context-guard.ts`, `memory.ts` |
| **M3: Multi-Agent** | TASK-300 → 303 | ✅ All complete | `protocol.ts`, `subagent.ts`, `scope.ts`, `messaging.ts`, `coordination.ts` |
| **M4: Autonomy** | TASK-400 → 403 | ✅ All complete | `scheduler.ts`, `triggers.ts`, `retry.ts`, `AutonomyPage.tsx` |
| **M5: Vector Search** | TASK-500 | ✅ Complete | `search/vector.ts`, `search/hybrid.ts` |

### 1.2 Backend Modules (src/src/)

```
agent/          → 55 files (loop, memory, scope, scheduler, triggers, retry, subagent, etc.)
search/         → FTS5, vector, hybrid, context search
server/         → Fastify routes (agents, projects, sources, search, runs, events)
cli/            → Commands (init, ingest, index, search, extract, synth, export, agent)
extract/        → LLM extraction pipeline with validation
ingest/         → ChatGPT zip/JSONL import
collection/     → Manifest tracking, incremental indexing
db/             → SQLite connection + schema
llm/            → Claude provider abstraction
synth/          → Changelog, recency, status synthesis
export/         → Context packs, citations, markdown
```

### 1.3 Frontend (React + Vite + Tailwind)

```
pages/          → Dashboard, Projects, Agents, Sources, Autonomy
components/     → Dashboard, ControlRoom, Search, Projects, Workshop, Import, Settings, Layout
hooks/          → useAgents, useProjects, useWebSocket, useActivity, etc.
stores/         → appStore, eventsStore (Zustand)
```

### 1.4 Documentation

```
docs/Architecture.md         → Layer diagram, data flow, security model
docs/PRD_vNext.md            → v2 autonomy requirements
docs/memory-architecture.md  → 5 memory types, storage formats, lifecycle
docs/agent-loop.md           → 4-stage loop specification (INTAKE→CONTEXT→EXECUTE→PERSIST)
docs/system-comparison-openclaw.md → Adoption decisions
docs/CAPABILITIES.md         → Complete feature guide
docs/FUTURE_FEATURES.md      → Brainstormed features with priority matrix
docs/TESTING_GUIDE.md        → Comprehensive test procedures
```

---

## 2. Gap Analysis: What's Built vs What's Needed

### 2.1 Critical Gaps (Blocking Real Usage)

| Gap | Impact | Current State | What's Needed |
|-----|--------|---------------|---------------|
| **No real LLM integration** | Agent loop exists but can't run | Mock providers, no actual API calls | Wire Claude/OpenAI into `execute.ts`, handle streaming |
| **No real embedding provider** | Vector search uses mock embeddings | `MockEmbeddingProvider` only | Integrate a real embedding model (local or API) |
| **No orchestrator agent** | Agents are siloed, no routing | Subagent spawn exists but no central router | Central orchestrator that routes between project agents |
| **Workshop is a shell** | UI components exist but no real interactions | Static components, mock data | Connect to backend API, enable real agent chat |
| **No file watcher** | Manual re-indexing only | `brain index` is CLI-only | `chokidar`-based watcher for auto-reindex on file changes |
| **Frontend ↔ Backend not wired** | UI shows mock data | API routes exist, UI has hooks | Connect React Query hooks to actual Fastify endpoints |

### 2.2 Architectural Gaps (Compared to Spacebot/OpenClaw)

| Pattern | Spacebot | OpenClaw | Brain | Gap |
|---------|----------|----------|-------|-----|
| **Process separation** | Channels/Branches/Workers (non-blocking) | Gateway + Pi agent (RPC) | Monolithic loop | Need: Separate "thinking" from "responding" |
| **Typed memory graph** | 8 types + graph edges + importance | Free-form MEMORY.md | Free-form MEMORY.md | Need: Structured memory with types and relations |
| **Memory recall** | Hybrid search via RRF (Reciprocal Rank Fusion) | Hybrid vector + BM25 | FTS5 + basic vector (mock) | Need: Real embeddings + RRF scoring |
| **Cortex / Meta-agent** | Cortex: cross-channel supervision, memory bulletin | N/A | N/A | Need: Meta-agent for system health + knowledge refresh |
| **Model routing** | 4-level routing (process/task/prompt/fallback) | Model failover | Single model | Need: Cost-aware model selection |
| **Skills registry** | SKILL.md + worker injection | ClawHub (searchable registry) | Skills defined but static | Need: Dynamic skill discovery + installation |
| **Non-blocking compaction** | Compactor runs alongside channel | Session pruning | Compaction blocks the loop | Need: Background compaction |
| **Circuit breakers** | Cron auto-disables after 3 failures | Retry policy | Basic retry with backoff | Need: Circuit breaker pattern for scheduled jobs |
| **Message coalescing** | Batches rapid messages into single turn | N/A | N/A | Nice-to-have for multi-user scenarios |

### 2.3 What We Do Better Than Both

| Advantage | Description |
|-----------|-------------|
| **Knowledge extraction pipeline** | Neither Spacebot nor OpenClaw has structured extraction (entities, claims, tasks, decisions) with source citations |
| **Immutable Source Lake** | SHA256-fingerprinted, manifest-tracked raw imports with provenance |
| **Context Pack export** | Curated knowledge bundles for external AI — unique feature |
| **LYT vault structure** | Human-navigable Obsidian integration with MOCs, concepts, projects |
| **Obsidian-native** | Both repos are standalone; we integrate with an existing PKM workflow |
| **Scoped cognition** | Project-folder-based agent scoping is simpler and more intuitive than complex routing rules |

---

## 3. Lessons from Spacebot & OpenClaw

### 3.1 From Spacebot: Process Separation

**Key insight**: Spacebot splits the monolith into specialized processes — Channels (user-facing), Branches (thinking), Workers (tasks), Compactor (maintenance), Cortex (supervision). This means the agent **never blocks** while thinking or working.

**How to apply to Brain**:

```
Current Brain Loop (blocking):
  User → INTAKE → CONTEXT → EXECUTE → PERSIST → Response
  (Everything in one thread — if agent thinks for 30s, user waits)

Proposed Brain Architecture:
  User → Channel Agent (fast, always responsive)
           ├── Branch (fork context, think in background)
           ├── Worker (delegate to skill agent)
           └── Compactor (background memory maintenance)
```

**Practical first step**: Don't rewrite everything. Instead:
1. Make the existing loop async-capable
2. Add a "branch" mechanism that forks context for long-running tasks
3. Return immediate acknowledgment, deliver results via WebSocket

### 3.2 From Spacebot: Typed Memory Graph

**Key insight**: Memories aren't just text blobs. Each memory has a **type** (Fact, Decision, Preference, Goal, Todo, Event, Observation, Identity), an **importance score**, and **graph edges** (RelatedTo, Updates, Contradicts, CausedBy, PartOf).

**How to apply to Brain**:

We already have `items.json` with typed extraction (entity, claim, task, decision, note). The gap is:
- Agent memory (`MEMORY.md`) is unstructured
- No importance scoring or decay
- No graph relationships between memories

**Proposed**: Evolve MEMORY.md into a structured format while keeping it human-readable:

```markdown
# Agent Memory

## Facts [type:fact]
- [importance:0.9] [2026-02-15] SQLite chosen for local-first architecture [relates:decision-001]
- [importance:0.7] [2026-02-10] User prefers concise responses [relates:preference-001]

## Decisions [type:decision]
- [id:decision-001] [importance:1.0] [2026-02-01] API uses Fastify, not Express

## Goals [type:goal]
- [importance:0.8] Complete M5 vector search implementation [status:done]
```

Or better: keep MEMORY.md as the **human view**, but add `memory.json` as the **structured backing store** with graph edges and importance scores. Agent reads from JSON, renders to MD for humans.

### 3.3 From Spacebot: The Cortex (Meta-Agent)

**Key insight**: The Cortex is the **only process that sees across all channels**. It:
- Generates a **memory bulletin** (periodic briefing injected into all conversations)
- Supervises running processes (kills hanging workers)
- Maintains memory graph (decay, pruning, merging duplicates)
- Detects cross-conversation patterns

**How to apply to Brain**: This maps to your "meta-agent" idea. Create a **Brain Cortex** that:
1. Runs on schedule (daily)
2. Scans all agent memories for patterns, contradictions, stale entries
3. Generates a **knowledge bulletin** for the Admin agent
4. Monitors agent health (failed runs, error patterns)
5. Later: scans for new tools/frameworks to suggest skill upgrades

### 3.4 From OpenClaw: Skills Registry

**Key insight**: OpenClaw's ClawHub and Spacebot's SKILL.md pattern both treat skills as **installable, discoverable modules**. The agent can search for skills it needs and pull them in dynamically.

**How to apply to Brain**: We already have `agents/skills/<name>/SKILL.md`. Extend this:
1. Add a `skills.json` registry with metadata (name, description, capabilities, version)
2. Skills can declare their **tool requirements** (needs browser, needs file access, etc.)
3. Admin agent can discover skills by searching the registry
4. Future: Remote skill hub for community-shared skills

### 3.5 From OpenClaw: Session Tools for Agent-to-Agent

**Key insight**: `sessions_list`, `sessions_history`, `sessions_send` — simple tools that let agents coordinate without complex infrastructure.

**How to apply to Brain**: We have `protocol.ts` and `messaging.ts` but they're not exposed as agent tools. Create simple tools:
- `agent_list` — discover available agents
- `agent_send` — send a message to another agent
- `agent_ask` — send a request and wait for response (synchronous delegation)

### 3.6 From Spacebot: Model Routing

**Key insight**: Not every LLM call needs the best model. Spacebot routes by process type (cheap for compaction, strong for coding) and by prompt complexity (simple questions get cheaper models).

**How to apply to Brain**: Add a simple routing layer:
```typescript
interface ModelRoute {
  channel: string;      // Best model for user-facing chat
  worker: string;       // Fast/cheap for background tasks
  compactor: string;    // Cheapest for summarization
  extractor: string;    // Good for structured extraction
}
```

---

## 4. Refined Architecture Proposal

### 4.1 Core Architecture Evolution

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WILCO OS BRAIN v3                              │
│                                                                       │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                │
│  │   CHANNEL    │   │   CORTEX    │   │   WORKERS   │                │
│  │   (Chat)     │   │   (Meta)    │   │   (Tasks)   │                │
│  │             │   │             │   │             │                │
│  │ User-facing  │   │ Supervision  │   │ Background   │                │
│  │ Always fast  │   │ Memory mgmt  │   │ Extraction   │                │
│  │ Delegates    │   │ Health check │   │ Indexing     │                │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                │
│         │                 │                 │                         │
│         └────────────┬────┴────────────────┘                         │
│                      │                                                │
│  ┌───────────────────┴───────────────────────────────────────────┐   │
│  │                    ORCHESTRATOR (Admin Agent)                    │   │
│  │  Routes between project agents, delegates to skills,            │   │
│  │  manages system state, receives cortex briefings                │   │
│  └───────────────────┬───────────────────────────────────────────┘   │
│                      │                                                │
│  ┌──────────┬────────┴──────────┬──────────────┐                     │
│  ▼          ▼                   ▼              ▼                     │
│ Project   Project            Skill          Skill                    │
│ Agent A   Agent B            Agent          Agent                    │
│ (Blog)    (Brain)            (SEO)          (Writer)                 │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    KNOWLEDGE LAYER                               │   │
│  │  Source Lake → Index → Extract → Items → Memory → Vector Search │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    INFRASTRUCTURE                                │   │
│  │  SQLite + FTS5 + Vector │ Event Bus │ Scheduler │ File Watcher  │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Workshop Concept (Refined)

The Workshop is a **virtual collaboration space** per project:

```
┌─────────────────────────────────────────────────────────┐
│                    WORKSHOP                                │
│                                                            │
│  ┌──────────┐   ┌──────────────────┐   ┌──────────────┐  │
│  │  SKILLS  │   │     CANVAS       │   │  AGENT CHAT  │  │
│  │  PANEL   │   │                  │   │              │  │
│  │          │   │  Artifacts:      │   │  Project     │  │
│  │ Research │   │  - Documents     │   │  agent with  │  │
│  │ Writer   │   │  - Task boards   │   │  full        │  │
│  │ SEO      │   │  - Mind maps     │   │  context     │  │
│  │ Code     │   │  - Reports       │   │              │  │
│  │ Debug    │   │  - Diffs         │   │  Memory +    │  │
│  │          │   │                  │   │  Knowledge   │  │
│  └──────────┘   └──────────────────┘   └──────────────┘  │
│                                                            │
│  On enter: Load project context pack + agent memory        │
│  Skills: Project agent can delegate to skill agents        │
│  Canvas: Renders artifacts from skill executions           │
│  Chat: Maintains session with project agent                │
└─────────────────────────────────────────────────────────┘
```

**Key difference from current**: Workshop agents collaborate via the orchestrator. When you enter a workshop:
1. Project agent loads its knowledge (MEMORY.md + items.json + vector search)
2. Skills panel shows available skills from the registry
3. Clicking a skill → Project agent delegates to skill agent via `agent_ask`
4. Skill result becomes an **artifact** rendered on the canvas
5. All interactions logged in project agent's session

---

## 5. Prioritized Roadmap

### Phase 1: Wire Up (Make It Real) — 2 weeks

These are the **highest-impact, lowest-risk** tasks to make the system actually functional.

| # | Task | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 1 | **Wire LLM provider to agent loop** — Connect Claude API to `execute.ts`, enable real agent chat | 🔴 Critical | Medium | Unlocks all agent features |
| 2 | **Wire frontend to backend** — Connect React hooks to Fastify API, replace mock data | 🔴 Critical | Medium | Makes UI functional |
| 3 | **Add real embedding provider** — Replace `MockEmbeddingProvider` with local model (e.g., `@xenova/transformers`) or API | 🔴 Critical | Small | Enables real vector search |
| 4 | **Add file watcher** — `chokidar` on vault, auto-reindex on changes | 🟠 High | Small | Enables real-time knowledge sync |
| 5 | **Expose agent tools** — `agent_list`, `agent_send`, `agent_ask` as LLM tools | 🟠 High | Small | Enables multi-agent collaboration |

### Phase 2: Orchestrator + Workshop — 3 weeks

| # | Task | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 6 | **Implement orchestrator routing** — Admin agent routes requests to project agents based on context | 🟠 High | Medium | Central intelligence |
| 7 | **Structured memory store** — `memory.json` backing MEMORY.md with types, importance, graph edges | 🟠 High | Medium | Better recall, decay, pruning |
| 8 | **Workshop v1** — Connect canvas to real artifacts, skill launcher to real skill agents | 🟠 High | Large | Core product experience |
| 9 | **Model routing** — Route by task type (chat/extract/compact/embed) | 🟡 Medium | Small | Cost optimization |
| 10 | **Skills registry** — `skills.json` with discovery, metadata, tool requirements | 🟡 Medium | Small | Dynamic skill management |

### Phase 3: Cortex + Auto-Improvement — 4 weeks

| # | Task | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 11 | **Brain Cortex** — Meta-agent that runs daily, scans all memories, generates knowledge bulletin | 🟠 High | Large | System intelligence |
| 12 | **Non-blocking execution** — Branches for thinking, workers for tasks, async results via WebSocket | 🟠 High | Large | Responsive UI |
| 13 | **Memory graph** — RelatedTo/Updates/Contradicts edges, importance decay, duplicate merging | 🟡 Medium | Medium | Better knowledge management |
| 14 | **Circuit breakers** — Auto-disable failing scheduled jobs, health monitoring | 🟡 Medium | Small | Reliability |
| 15 | **Auto-improvement agent** — Scans for new tools/models/frameworks, suggests upgrades | 🟡 Medium | Medium | Staying cutting-edge |

### Phase 4: Polish + Ecosystem — Ongoing

| # | Task | Priority | Effort | Impact |
|---|------|----------|--------|--------|
| 16 | **Obsidian plugin** — Two-way sync, trigger extraction from Obsidian | 🟡 Medium | Large | Seamless PKM integration |
| 17 | **Knowledge graph visualization** — D3.js/Cytoscape graph of entities and relations | 🟡 Medium | Medium | Visual discovery |
| 18 | **Tauri desktop wrapper** — Single binary distribution | 🟢 Low | Medium | Distribution |
| 19 | **E2E tests with Playwright** — Full workflow testing | 🟡 Medium | Medium | Quality assurance |
| 20 | **Security hardening** — Docker sandboxing for tool execution, permission model | 🟡 Medium | Medium | Safety |

---

## 6. Architecture Decisions

### 6.1 Do NOT Adopt (from Spacebot/OpenClaw)

| Pattern | Why Not |
|---------|---------|
| **WebSocket gateway as control plane** | Overkill for local-first single-user. Our Fastify server is sufficient. |
| **Multi-channel messaging (WhatsApp/Slack/Discord)** | Not our use case. We're a PKM tool, not a messaging platform. |
| **Rust runtime** (Spacebot) | Our TypeScript ecosystem is mature. Rewriting would cost months for marginal gains. |
| **Complex channel routing rules** | Our project-folder scoping is simpler and more intuitive. |
| **Docker sandboxing** (yet) | Premature. Local-first single-user doesn't need isolation yet. Add in Phase 4. |

### 6.2 DO Adopt

| Pattern | Source | Priority |
|---------|--------|----------|
| **Process separation (channel/branch/worker)** | Spacebot | Phase 3 |
| **Typed memory with graph edges** | Spacebot | Phase 2 |
| **Cortex / meta-agent** | Spacebot | Phase 3 |
| **Model routing by task type** | Spacebot | Phase 2 |
| **Skills registry with discovery** | OpenClaw (ClawHub) | Phase 2 |
| **Session tools for agent-to-agent** | OpenClaw | Phase 1 |
| **Circuit breaker for cron jobs** | Spacebot | Phase 3 |
| **RRF (Reciprocal Rank Fusion) for hybrid search** | Spacebot | Phase 1 (upgrade existing) |

### 6.3 Adapt (Make Our Own)

| Pattern | Adaptation |
|---------|------------|
| **Memory bulletin** (Spacebot Cortex) | Generate daily "knowledge briefing" from all agents, inject into Admin prompt |
| **Knowledge extraction** (our advantage) | Extend to auto-extract from agent conversations too, not just uploaded files |
| **Context packs** (our advantage) | Make them auto-generated per project, refreshed by Cortex |
| **Workshop** (unique to us) | Neither repo has this. Our canvas + skills + agent chat is novel. |

---

## 7. Framework Considerations

Your suggestion to look at external frameworks is worth evaluating:

| Framework | What It Does | Fit for Brain | Recommendation |
|-----------|-------------|---------------|----------------|
| **CrewAI** | Multi-agent workflows with roles | Good for orchestration | **Evaluate** — could replace custom orchestrator |
| **AutoGen** | Multi-agent conversations | Overlap with our protocol | **Skip** — we have our own message protocol |
| **LangGraph** | Workflow graphs with state | Good for complex pipelines | **Evaluate** — could improve extraction pipeline |
| **LlamaIndex** | RAG + knowledge graphs | Strong overlap with our search | **Evaluate** — could replace custom vector search |
| **Khoj** | Personal AI + knowledge search | Direct competitor | **Study** — learn from their UX, don't adopt |
| **MetaGPT** | Role-based multi-agent | Research-focused | **Skip** — too heavy for our use case |

**My recommendation**: Don't adopt a framework wholesale. Instead:
1. Use **LlamaIndex** or **@xenova/transformers** for real embeddings (Phase 1)
2. Evaluate **LangGraph** for complex multi-step workflows (Phase 3)
3. Keep our custom agent loop — it's well-designed and specific to our needs

---

## 8. Quick Wins (This Week)

If you want to see immediate progress, these can be done in days:

1. **Real embeddings** — Replace `MockEmbeddingProvider` with `@xenova/transformers` (runs locally, no API key needed, ~30 lines of code)
2. **RRF scoring** — Upgrade `hybrid.ts` to use Reciprocal Rank Fusion instead of simple weighted average
3. **File watcher** — Add `chokidar` to `src/`, watch vault for changes, trigger re-index
4. **Skills JSON registry** — Create `agents/skills/registry.json` with metadata for all skills
5. **Agent tools** — Expose `agent_list`/`agent_send` as LLM-callable tools in the loop

---

## 9. What's Actually Unique About Brain

After studying both repos, here's what makes Brain **genuinely different**:

1. **Knowledge-first, not chat-first** — Both Spacebot and OpenClaw are conversation tools that happen to have memory. Brain is a **knowledge system** that happens to have agents. The extraction pipeline, Source Lake, and context packs are our moat.

2. **Obsidian-native** — Neither repo integrates with an existing PKM. Brain lives inside the user's actual knowledge vault, which means human and AI knowledge coexist in the same files.

3. **Scoped cognition** — Our project-based agent scoping is cleaner than Spacebot's channel model or OpenClaw's routing rules. Each project gets its own agent with its own knowledge boundary.

4. **Workshop as a product** — Neither repo has a canvas-based collaboration space. The Workshop concept (skills panel + artifact canvas + agent chat) is genuinely novel.

**The strategic play**: Don't try to out-feature Spacebot on messaging or OpenClaw on channels. Instead, double down on **knowledge extraction + workshop + Obsidian integration**. That's where no one else is competing.

---

## 10. Success Metrics

Track these to know if the roadmap is working:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Agent chat latency (p50) | < 3s | Timer in execute stage |
| Knowledge extraction accuracy | > 80% useful items | Manual review sample |
| Vector search relevance | > 70% relevant in top 5 | A/B vs FTS-only |
| Scheduled job success rate | > 90% | Scheduler logs |
| Workshop session duration | > 10 min avg | Session timestamps |
| Memory recall quality | Agent references relevant past context | Manual assessment |

---

## Related Documents

- [[Architecture]] — Current system architecture
- [[PRD_vNext]] — v2 autonomy requirements  
- [[memory-architecture]] — Memory types and storage
- [[agent-loop]] — 4-stage loop specification
- [[system-comparison-openclaw]] — OpenClaw comparison
- [[FUTURE_FEATURES]] — Feature brainstorm
- [[TESTING_GUIDE]] — Test procedures
