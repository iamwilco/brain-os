---
type: specification
category: architecture
created: 2026-02-05
updated: 2026-02-05
status: canonical
---

# Agent Loop Specification

> Canonical definition of the Brain agent execution loop. All agent implementations MUST conform to this specification.

---

## Overview

An **agent loop** is a complete execution cycle that transforms a user message into actions and a response while maintaining consistent state. The loop is **deterministic**: given the same inputs, it produces the same outputs.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AGENT LOOP                                   │
│                                                                      │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│   │  INTAKE  │ → │ CONTEXT  │ → │ EXECUTE  │ → │ PERSIST  │        │
│   └──────────┘   └──────────┘   └──────────┘   └──────────┘        │
│        ↓              ↓              ↓              ↓               │
│   Validate       Build prompt    LLM + Tools    Write state         │
│   Route          Load memory     Stream         Update memory       │
│   Queue          Check tokens    Handle errors  Log transcript      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: INTAKE

**Purpose**: Validate input, resolve routing, acquire execution lock.

### Required Inputs
| Input | Type | Source |
|-------|------|--------|
| `message` | string | User input |
| `projectId` | string | Request context |
| `sessionId` | string? | Optional, creates new if absent |
| `agentPath` | string? | Optional, derived from project |

### Required Outputs
| Output | Type | Description |
|--------|------|-------------|
| `runId` | UUID | Unique execution identifier |
| `sessionId` | UUID | Session identifier (new or existing) |
| `agentDef` | AgentDefinition | Parsed AGENT.md |
| `lock` | SessionLock | Exclusive session access |

### Operations
1. **Validate message** — Non-empty, within size limits
2. **Resolve agent** — Load AGENT.md, validate frontmatter
3. **Resolve session** — Get or create session metadata
4. **Acquire lock** — Exclusive write access to session
5. **Generate runId** — UUID for this execution

### Failure Modes
| Failure | Recovery |
|---------|----------|
| Agent not found | Return 404, do not proceed |
| Invalid agent config | Return 400 with validation errors |
| Session locked | Queue request, retry with backoff |
| Lock timeout | Return 503, suggest retry |

### When to STOP
- Agent definition invalid
- Lock cannot be acquired after max retries
- Session marked as terminated

---

## Stage 2: CONTEXT

**Purpose**: Assemble everything the model needs to respond.

### Required Inputs
| Input | Type | Source |
|-------|------|--------|
| `agentDef` | AgentDefinition | From INTAKE |
| `sessionId` | UUID | From INTAKE |
| `message` | string | User input |

### Required Outputs
| Output | Type | Description |
|--------|------|-------------|
| `systemPrompt` | string | Complete system prompt |
| `history` | Message[] | Conversation history |
| `tools` | ToolDef[] | Available tools |
| `tokenEstimate` | number | Estimated context tokens |
| `memoryContext` | string | Loaded memory content |

### Operations
1. **Load transcript** — Read session JSONL
2. **Load memory** — Read MEMORY.md
3. **Build system prompt**:
   - Agent identity (from AGENT.md)
   - Scope constraints
   - Available tools
   - Project context (if project agent)
   - Current date/time
4. **Estimate tokens** — Count system + history + message
5. **Check context window**:
   - If `tokenEstimate > contextWindow - reserveFloor`: trigger COMPACTION
   - If `tokenEstimate > contextWindow - flushThreshold`: trigger MEMORY_FLUSH
6. **Prune tool results** — Remove old tool outputs from runtime context (not transcript)

### Failure Modes
| Failure | Recovery |
|---------|----------|
| Memory file missing | Continue with empty memory |
| Transcript corrupted | Attempt repair, fallback to empty |
| Token estimate exceeds window | Trigger compaction, retry |
| Compaction fails | Return error, preserve transcript |

### When to STOP
- Context cannot fit after compaction
- Memory indicates agent should terminate

---

## Stage 3: EXECUTE

**Purpose**: Send to LLM, execute tools, stream response.

### Required Inputs
| Input | Type | Source |
|-------|------|--------|
| `systemPrompt` | string | From CONTEXT |
| `history` | Message[] | From CONTEXT |
| `message` | string | User input |
| `tools` | ToolDef[] | From CONTEXT |

### Required Outputs
| Output | Type | Description |
|--------|------|-------------|
| `response` | string | Final assistant response |
| `toolCalls` | ToolCall[] | Tools invoked |
| `toolResults` | ToolResult[] | Tool outputs |
| `usage` | TokenUsage | Input/output tokens |

### Operations
1. **Send to LLM** — API call with full context
2. **Stream response** — Emit deltas as received
3. **Detect tool calls** — Parse tool invocations
4. **Execute tools** — Run each tool, collect results
5. **Continue if needed** — Re-send with tool results
6. **Collect final response** — Complete assistant message

### Tool Execution Sub-loop
```
while (response contains tool_calls):
    for each tool_call:
        validate against scope
        execute with timeout
        collect result
    send tool_results to LLM
    collect next response
```

### Failure Modes
| Failure | Recovery |
|---------|----------|
| LLM API error | Retry with exponential backoff (max 3) |
| LLM timeout | Return partial + error message |
| Tool execution error | Return error as tool result, let LLM handle |
| Tool timeout | Kill process, return timeout error |
| Scope violation | Deny tool, return scope error |
| Rate limit | Queue and retry after delay |

### When to STOP
- LLM returns final response (no tool calls)
- Max tool iterations reached (default: 10)
- Execution timeout exceeded (default: 600s)
- Abort signal received

---

## Stage 4: PERSIST

**Purpose**: Write all state changes atomically.

### Required Inputs
| Input | Type | Source |
|-------|------|--------|
| `runId` | UUID | From INTAKE |
| `sessionId` | UUID | From INTAKE |
| `message` | string | User input |
| `response` | string | From EXECUTE |
| `toolCalls` | ToolCall[] | From EXECUTE |
| `toolResults` | ToolResult[] | From EXECUTE |
| `usage` | TokenUsage | From EXECUTE |

### Required Outputs
| Output | Type | Description |
|--------|------|-------------|
| `transcriptUpdated` | boolean | Transcript written |
| `sessionUpdated` | boolean | Session metadata updated |
| `memoryUpdated` | boolean | Memory written (if flush) |

### Operations
1. **Append to transcript** — User message, tool calls, tool results, assistant response
2. **Update session metadata** — Last updated, message count, token usage
3. **Release lock** — Allow next execution
4. **Write memory** (if memory flush triggered)
5. **Emit completion event**

### Transcript Format (JSONL)
```jsonl
{"role":"user","content":"...","timestamp":"..."}
{"role":"assistant","content":"...","tool_calls":[...],"timestamp":"..."}
{"role":"tool","tool_call_id":"...","content":"...","timestamp":"..."}
```

### Failure Modes
| Failure | Recovery |
|---------|----------|
| Disk write failure | Retry 3x, then log error and continue |
| Lock release failure | Force release, log warning |
| Memory write failure | Log error, do not fail loop |

### When to STOP
- All writes completed (success or logged failure)
- Lock released

---

## Special Flows

### COMPACTION Flow

Triggered when `tokenEstimate > contextWindow - reserveFloor`.

```
1. Build compaction prompt
2. Send history to LLM with: "Summarize this conversation"
3. Receive summary
4. Replace old messages with summary message
5. Write compacted transcript
6. Resume normal loop
```

### MEMORY_FLUSH Flow

Triggered when `tokenEstimate > contextWindow - flushThreshold` AND not yet flushed this cycle.

```
1. Inject silent system message: "Session nearing compaction. Store durable memories now."
2. Inject user message: "Write any lasting notes to MEMORY.md; reply with NO_REPLY if nothing to store."
3. Execute normally (agent may write to MEMORY.md)
4. If response is "NO_REPLY", suppress from user
5. Mark flush complete for this compaction cycle
```

---

## Concurrency Model

### Session Serialization
- Only ONE execution per session at a time
- Requests queue when session is locked
- Queue timeout: 30 seconds
- Max queue depth: 10

### Lock Implementation
```typescript
interface SessionLock {
  sessionId: string;
  runId: string;
  acquiredAt: Date;
  expiresAt: Date; // Auto-release after timeout
}
```

### Queue Modes
| Mode | Behavior |
|------|----------|
| `queue` | Wait for lock, execute in order |
| `drop` | Return immediately if locked |
| `interrupt` | Cancel current execution, start new |

---

## Event Emissions

The loop MUST emit these events:

| Event | When | Payload |
|-------|------|---------|
| `loop:start` | INTAKE begins | `{ runId, sessionId }` |
| `loop:context` | CONTEXT complete | `{ tokenEstimate }` |
| `loop:execute` | EXECUTE begins | `{ toolCount }` |
| `tool:start` | Tool execution begins | `{ toolName, toolCallId }` |
| `tool:end` | Tool execution ends | `{ toolName, result, duration }` |
| `stream:delta` | Response chunk received | `{ content }` |
| `loop:persist` | PERSIST begins | `{}` |
| `loop:end` | Loop complete | `{ runId, success, duration }` |
| `loop:error` | Unrecoverable error | `{ runId, error }` |

---

## Configuration

```typescript
interface AgentLoopConfig {
  // Context limits
  contextWindow: number;        // Model's max tokens (default: 128000)
  reserveFloor: number;         // Reserve for response (default: 4000)
  flushThreshold: number;       // Trigger memory flush (default: 8000)
  
  // Execution limits
  maxToolIterations: number;    // Max tool loops (default: 10)
  executionTimeout: number;     // Max execution time ms (default: 600000)
  toolTimeout: number;          // Per-tool timeout ms (default: 30000)
  
  // Queue settings
  queueTimeout: number;         // Lock wait time ms (default: 30000)
  maxQueueDepth: number;        // Max queued requests (default: 10)
  lockTimeout: number;          // Auto-release lock ms (default: 900000)
  
  // Retry settings
  maxRetries: number;           // LLM retry count (default: 3)
  retryBackoff: number;         // Initial backoff ms (default: 1000)
}
```

---

## Invariants

These MUST hold true:

1. **Exactly one active execution per session** — Enforced by locking
2. **Transcript is append-only** — Never delete entries (except compaction)
3. **All tool calls logged** — Every invocation recorded
4. **Lock always released** — Even on error
5. **Events always emitted** — For observability
6. **Scope always enforced** — Tools cannot escape scope
7. **Token limits respected** — Compaction before overflow

---

## Implementation Checklist

- [ ] INTAKE: Request validation
- [ ] INTAKE: Agent resolution
- [ ] INTAKE: Session locking
- [ ] CONTEXT: Memory loading
- [ ] CONTEXT: System prompt building
- [ ] CONTEXT: Token estimation
- [ ] CONTEXT: Tool result pruning
- [ ] EXECUTE: LLM API integration
- [ ] EXECUTE: Response streaming
- [ ] EXECUTE: Tool execution
- [ ] EXECUTE: Scope enforcement
- [ ] PERSIST: Transcript writing
- [ ] PERSIST: Session metadata
- [ ] PERSIST: Lock release
- [ ] SPECIAL: Compaction flow
- [ ] SPECIAL: Memory flush flow
- [ ] CONCURRENCY: Queue implementation
- [ ] EVENTS: All emissions

---

## Related Documents

- [[memory-architecture]] — Memory types and persistence
- [[system-comparison-openclaw]] — OpenClaw reference
- [[Architecture]] — System architecture
