/**
 * Session compaction
 * Summarizes long conversation sessions to maintain token budget
 * 
 * Supports both LLM-based and local summarization.
 */

import type { TranscriptMessage } from './session.js';
import { readTranscript, appendToTranscript } from './session.js';
import { estimateTokens } from './prompt.js';

/**
 * LLM handler for compaction summarization
 */
export type CompactionLLMHandler = (prompt: string) => Promise<string>;

/**
 * Compaction prompt template
 */
export const COMPACTION_PROMPT = `
You are summarizing a conversation to preserve context while reducing token usage.

CONVERSATION TO SUMMARIZE:
{{MESSAGES}}

Create a concise summary that preserves:
1. Key decisions and conclusions
2. Important facts and context learned
3. Action items and next steps
4. Any critical information the assistant needs to remember

Format your summary as:
## Summary
[2-3 sentence overview]

## Key Points
- [Important point 1]
- [Important point 2]
...

## Context for Next Turn
[Any context needed to continue the conversation naturally]

Keep the total summary under 500 tokens.
`.trim();

/**
 * Compaction configuration
 */
export interface CompactionConfig {
  maxTokens: number;
  summaryTokens: number;
  preserveRecent: number;
  preserveImportant: boolean;
  /** Optional LLM handler for generating summaries */
  llmHandler?: CompactionLLMHandler;
  /** Use LLM for summarization (falls back to local if handler fails) */
  useLLM: boolean;
}

/**
 * Default compaction configuration
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  maxTokens: 4000,
  summaryTokens: 500,
  preserveRecent: 5,
  preserveImportant: true,
  useLLM: false,
};

/**
 * Compaction result
 */
export interface CompactionResult {
  messages: TranscriptMessage[];
  summary: string | null;
  originalCount: number;
  compactedCount: number;
  tokensUsed: number;
  wasCompacted: boolean;
}

/**
 * Important message markers
 */
const IMPORTANT_MARKERS = [
  'important',
  'remember',
  'note:',
  'key point',
  'critical',
  'decision:',
  'action:',
  'todo:',
  'agreed:',
  'confirmed:',
];

/**
 * Check if message is important
 */
export function isImportantMessage(message: TranscriptMessage): boolean {
  const content = message.content.toLowerCase();
  return IMPORTANT_MARKERS.some(marker => content.includes(marker));
}

/**
 * Calculate total tokens for messages
 */
export function calculateMessageTokens(messages: TranscriptMessage[]): number {
  return messages.reduce((sum, msg) => {
    const roleTokens = estimateTokens(msg.role);
    const contentTokens = estimateTokens(msg.content);
    return sum + roleTokens + contentTokens + 4; // overhead for formatting
  }, 0);
}

/**
 * Extract key points from messages for summary
 */
export function extractKeyPoints(messages: TranscriptMessage[]): string[] {
  const keyPoints: string[] = [];
  
  for (const msg of messages) {
    // Extract explicitly marked important content
    if (isImportantMessage(msg)) {
      const lines = msg.content.split('\n');
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (IMPORTANT_MARKERS.some(m => lower.includes(m))) {
          keyPoints.push(line.trim());
        }
      }
    }
    
    // Extract questions that were asked
    if (msg.role === 'user' && msg.content.includes('?')) {
      const questions = msg.content.split(/[.!]/).filter(s => s.includes('?'));
      for (const q of questions.slice(0, 2)) {
        keyPoints.push(`Q: ${q.trim()}`);
      }
    }
    
    // Extract action items
    const actionMatch = msg.content.match(/(?:- \[ \]|TODO:|ACTION:)\s*(.+)/gi);
    if (actionMatch) {
      keyPoints.push(...actionMatch.slice(0, 3));
    }
  }
  
  return [...new Set(keyPoints)].slice(0, 10);
}

/**
 * Generate summary from messages
 */
export function generateSummary(
  messages: TranscriptMessage[],
  maxTokens: number = 500
): string {
  const lines: string[] = [];
  
  lines.push('[Session Summary]');
  lines.push('');
  
  // Message count
  const userCount = messages.filter(m => m.role === 'user').length;
  const assistantCount = messages.filter(m => m.role === 'assistant').length;
  lines.push(`Messages: ${userCount} user, ${assistantCount} assistant`);
  lines.push('');
  
  // Time range
  if (messages.length > 0) {
    const first = messages[0].timestamp;
    const last = messages[messages.length - 1].timestamp;
    lines.push(`Period: ${first.slice(0, 10)} to ${last.slice(0, 10)}`);
    lines.push('');
  }
  
  // Key points
  const keyPoints = extractKeyPoints(messages);
  if (keyPoints.length > 0) {
    lines.push('Key Points:');
    for (const point of keyPoints) {
      lines.push(`- ${point}`);
    }
    lines.push('');
  }
  
  // Topics discussed (extract from first messages)
  const topics = new Set<string>();
  for (const msg of messages.slice(0, 10)) {
    const words = msg.content.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 6 && !['should', 'would', 'could', 'please', 'thanks'].includes(word)) {
        topics.add(word);
      }
    }
  }
  
  if (topics.size > 0) {
    lines.push(`Topics: ${[...topics].slice(0, 10).join(', ')}`);
  }
  
  // Truncate if needed
  let summary = lines.join('\n');
  const tokens = estimateTokens(summary);
  
  if (tokens > maxTokens) {
    const ratio = maxTokens / tokens;
    const targetLength = Math.floor(summary.length * ratio * 0.9);
    summary = summary.slice(0, targetLength) + '\n\n[...summary truncated...]';
  }
  
  return summary;
}

/**
 * Format messages for LLM prompt
 */
export function formatMessagesForPrompt(messages: TranscriptMessage[]): string {
  return messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
}

/**
 * Build the compaction prompt for LLM
 */
export function buildCompactionPrompt(messages: TranscriptMessage[]): string {
  const formattedMessages = formatMessagesForPrompt(messages);
  return COMPACTION_PROMPT.replace('{{MESSAGES}}', formattedMessages);
}

/**
 * Generate summary using LLM
 */
export async function generateLLMSummary(
  messages: TranscriptMessage[],
  llmHandler: CompactionLLMHandler,
  maxTokens: number = 500
): Promise<string> {
  const prompt = buildCompactionPrompt(messages);
  
  try {
    const response = await llmHandler(prompt);
    
    // Validate and truncate if needed
    const tokens = estimateTokens(response);
    if (tokens > maxTokens) {
      const ratio = maxTokens / tokens;
      const targetLength = Math.floor(response.length * ratio * 0.9);
      return response.slice(0, targetLength) + '\n\n[...summary truncated...]';
    }
    
    return response;
  } catch (error) {
    // Fall back to local summary on error
    console.warn('LLM summary failed, using local fallback:', error);
    return generateSummary(messages, maxTokens);
  }
}

/**
 * Select messages to preserve
 */
export function selectMessagesToPreserve(
  messages: TranscriptMessage[],
  config: CompactionConfig
): TranscriptMessage[] {
  const preserved: TranscriptMessage[] = [];
  const seenIds = new Set<string>();
  
  // Always preserve recent messages
  const recentMessages = messages.slice(-config.preserveRecent);
  for (const msg of recentMessages) {
    preserved.push(msg);
    seenIds.add(msg.id);
  }
  
  // Preserve important messages if enabled
  if (config.preserveImportant) {
    for (const msg of messages) {
      if (!seenIds.has(msg.id) && isImportantMessage(msg)) {
        preserved.push(msg);
        seenIds.add(msg.id);
      }
    }
  }
  
  // Sort by timestamp
  preserved.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  
  return preserved;
}

/**
 * Compact messages to fit within token budget (sync version, local summary only)
 * @deprecated Use compactMessages for async/LLM support
 */
export function compactMessagesSync(
  messages: TranscriptMessage[],
  config: Partial<CompactionConfig> = {}
): CompactionResult {
  const cfg: CompactionConfig = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  const originalCount = messages.length;
  const originalTokens = calculateMessageTokens(messages);
  
  // Check if compaction is needed
  if (originalTokens <= cfg.maxTokens) {
    return {
      messages,
      summary: null,
      originalCount,
      compactedCount: originalCount,
      tokensUsed: originalTokens,
      wasCompacted: false,
    };
  }
  
  // Get messages to compact (excluding recent)
  const toCompact = messages.slice(0, -cfg.preserveRecent);
  const recentMessages = messages.slice(-cfg.preserveRecent);
  
  // Generate summary of compacted messages (local)
  const summary = generateSummary(toCompact, cfg.summaryTokens);
  
  // Select important messages from compacted range
  const preserved = selectMessagesToPreserve(messages, cfg);
  
  // Create summary message
  const summaryMessage: TranscriptMessage = {
    id: `summary-${Date.now()}`,
    role: 'system',
    content: summary,
    timestamp: new Date().toISOString(),
    metadata: { type: 'compaction_summary', method: 'local' },
  };
  
  // Combine: summary + preserved (excluding recent duplicates)
  const preservedOlder = preserved.filter(
    m => !recentMessages.some(r => r.id === m.id)
  );
  
  const compactedMessages = [summaryMessage, ...preservedOlder, ...recentMessages];
  const tokensUsed = calculateMessageTokens(compactedMessages);
  
  return {
    messages: compactedMessages,
    summary,
    originalCount,
    compactedCount: compactedMessages.length,
    tokensUsed,
    wasCompacted: true,
  };
}

/**
 * Compact messages to fit within token budget (async, supports LLM)
 */
export async function compactMessages(
  messages: TranscriptMessage[],
  config: Partial<CompactionConfig> = {}
): Promise<CompactionResult> {
  const cfg: CompactionConfig = { ...DEFAULT_COMPACTION_CONFIG, ...config };
  const originalCount = messages.length;
  const originalTokens = calculateMessageTokens(messages);
  
  // Check if compaction is needed
  if (originalTokens <= cfg.maxTokens) {
    return {
      messages,
      summary: null,
      originalCount,
      compactedCount: originalCount,
      tokensUsed: originalTokens,
      wasCompacted: false,
    };
  }
  
  // Get messages to compact (excluding recent)
  const toCompact = messages.slice(0, -cfg.preserveRecent);
  const recentMessages = messages.slice(-cfg.preserveRecent);
  
  // Generate summary - use LLM if configured and handler provided
  let summary: string;
  let method: 'llm' | 'local' = 'local';
  
  if (cfg.useLLM && cfg.llmHandler) {
    summary = await generateLLMSummary(toCompact, cfg.llmHandler, cfg.summaryTokens);
    method = 'llm';
  } else {
    summary = generateSummary(toCompact, cfg.summaryTokens);
  }
  
  // Select important messages from compacted range
  const preserved = selectMessagesToPreserve(messages, cfg);
  
  // Create summary message
  const summaryMessage: TranscriptMessage = {
    id: `summary-${Date.now()}`,
    role: 'system',
    content: summary,
    timestamp: new Date().toISOString(),
    metadata: { type: 'compaction_summary', method },
  };
  
  // Combine: summary + preserved (excluding recent duplicates)
  const preservedOlder = preserved.filter(
    m => !recentMessages.some(r => r.id === m.id)
  );
  
  const compactedMessages = [summaryMessage, ...preservedOlder, ...recentMessages];
  const tokensUsed = calculateMessageTokens(compactedMessages);
  
  return {
    messages: compactedMessages,
    summary,
    originalCount,
    compactedCount: compactedMessages.length,
    tokensUsed,
    wasCompacted: true,
  };
}

/**
 * Check if session needs compaction
 */
export function needsCompaction(
  messages: TranscriptMessage[],
  maxTokens: number = DEFAULT_COMPACTION_CONFIG.maxTokens
): boolean {
  return calculateMessageTokens(messages) > maxTokens;
}

/**
 * Compact session transcript from file
 */
export async function compactSessionTranscript(
  agentPath: string,
  sessionId: string,
  config: Partial<CompactionConfig> = {}
): Promise<CompactionResult> {
  const messages = await readTranscript(agentPath, sessionId);
  const result = await compactMessages(messages, config);
  
  // If compacted, append a compaction marker
  if (result.wasCompacted) {
    await appendToTranscript(agentPath, sessionId, {
      role: 'system',
      content: `[Compacted ${result.originalCount - result.compactedCount} messages at ${new Date().toISOString()}]`,
    });
  }
  
  return result;
}

/**
 * Get conversation history within token budget
 */
export function getHistoryWithinBudget(
  messages: TranscriptMessage[],
  maxTokens: number
): TranscriptMessage[] {
  // Work backwards from most recent
  const result: TranscriptMessage[] = [];
  let tokenCount = 0;
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.role) + estimateTokens(msg.content) + 4;
    
    if (tokenCount + msgTokens > maxTokens) {
      break;
    }
    
    result.unshift(msg);
    tokenCount += msgTokens;
  }
  
  return result;
}

/**
 * Format compacted history for prompt injection
 */
export function formatCompactedHistory(result: CompactionResult): string {
  const lines: string[] = [];
  
  if (result.summary) {
    lines.push(result.summary);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  for (const msg of result.messages) {
    if (msg.role === 'system' && msg.content.startsWith('[Session Summary]')) {
      continue; // Skip summary message in formatted output
    }
    lines.push(`${msg.role.toUpperCase()}: ${msg.content}`);
    lines.push('');
  }
  
  return lines.join('\n');
}
