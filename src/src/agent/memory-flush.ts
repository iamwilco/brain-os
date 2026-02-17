/**
 * Memory Flush Flow
 * 
 * Triggers a silent agentic turn to persist working memory before compaction.
 * The agent is prompted to save important context to MEMORY.md.
 */

import type { AgentMemory, MemoryUpdate } from './memory.js';
import type { TranscriptMessage } from './session.js';

/**
 * Flush trigger reasons
 */
export type FlushReason = 'threshold' | 'compaction_pending' | 'manual' | 'session_end';

/**
 * Memory flush request
 */
export interface FlushRequest {
  /** Reason for triggering flush */
  reason: FlushReason;
  /** Current memory state */
  currentMemory: AgentMemory | null;
  /** Recent conversation context */
  recentMessages: TranscriptMessage[];
  /** Token estimate of current context */
  tokenEstimate: number;
  /** Whether this is before a compaction */
  preCompaction: boolean;
}

/**
 * Memory flush result
 */
export interface FlushResult {
  /** Whether flush was triggered */
  triggered: boolean;
  /** Memory updates extracted from agent response */
  updates: MemoryUpdate[];
  /** Whether agent indicated no updates needed */
  noReply: boolean;
  /** Error if flush failed */
  error?: string;
}

/**
 * Flush state for tracking flush cycles
 */
export interface FlushState {
  /** Whether a flush is in progress */
  inProgress: boolean;
  /** Whether flush has occurred this compaction cycle */
  flushedThisCycle: boolean;
  /** Last flush timestamp */
  lastFlushAt: Date | null;
  /** Number of flushes this session */
  flushCount: number;
}

/**
 * Create initial flush state
 */
export function createFlushState(): FlushState {
  return {
    inProgress: false,
    flushedThisCycle: false,
    lastFlushAt: null,
    flushCount: 0,
  };
}

/**
 * System message to inject for memory flush
 */
export const FLUSH_SYSTEM_MESSAGE = `
[SYSTEM: Memory Checkpoint]

Your context window is approaching capacity. Before the conversation history is compacted, 
you have an opportunity to persist any important information to your working memory.

Review the recent conversation and determine if there is anything important that should be 
saved to MEMORY.md for future reference. This includes:
- Key decisions or conclusions reached
- Important user preferences or context learned
- Task progress or state that should persist
- Any information you'll need in future turns

If you have updates to make, respond with them in this format:
\`\`\`memory
## Section Name
Content to save...
\`\`\`

If no updates are needed, respond with: [NO_REPLY]
`.trim();

/**
 * Shorter system message for non-compaction flushes
 */
export const FLUSH_REMINDER_MESSAGE = `
[SYSTEM: Memory Reminder]

Consider if any important information from this conversation should be saved to your 
working memory (MEMORY.md) for future reference.

If you have updates, respond with:
\`\`\`memory
## Section Name
Content...
\`\`\`

If no updates needed: [NO_REPLY]
`.trim();

/**
 * Check if flush should be triggered
 */
export function shouldTriggerFlush(
  state: FlushState,
  request: FlushRequest
): boolean {
  // Don't flush if already in progress
  if (state.inProgress) {
    return false;
  }
  
  // Don't flush twice in same compaction cycle
  if (request.preCompaction && state.flushedThisCycle) {
    return false;
  }
  
  // Always flush on manual or session end
  if (request.reason === 'manual' || request.reason === 'session_end') {
    return true;
  }
  
  // Flush on threshold or pending compaction
  return request.reason === 'threshold' || request.reason === 'compaction_pending';
}

/**
 * Build the flush prompt message
 */
export function buildFlushMessage(request: FlushRequest): TranscriptMessage {
  const content = request.preCompaction 
    ? FLUSH_SYSTEM_MESSAGE 
    : FLUSH_REMINDER_MESSAGE;
  
  return {
    id: `flush-${Date.now()}`,
    role: 'system',
    content,
    timestamp: new Date().toISOString(),
    metadata: {
      type: 'memory_flush',
      reason: request.reason,
      preCompaction: request.preCompaction,
    },
  };
}

/**
 * Parse memory updates from agent response
 */
export function parseFlushResponse(response: string): FlushResult {
  // Check for no-reply indicator
  if (response.includes('[NO_REPLY]') || response.trim() === '') {
    return {
      triggered: true,
      updates: [],
      noReply: true,
    };
  }
  
  // Extract memory blocks
  const memoryBlockRegex = /```memory\n([\s\S]*?)```/g;
  const updates: MemoryUpdate[] = [];
  
  let match;
  while ((match = memoryBlockRegex.exec(response)) !== null) {
    const content = match[1].trim();
    
    // Parse section header if present
    const sectionMatch = content.match(/^##\s+(.+)\n([\s\S]*)/);
    if (sectionMatch) {
      updates.push({
        section: sectionMatch[1].trim(),
        content: sectionMatch[2].trim(),
      });
    } else {
      // No section header, use default
      updates.push({
        section: 'Working Context',
        content,
      });
    }
  }
  
  // If no memory blocks found but response isn't NO_REPLY, 
  // check for inline section updates
  if (updates.length === 0) {
    const sectionRegex = /##\s+(.+)\n([\s\S]*?)(?=##\s+|$)/g;
    while ((match = sectionRegex.exec(response)) !== null) {
      updates.push({
        section: match[1].trim(),
        content: match[2].trim(),
      });
    }
  }
  
  return {
    triggered: true,
    updates,
    noReply: false,
  };
}

/**
 * Update flush state after flush completes
 */
export function updateFlushState(
  state: FlushState,
  _result: FlushResult,
  wasPreCompaction: boolean
): FlushState {
  return {
    inProgress: false,
    flushedThisCycle: wasPreCompaction ? true : state.flushedThisCycle,
    lastFlushAt: new Date(),
    flushCount: state.flushCount + 1,
  };
}

/**
 * Reset flush state for new compaction cycle
 */
export function resetFlushCycle(state: FlushState): FlushState {
  return {
    ...state,
    flushedThisCycle: false,
  };
}

/**
 * Check if response should be suppressed (NO_REPLY)
 */
export function shouldSuppressResponse(response: string): boolean {
  return response.includes('[NO_REPLY]') || 
         response.trim() === '' ||
         response.trim().toLowerCase() === 'no reply';
}

/**
 * Format flush result for logging
 */
export function formatFlushResult(result: FlushResult): string {
  if (result.error) {
    return `Flush failed: ${result.error}`;
  }
  
  if (result.noReply) {
    return 'Flush completed: No updates needed';
  }
  
  const sections = result.updates.map(u => u.section).join(', ');
  return `Flush completed: ${result.updates.length} update(s) to [${sections}]`;
}
