---
type: reference
category: patterns
created: 2026-02-05
updated: 2026-02-05
---

# Code Patterns

> Useful patterns extracted from OpenClaw, adapted for the Brain architecture.

---

## 1. Session Locking Pattern

**Source**: OpenClaw `src/agents/session-write-lock.ts`

**Purpose**: Prevent concurrent execution on the same session.

### Pattern

```typescript
interface SessionLock {
  sessionId: string;
  runId: string;
  acquiredAt: Date;
  expiresAt: Date;
}

class SessionLockManager {
  private locks = new Map<string, SessionLock>();
  private waiters = new Map<string, Array<() => void>>();

  async acquire(
    sessionId: string, 
    runId: string, 
    timeoutMs: number = 30000
  ): Promise<SessionLock | null> {
    const existing = this.locks.get(sessionId);
    
    // Check if lock expired
    if (existing && existing.expiresAt > new Date()) {
      // Wait for release or timeout
      const released = await this.waitForRelease(sessionId, timeoutMs);
      if (!released) return null;
    }
    
    const lock: SessionLock = {
      sessionId,
      runId,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min auto-release
    };
    
    this.locks.set(sessionId, lock);
    return lock;
  }

  release(sessionId: string, runId: string): boolean {
    const lock = this.locks.get(sessionId);
    if (lock?.runId !== runId) return false;
    
    this.locks.delete(sessionId);
    
    // Notify waiters
    const waiters = this.waiters.get(sessionId) || [];
    waiters.forEach(resolve => resolve());
    this.waiters.delete(sessionId);
    
    return true;
  }

  private waitForRelease(sessionId: string, timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const timeout = setTimeout(() => resolve(false), timeoutMs);
      
      const waiters = this.waiters.get(sessionId) || [];
      waiters.push(() => {
        clearTimeout(timeout);
        resolve(true);
      });
      this.waiters.set(sessionId, waiters);
    });
  }
}
```

### Adaptation Notes

- Use singleton instance in server
- Store in SQLite for crash recovery
- Add lock timeout cleanup on server start

---

## 2. Token Estimation Pattern

**Source**: OpenClaw `src/agents/context-window-guard.ts`

**Purpose**: Estimate token count before LLM call.

### Pattern

```typescript
// Simple estimation: ~4 chars per token for English
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// More accurate: use tiktoken or model-specific tokenizer
import { encoding_for_model } from 'tiktoken';

function countTokens(text: string, model: string = 'claude-3'): number {
  // For Claude, approximate with cl100k_base
  const encoder = encoding_for_model('gpt-4'); // Similar tokenizer
  const tokens = encoder.encode(text);
  encoder.free();
  return tokens.length;
}

interface ContextEstimate {
  systemPrompt: number;
  history: number;
  message: number;
  total: number;
  remaining: number;
}

function estimateContext(
  systemPrompt: string,
  history: Message[],
  message: string,
  contextWindow: number
): ContextEstimate {
  const systemTokens = estimateTokens(systemPrompt);
  const historyTokens = history.reduce(
    (sum, msg) => sum + estimateTokens(msg.content), 
    0
  );
  const messageTokens = estimateTokens(message);
  const total = systemTokens + historyTokens + messageTokens;
  
  return {
    systemPrompt: systemTokens,
    history: historyTokens,
    message: messageTokens,
    total,
    remaining: contextWindow - total,
  };
}
```

### Adaptation Notes

- Cache tokenizer instance
- Use fast estimation for checks, accurate for compaction decisions
- Log estimation vs actual for accuracy tracking

---

## 3. Tool Result Pruning Pattern

**Source**: OpenClaw `src/concepts/session-pruning`

**Purpose**: Remove old tool results from runtime context without modifying transcript.

### Pattern

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  timestamp: Date;
}

function pruneToolResults(
  messages: Message[], 
  keepLast: number = 5
): Message[] {
  // Identify tool results
  const toolResults = messages.filter(m => m.role === 'tool_result');
  const toolResultsToKeep = new Set(
    toolResults.slice(-keepLast).map(m => m.id)
  );
  
  return messages.map(msg => {
    if (msg.role === 'tool_result' && !toolResultsToKeep.has(msg.id)) {
      // Replace content with placeholder
      return {
        ...msg,
        content: '[Tool result pruned for context efficiency]',
      };
    }
    return msg;
  });
}
```

### Adaptation Notes

- Apply during CONTEXT stage only
- Keep tool_call messages intact for context
- Configurable keepLast parameter

---

## 4. Compaction Pattern

**Source**: OpenClaw `src/agents/compaction.ts`

**Purpose**: Summarize old messages to free context window.

### Pattern

```typescript
const COMPACTION_PROMPT = `Summarize the following conversation history into a concise summary.
Preserve:
- Key decisions made
- Important facts learned
- Current task context
- User preferences expressed

Keep the summary under 500 words.`;

async function compactHistory(
  history: Message[],
  keepRecent: number = 10,
  llm: LLMClient
): Promise<Message[]> {
  if (history.length <= keepRecent) {
    return history; // Nothing to compact
  }
  
  const toCompact = history.slice(0, -keepRecent);
  const toKeep = history.slice(-keepRecent);
  
  // Format for summarization
  const historyText = toCompact
    .map(m => `${m.role}: ${m.content}`)
    .join('\n\n');
  
  const summary = await llm.complete({
    system: COMPACTION_PROMPT,
    messages: [{ role: 'user', content: historyText }],
  });
  
  // Create summary message
  const summaryMessage: Message = {
    id: `compaction_${Date.now()}`,
    role: 'system',
    content: `[Compacted conversation summary]\n\n${summary}`,
    timestamp: new Date(),
  };
  
  return [summaryMessage, ...toKeep];
}
```

### Adaptation Notes

- Write compacted transcript to separate file or in-place
- Track compaction count in session metadata
- Emit compaction event for observability

---

## 5. Memory Flush Pattern

**Source**: OpenClaw `docs/concepts/memory.md`

**Purpose**: Persist important context before compaction.

### Pattern

```typescript
const FLUSH_SYSTEM_PROMPT = 
  'Session nearing compaction. Store durable memories now.';

const FLUSH_USER_PROMPT = 
  'Review the conversation and write any lasting notes to MEMORY.md. ' +
  'Reply with NO_REPLY if nothing important needs to be saved.';

async function triggerMemoryFlush(
  context: ChatContext,
  llm: LLMClient
): Promise<boolean> {
  // Check if already flushed this cycle
  if (context.session.memoryFlushed) {
    return false;
  }
  
  // Build flush messages
  const flushMessages = [
    ...context.history,
    { role: 'system', content: FLUSH_SYSTEM_PROMPT },
    { role: 'user', content: FLUSH_USER_PROMPT },
  ];
  
  // Execute flush turn
  const response = await llm.complete({
    system: context.systemPrompt,
    messages: flushMessages,
    tools: context.tools, // Agent can write to MEMORY.md
  });
  
  // Mark flushed
  context.session.memoryFlushed = true;
  
  // Suppress NO_REPLY from user
  return response.trim() !== 'NO_REPLY';
}
```

### Adaptation Notes

- Trigger when token estimate crosses flush threshold
- Reset memoryFlushed flag after compaction completes
- Skip if workspace is read-only

---

## 6. Event Emission Pattern

**Source**: OpenClaw `src/agents/pi-embedded-subscribe.ts`

**Purpose**: Observable agent execution.

### Pattern

```typescript
import { EventEmitter } from 'events';

interface LoopEvents {
  'loop:start': { runId: string; sessionId: string };
  'loop:context': { tokenEstimate: number };
  'loop:execute': { toolCount: number };
  'tool:start': { toolName: string; toolCallId: string };
  'tool:end': { toolName: string; result: unknown; duration: number };
  'stream:delta': { content: string };
  'loop:persist': Record<string, never>;
  'loop:end': { runId: string; success: boolean; duration: number };
  'loop:error': { runId: string; error: Error };
}

class AgentLoop extends EventEmitter {
  emit<K extends keyof LoopEvents>(event: K, payload: LoopEvents[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof LoopEvents>(
    event: K, 
    listener: (payload: LoopEvents[K]) => void
  ): this {
    return super.on(event, listener);
  }
  
  async run(request: LoopRequest): Promise<LoopResponse> {
    const startTime = Date.now();
    
    try {
      this.emit('loop:start', { 
        runId: request.runId, 
        sessionId: request.sessionId 
      });
      
      // INTAKE
      const intake = await this.intake(request);
      
      // CONTEXT
      const context = await this.context(intake);
      this.emit('loop:context', { tokenEstimate: context.tokenEstimate });
      
      // EXECUTE
      const result = await this.execute(context);
      
      // PERSIST
      this.emit('loop:persist', {});
      await this.persist(result);
      
      this.emit('loop:end', {
        runId: request.runId,
        success: true,
        duration: Date.now() - startTime,
      });
      
      return result;
    } catch (error) {
      this.emit('loop:error', { 
        runId: request.runId, 
        error: error as Error 
      });
      throw error;
    }
  }
}
```

### Adaptation Notes

- Use typed events for type safety
- Forward events to WebSocket for real-time UI
- Log events for debugging

---

## 7. Scope Enforcement Pattern

**Source**: OpenClaw `src/agents/agent-scope.ts`

**Purpose**: Prevent agents from accessing files outside their scope.

### Pattern

```typescript
import { minimatch } from 'minimatch';
import { resolve, relative } from 'path';

interface ScopeRule {
  type: 'path' | 'tag' | 'collection';
  pattern: string;
}

function parseScope(scopeStr: string): ScopeRule {
  const [type, pattern] = scopeStr.split(':');
  return { type: type as ScopeRule['type'], pattern };
}

function isPathInScope(
  filePath: string, 
  scopes: ScopeRule[], 
  vaultPath: string
): boolean {
  const absolutePath = resolve(vaultPath, filePath);
  const relativePath = relative(vaultPath, absolutePath);
  
  // Prevent escaping vault
  if (relativePath.startsWith('..')) {
    return false;
  }
  
  for (const scope of scopes) {
    if (scope.type === 'path') {
      if (minimatch(relativePath, scope.pattern)) {
        return true;
      }
    }
  }
  
  return false;
}

function enforceScope(
  agentDef: AgentDefinition,
  filePath: string,
  vaultPath: string
): void {
  const scopes = (agentDef.scope || []).map(parseScope);
  
  // Admin has full access
  if (agentDef.type === 'admin') {
    return;
  }
  
  if (!isPathInScope(filePath, scopes, vaultPath)) {
    throw new ScopeViolationError(
      `Agent ${agentDef.id} cannot access ${filePath}`
    );
  }
}
```

### Adaptation Notes

- Check on every tool call that accesses files
- Log scope violations
- Support `path:`, `tag:`, `collection:` scope types

---

## 8. Subagent Spawn Pattern

**Source**: OpenClaw `src/agents/openclaw-tools.subagents.ts`

**Purpose**: Delegate tasks to specialized agents.

### Pattern

```typescript
interface SpawnRequest {
  targetAgentId: string;
  context: string;
  task: string;
  timeout?: number;
}

interface SpawnResult {
  success: boolean;
  result?: string;
  error?: string;
  duration: number;
}

async function spawnSubagent(
  request: SpawnRequest,
  parentContext: ChatContext,
  allowlist: string[]
): Promise<SpawnResult> {
  // Check allowlist
  if (!allowlist.includes(request.targetAgentId)) {
    return {
      success: false,
      error: `Agent ${request.targetAgentId} not in spawn allowlist`,
      duration: 0,
    };
  }
  
  const startTime = Date.now();
  
  try {
    // Load target agent
    const targetAgent = await loadAgentDefinition(request.targetAgentId);
    
    // Create child context with passed context
    const childContext = buildChildContext(targetAgent, {
      parentContext: request.context,
      task: request.task,
    });
    
    // Execute child loop
    const result = await executeLoop(childContext, {
      timeout: request.timeout || 30000,
    });
    
    return {
      success: true,
      result: result.response,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      duration: Date.now() - startTime,
    };
  }
}
```

### Adaptation Notes

- Skill agents are stateless (no session persistence)
- Context passed explicitly, not inherited
- Results returned to parent, not streamed

---

## 9. Retry with Backoff Pattern

**Source**: OpenClaw `src/agents/model-fallback.ts`

**Purpose**: Handle transient failures gracefully.

### Pattern

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  isRetryable: (error: Error) => boolean = () => true
): Promise<T> {
  const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };
  
  let lastError: Error;
  let delay = initialDelayMs;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (!isRetryable(lastError) || attempt === maxAttempts) {
        throw lastError;
      }
      
      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }
  
  throw lastError!;
}

function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('timeout') ||
    message.includes('503') ||
    message.includes('overloaded')
  );
}
```

### Adaptation Notes

- Use for LLM API calls
- Log each retry attempt
- Emit retry event for observability

---

## Summary: Patterns to Implement

| Priority | Pattern | File Target |
|----------|---------|-------------|
| 🔴 P0 | Session Locking | `src/agent/session-lock.ts` |
| 🔴 P0 | Token Estimation | `src/agent/tokens.ts` |
| 🔴 P0 | Event Emission | `src/agent/loop/events.ts` |
| 🟠 P1 | Tool Result Pruning | `src/agent/loop/context.ts` |
| 🟠 P1 | Compaction | `src/agent/compaction.ts` |
| 🟠 P1 | Memory Flush | `src/agent/memory-flush.ts` |
| 🟡 P2 | Scope Enforcement | `src/agent/scope.ts` |
| 🟡 P2 | Subagent Spawn | `src/agent/subagent.ts` |
| 🟡 P2 | Retry with Backoff | `src/agent/retry.ts` |

---

## Related Documents

- [[agent-loop]] — Where patterns are applied
- [[memory-architecture]] — Memory patterns context
- [[system-comparison-openclaw]] — Full comparison
