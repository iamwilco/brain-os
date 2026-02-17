---
type: prd
category: product
version: 2.0
created: 2026-02-05
updated: 2026-02-05
status: draft
---

# Product Requirements Document: Brain v2.0

> Autonomous multi-agent knowledge system for Wilco OS

---

## 1. Executive Summary

Brain v2.0 evolves from a **human-triggered knowledge tool** to an **autonomous multi-agent system** capable of advancing state without prompts, maintaining persistent memory, and executing deterministic agent loops.

### Vision

A local-first AI operating system where:
- Agents work **autonomously** on defined tasks
- Knowledge is **extracted, structured, and searchable**
- Memory **persists and compounds** across sessions
- Multiple agents **collaborate** without human mediation

### Key Differentiators

1. **Local-first**: All data on user's machine, no cloud dependency
2. **Obsidian-native**: Works within existing PKM workflow
3. **Deterministic loops**: Predictable, auditable agent behavior
4. **Multi-agent**: Specialized agents for different domains

---

## 2. Definition of Autonomy

### What "Autonomous" Means

An agent is autonomous when it can:

| Capability | Description |
|------------|-------------|
| **Self-initiate** | Start execution without user prompt (scheduled, triggered) |
| **State-advance** | Move tasks from pending → in_progress → completed |
| **Self-correct** | Detect errors and retry or escalate |
| **Memory-persist** | Write knowledge that survives context reset |
| **Self-bound** | Operate within defined scope, stop when appropriate |

### What Autonomy is NOT

- **Unbounded execution**: Agents have scope limits and stop conditions
- **Unsupervised**: Humans can review, interrupt, override
- **Unaccountable**: All actions logged, decisions explained
- **Magic**: Agents follow deterministic loops, not intuition

### Autonomy Levels

| Level | Description | Brain v1 | Brain v2 |
|-------|-------------|----------|----------|
| L0 | Responds only to prompts | ✅ | ✅ |
| L1 | Executes multi-step tasks | ✅ | ✅ |
| L2 | Persists memory across sessions | Partial | ✅ |
| L3 | Self-initiates on schedule/trigger | ❌ | ✅ |
| L4 | Multi-agent orchestration | ❌ | ✅ |
| L5 | Self-modifying goals | ❌ | Future |

**Brain v2 target: Level 4**

---

## 3. System Requirements

### 3.1 Core Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| R1 | Deterministic agent loop with 4 stages | 🔴 Critical |
| R2 | Session serialization (one execution per session) | 🔴 Critical |
| R3 | Context window tracking and enforcement | 🔴 Critical |
| R4 | Auto-compaction when context threshold crossed | 🔴 Critical |
| R5 | Memory flush before compaction | 🟠 High |
| R6 | Persistent long-term memory (MEMORY.md) | 🟠 High |
| R7 | Multi-agent message protocol | 🟠 High |
| R8 | Subagent spawn and delegation | 🟡 Medium |
| R9 | Scheduled agent runs (cron) | 🟡 Medium |
| R10 | Vector memory search | 🟡 Medium |

### 3.2 Agent Loop Requirements

The agent loop MUST:

1. **INTAKE**: Validate input, resolve agent, acquire session lock
2. **CONTEXT**: Load memory, build prompt, estimate tokens, prune if needed
3. **EXECUTE**: Call LLM, execute tools, stream response
4. **PERSIST**: Write transcript, update metadata, release lock

Each stage has defined:
- Required inputs
- Required outputs
- Failure modes
- Recovery strategies

See [[agent-loop]] for full specification.

### 3.3 Memory Requirements

The system MUST support:

| Memory Type | Storage | Access |
|-------------|---------|--------|
| Working | Runtime | Current loop only |
| Episodic | JSONL | Append-only transcripts |
| Long-term | Markdown | Agent read/write |
| Extracted | JSON | Pipeline write, API read |
| Task | JSON | Agent read, explicit write |

See [[memory-architecture]] for full specification.

### 3.4 Multi-Agent Requirements

| Requirement | Description |
|-------------|-------------|
| Agent types | Admin (vault-wide), Project (folder-scoped), Skill (stateless) |
| Scope enforcement | Agents cannot access outside defined scope |
| Message protocol | JSON messages with from/to/type/payload |
| Subagent spawn | Admin can delegate to Skill agents |
| Session isolation | Each agent has own session store |

---

## 4. Success Criteria

### 4.1 Functional Success

| Criterion | Measurement | Target |
|-----------|-------------|--------|
| Loop completion rate | Loops that complete without error | > 95% |
| Memory persistence | Facts written that survive reset | 100% |
| Scope enforcement | Zero out-of-scope access | 100% |
| Session isolation | Zero cross-session corruption | 100% |
| Compaction success | Compactions that complete | > 99% |

### 4.2 Performance Targets

| Metric | Target |
|--------|--------|
| Loop latency (p50) | < 5s for simple responses |
| Loop latency (p95) | < 30s with tool execution |
| Memory search latency | < 500ms |
| Compaction latency | < 10s |
| Context estimation accuracy | ±10% of actual tokens |

### 4.3 Autonomy Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Tasks completed without human | Scheduled tasks that succeed | > 80% |
| Memory flush rate | Pre-compaction flushes triggered | > 90% |
| Self-correction rate | Errors recovered without human | > 70% |
| Subagent delegation success | Skill calls that return useful results | > 85% |

---

## 5. What the System MUST Do Without Human Input

### 5.1 Automatic Behaviors

| Behavior | Trigger | Action |
|----------|---------|--------|
| Session lock | New message arrives | Acquire before execution |
| Lock release | Loop ends | Release even on error |
| Token estimation | Every loop | Calculate before LLM call |
| Memory flush | Token threshold crossed | Silent turn to persist memory |
| Compaction | Token threshold crossed | Summarize and trim history |
| Retry | LLM error | Exponential backoff, max 3 |
| Scope check | Every tool call | Deny if out of scope |
| Transcript append | Every loop | Write all messages |

### 5.2 Scheduled Behaviors (v2 Goal)

| Behavior | Schedule | Action |
|----------|----------|--------|
| Daily synthesis | 04:00 local | Summarize yesterday's activity |
| Weekly review | Sunday 04:00 | Generate status report |
| Memory cleanup | Weekly | Flag stale memory entries |
| Index refresh | On file change | Re-index modified sources |

### 5.3 Triggered Behaviors

| Trigger | Action |
|---------|--------|
| File uploaded to project | Queue for extraction |
| Extraction complete | Update knowledge index |
| Task marked complete | Advance to next task |
| Agent error | Log, retry, or escalate |

---

## 6. Failure Criteria

### 6.1 Critical Failures (Block Release)

| Failure | Description |
|---------|-------------|
| Data loss | Transcript or memory entries lost |
| Scope violation | Agent accesses outside scope |
| Infinite loop | Agent never terminates |
| Corruption | Session or memory file corrupted |
| Deadlock | Sessions permanently locked |

### 6.2 Degraded Operation (Acceptable)

| Condition | Acceptable Behavior |
|-----------|---------------------|
| LLM unavailable | Queue requests, retry later |
| Memory search slow | Fall back to recent memory only |
| Compaction fails | Pause session, alert user |
| Tool timeout | Return error, let LLM handle |

---

## 7. Non-Functional Requirements

### 7.1 Security

| Requirement | Implementation |
|-------------|----------------|
| API keys never in vault | Environment variables only |
| Scope enforcement | Agents sandboxed to defined paths |
| Audit trail | All actions logged with timestamps |
| No external calls without consent | User approves network-accessing tools |

### 7.2 Reliability

| Requirement | Implementation |
|-------------|----------------|
| Crash recovery | Resume from last persisted state |
| Graceful degradation | Partial function if LLM unavailable |
| Idempotency | Reruns produce same results |
| Lock timeout | Auto-release after 15 minutes |

### 7.3 Observability

| Requirement | Implementation |
|-------------|----------------|
| Loop events | Emit start/stage/end events |
| Error logging | Structured logs with context |
| Metrics | Token usage, latency, success rate |
| Dashboards | System status visible in UI |

---

## 8. User Stories

### 8.1 Autonomous Agent

> As a user, I want agents to work on tasks overnight so I wake up to completed work.

**Acceptance Criteria**:
- [ ] Scheduled runs execute without user online
- [ ] Memory persists across runs
- [ ] Status visible in morning

### 8.2 Multi-Agent Collaboration

> As a user, I want my Admin agent to delegate SEO analysis to a specialist skill agent.

**Acceptance Criteria**:
- [ ] Admin spawns skill agent with context
- [ ] Skill returns structured result
- [ ] Admin incorporates result into response

### 8.3 Context Preservation

> As a user, I want important context preserved even in very long conversations.

**Acceptance Criteria**:
- [ ] Memory flush happens before compaction
- [ ] Key facts written to MEMORY.md
- [ ] Agent recalls after compaction

### 8.4 Knowledge Extraction

> As a user, I want knowledge automatically extracted from files I upload.

**Acceptance Criteria**:
- [ ] Upload triggers extraction
- [ ] Entities, tasks, decisions extracted
- [ ] Items searchable in Knowledge tab

---

## 9. Milestones

### M1: Deterministic Loop (Week 1-2)

- [ ] Agent loop with 4 stages
- [ ] Session locking
- [ ] Token estimation
- [ ] Basic error handling

### M2: Memory System (Week 3-4)

- [ ] MEMORY.md read/write
- [ ] Compaction implementation
- [ ] Memory flush flow
- [ ] Tool result pruning

### M3: Multi-Agent (Week 5-6)

- [ ] Message protocol
- [ ] Subagent spawn
- [ ] Scope enforcement
- [ ] Cross-agent context passing

### M4: Autonomy (Week 7-8)

- [ ] Scheduled runs
- [ ] Triggered behaviors
- [ ] Self-correction
- [ ] Dashboard and metrics

---

## 10. Out of Scope (v2)

The following are explicitly NOT in v2:

- Voice interface
- Mobile application
- Cloud sync
- Multi-user collaboration
- Self-modifying agent goals
- External messaging (Slack, Discord, etc.)

These may be considered for v3+.

---

## 11. Dependencies

| Dependency | Required For |
|------------|--------------|
| Anthropic API | LLM inference |
| SQLite + better-sqlite3 | Database |
| Node.js 22+ | Runtime |
| Obsidian | Vault management |

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM costs too high | Medium | High | Token tracking, caching |
| Context window limits | High | Medium | Compaction, pruning |
| Scope violations | Low | Critical | Strict enforcement, testing |
| Data loss | Low | Critical | Append-only logs, backups |
| Agent infinite loops | Medium | High | Max iterations, timeouts |

---

## Related Documents

- [[agent-loop]] — Loop specification
- [[memory-architecture]] — Memory system
- [[system-comparison-openclaw]] — Reference architecture
- [[tasks_vNext.json]] — Implementation tasks
- [[Architecture]] — System architecture
