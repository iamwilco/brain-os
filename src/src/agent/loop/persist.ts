/**
 * PERSIST Stage - Agent Loop Stage 4
 * 
 * Writes all state changes atomically.
 * 
 * Required Outputs:
 * - transcriptUpdated: boolean - Transcript written
 * - sessionUpdated: boolean - Session metadata updated
 * - memoryUpdated: boolean - Memory written (if flush)
 */

import { appendToTranscript, updateSession, type TranscriptMessage } from '../session.js';
import { applyMemoryUpdates, type MemoryUpdate } from '../memory.js';
import { releaseSessionLock } from '../session-lock.js';
import type { IntakeOutput } from './intake.js';
import type { ExecuteOutput } from './execute.js';

/**
 * PERSIST stage input
 */
export interface PersistInput {
  /** Output from INTAKE stage */
  intake: IntakeOutput;
  /** User message */
  message: string;
  /** Output from EXECUTE stage */
  execute: ExecuteOutput;
  /** Whether memory flush is needed */
  flushMemory?: boolean;
  /** Memory updates to apply */
  memoryUpdates?: MemoryUpdate[];
}

/**
 * PERSIST stage output
 */
export interface PersistOutput {
  /** Whether transcript was updated */
  transcriptUpdated: boolean;
  /** Whether session metadata was updated */
  sessionUpdated: boolean;
  /** Whether memory was updated */
  memoryUpdated: boolean;
  /** Whether lock was released */
  lockReleased: boolean;
  /** Errors that occurred (non-fatal) */
  errors: string[];
}

/**
 * PERSIST stage configuration
 */
export interface PersistConfig {
  /** Max retries for disk writes */
  maxWriteRetries: number;
  /** Delay between retries (ms) */
  retryDelay: number;
}

const DEFAULT_CONFIG: PersistConfig = {
  maxWriteRetries: 3,
  retryDelay: 100,
};

/**
 * Sleep for specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with delay
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delay: number
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Build transcript messages from execute output
 */
function buildTranscriptMessages(
  message: string,
  execute: ExecuteOutput
): Array<Omit<TranscriptMessage, 'id'>> {
  const timestamp = new Date().toISOString();
  const messages: Array<Omit<TranscriptMessage, 'id'>> = [];
  
  // User message
  messages.push({
    role: 'user',
    content: message,
    timestamp,
  });
  
  // Tool calls and results (interleaved)
  if (execute.toolCalls.length > 0) {
    // Assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: '',
      timestamp,
      metadata: {
        toolCalls: execute.toolCalls,
      },
    });
    
    // Tool results (stored as system messages with tool metadata)
    for (const result of execute.toolResults) {
      messages.push({
        role: 'system',
        content: result.error 
          ? `[Tool Error: ${result.name}] ${result.error}` 
          : `[Tool Result: ${result.name}] ${JSON.stringify(result.result)}`,
        timestamp,
        metadata: {
          toolCallId: result.toolCallId,
          toolName: result.name,
          duration: result.duration,
          toolResult: true,
        },
      });
    }
  }
  
  // Final assistant response
  if (execute.response) {
    messages.push({
      role: 'assistant',
      content: execute.response,
      timestamp,
      metadata: {
        usage: execute.usage,
      },
    });
  }
  
  return messages;
}

/**
 * Execute PERSIST stage
 * 
 * Writes transcript, updates session, releases lock.
 * 
 * @param input - Stage input
 * @param config - Optional configuration overrides
 * @returns Stage output with status flags
 */
export async function persist(
  input: PersistInput,
  config: Partial<PersistConfig> = {}
): Promise<PersistOutput> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { intake, message, execute, flushMemory, memoryUpdates } = input;
  
  const errors: string[] = [];
  let transcriptUpdated = false;
  let sessionUpdated = false;
  let memoryUpdated = false;
  let lockReleased = false;
  
  try {
    // Step 1: Append to transcript
    const transcriptMessages = buildTranscriptMessages(message, execute);
    
    for (const msg of transcriptMessages) {
      try {
        await withRetry(
          () => appendToTranscript(intake.agentPath, intake.sessionId, msg),
          cfg.maxWriteRetries,
          cfg.retryDelay
        );
      } catch (error) {
        const errorMsg = `Failed to append to transcript: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
      }
    }
    transcriptUpdated = errors.length === 0;
    
    // Step 2: Update session metadata
    try {
      await withRetry(
        () => updateSession(intake.agentPath, intake.sessionId, {
          updatedAt: new Date().toISOString(),
          messageCount: (intake.session.messageCount || 0) + transcriptMessages.length,
        }),
        cfg.maxWriteRetries,
        cfg.retryDelay
      );
      sessionUpdated = true;
    } catch (error) {
      const errorMsg = `Failed to update session metadata: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
    }
    
    // Step 3: Write memory (if flush triggered)
    if (flushMemory && memoryUpdates && memoryUpdates.length > 0) {
      try {
        await withRetry(
          () => applyMemoryUpdates(intake.agentPath, memoryUpdates),
          cfg.maxWriteRetries,
          cfg.retryDelay
        );
        memoryUpdated = true;
      } catch (error) {
        const errorMsg = `Failed to update memory: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        // Memory write failure is non-fatal
      }
    }
    
  } finally {
    // Step 4: Always release lock
    try {
      lockReleased = releaseSessionLock(intake.sessionId, intake.runId);
      if (!lockReleased) {
        errors.push('Failed to release session lock (may have timed out)');
      }
    } catch (error) {
      const errorMsg = `Error releasing lock: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      // Force release attempt
      try {
        releaseSessionLock(intake.sessionId, intake.runId);
        lockReleased = true;
      } catch {
        // Lock release completely failed
      }
    }
  }
  
  return {
    transcriptUpdated,
    sessionUpdated,
    memoryUpdated,
    lockReleased,
    errors,
  };
}

/**
 * Check if persist was fully successful
 */
export function isPersistSuccess(output: PersistOutput): boolean {
  return output.transcriptUpdated && 
         output.sessionUpdated && 
         output.lockReleased &&
         output.errors.length === 0;
}

/**
 * Check if persist had critical failures
 */
export function hasCriticalFailures(output: PersistOutput): boolean {
  return !output.lockReleased || !output.transcriptUpdated;
}
