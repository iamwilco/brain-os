/**
 * Agent prompt assembly
 * Injects AGENT.md, CONTEXT.md, and MEMORY.md into prompts with token limits
 */

import { loadAgentDefinition, type AgentDefinition } from './parser.js';
import { loadMemory, type AgentMemory } from './memory.js';
import { loadContext } from './context.js';
import { buildSystemPrompt } from './chat.js';

/**
 * Token estimation (rough: ~4 chars per token)
 */
const CHARS_PER_TOKEN = 4;

/**
 * Default token limits
 */
export const DEFAULT_TOKEN_LIMITS = {
  total: 8000,
  agent: 2000,
  context: 3000,
  memory: 2000,
  conversation: 1000,
};

/**
 * Token limit configuration
 */
export interface TokenLimits {
  total: number;
  agent: number;
  context: number;
  memory: number;
  conversation: number;
}

/**
 * Prompt component
 */
export interface PromptComponent {
  name: string;
  content: string;
  tokens: number;
  truncated: boolean;
}

/**
 * Assembled prompt
 */
export interface AssembledPrompt {
  systemPrompt: string;
  components: PromptComponent[];
  totalTokens: number;
  withinLimit: boolean;
}

/**
 * Estimate token count from string
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Truncate text to fit token limit
 */
export function truncateToTokenLimit(
  text: string,
  maxTokens: number
): { text: string; truncated: boolean } {
  const currentTokens = estimateTokens(text);
  
  if (currentTokens <= maxTokens) {
    return { text, truncated: false };
  }
  
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const truncated = text.slice(0, maxChars);
  
  // Try to truncate at a line boundary
  const lastNewline = truncated.lastIndexOf('\n');
  if (lastNewline > maxChars * 0.8) {
    return {
      text: truncated.slice(0, lastNewline) + '\n\n[...truncated...]',
      truncated: true,
    };
  }
  
  return {
    text: truncated + '\n\n[...truncated...]',
    truncated: true,
  };
}

/**
 * Format agent definition for prompt
 */
export function formatAgentForPrompt(agent: AgentDefinition): string {
  return buildSystemPrompt(agent);
}

/**
 * Format memory for prompt
 */
export function formatMemoryForPrompt(memory: AgentMemory): string {
  const lines: string[] = [];
  
  lines.push('## Working Memory');
  lines.push('');
  
  for (const section of memory.sections) {
    if (section.content) {
      lines.push(`### ${section.title}`);
      lines.push('');
      lines.push(section.content);
      lines.push('');
    }
  }
  
  return lines.join('\n');
}

/**
 * Format context for prompt
 */
export function formatContextForPrompt(contextMd: string): string {
  // Remove frontmatter for injection
  const bodyMatch = contextMd.match(/^---[\s\S]*?---\n([\s\S]*)$/);
  if (bodyMatch) {
    return bodyMatch[1].trim();
  }
  return contextMd;
}

/**
 * Load and format agent component
 */
async function loadAgentComponent(
  agentPath: string,
  maxTokens: number
): Promise<PromptComponent | null> {
  const agent = await loadAgentDefinition(agentPath);
  if (!agent) return null;
  
  const content = formatAgentForPrompt(agent);
  const { text, truncated } = truncateToTokenLimit(content, maxTokens);
  
  return {
    name: 'agent',
    content: text,
    tokens: estimateTokens(text),
    truncated,
  };
}

/**
 * Load and format memory component
 */
async function loadMemoryComponent(
  agentPath: string,
  maxTokens: number
): Promise<PromptComponent | null> {
  const memory = await loadMemory(agentPath);
  if (!memory) return null;
  
  const content = formatMemoryForPrompt(memory);
  const { text, truncated } = truncateToTokenLimit(content, maxTokens);
  
  return {
    name: 'memory',
    content: text,
    tokens: estimateTokens(text),
    truncated,
  };
}

/**
 * Load and format context component
 */
async function loadContextComponent(
  agentPath: string,
  maxTokens: number
): Promise<PromptComponent | null> {
  const contextMd = await loadContext(agentPath);
  if (!contextMd) return null;
  
  const content = formatContextForPrompt(contextMd);
  const { text, truncated } = truncateToTokenLimit(content, maxTokens);
  
  return {
    name: 'context',
    content: text,
    tokens: estimateTokens(text),
    truncated,
  };
}

/**
 * Assemble full system prompt from components
 */
export async function assemblePrompt(
  agentPath: string,
  limits: Partial<TokenLimits> = {}
): Promise<AssembledPrompt> {
  const tokenLimits: TokenLimits = { ...DEFAULT_TOKEN_LIMITS, ...limits };
  const components: PromptComponent[] = [];
  
  // Load agent definition (required)
  const agentComponent = await loadAgentComponent(agentPath, tokenLimits.agent);
  if (agentComponent) {
    components.push(agentComponent);
  }
  
  // Load memory (optional)
  const memoryComponent = await loadMemoryComponent(agentPath, tokenLimits.memory);
  if (memoryComponent) {
    components.push(memoryComponent);
  }
  
  // Load context (optional)
  const contextComponent = await loadContextComponent(agentPath, tokenLimits.context);
  if (contextComponent) {
    components.push(contextComponent);
  }
  
  // Build final system prompt
  const sections: string[] = [];
  
  for (const component of components) {
    if (component.content) {
      sections.push(component.content);
    }
  }
  
  const systemPrompt = sections.join('\n\n---\n\n');
  const totalTokens = estimateTokens(systemPrompt);
  
  return {
    systemPrompt,
    components,
    totalTokens,
    withinLimit: totalTokens <= tokenLimits.total,
  };
}

/**
 * Assemble prompt with conversation history
 */
export async function assemblePromptWithHistory(
  agentPath: string,
  conversationHistory: string,
  limits: Partial<TokenLimits> = {}
): Promise<AssembledPrompt> {
  const tokenLimits: TokenLimits = { ...DEFAULT_TOKEN_LIMITS, ...limits };
  
  // Get base prompt
  const basePrompt = await assemblePrompt(agentPath, limits);
  
  // Calculate remaining tokens for conversation
  const remainingTokens = tokenLimits.total - basePrompt.totalTokens;
  const conversationLimit = Math.min(remainingTokens, tokenLimits.conversation);
  
  // Truncate conversation if needed
  const { text: truncatedHistory, truncated } = truncateToTokenLimit(
    conversationHistory,
    conversationLimit
  );
  
  if (truncatedHistory) {
    basePrompt.components.push({
      name: 'conversation',
      content: truncatedHistory,
      tokens: estimateTokens(truncatedHistory),
      truncated,
    });
  }
  
  // Recalculate totals
  basePrompt.totalTokens = basePrompt.components.reduce(
    (sum, c) => sum + c.tokens,
    0
  );
  basePrompt.withinLimit = basePrompt.totalTokens <= tokenLimits.total;
  
  return basePrompt;
}

/**
 * Get prompt stats summary
 */
export function getPromptStats(prompt: AssembledPrompt): string {
  const lines: string[] = [];
  
  lines.push('Prompt Stats:');
  for (const component of prompt.components) {
    const status = component.truncated ? ' (truncated)' : '';
    lines.push(`  ${component.name}: ${component.tokens} tokens${status}`);
  }
  lines.push(`  Total: ${prompt.totalTokens} tokens`);
  lines.push(`  Within limit: ${prompt.withinLimit}`);
  
  return lines.join('\n');
}

/**
 * Quick function to get ready-to-use system prompt
 */
export async function getSystemPrompt(
  agentPath: string,
  options: {
    includeMemory?: boolean;
    includeContext?: boolean;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const limits: Partial<TokenLimits> = {};
  
  if (options.maxTokens) {
    limits.total = options.maxTokens;
  }
  
  if (!options.includeMemory) {
    limits.memory = 0;
  }
  
  if (!options.includeContext) {
    limits.context = 0;
  }
  
  const prompt = await assemblePrompt(agentPath, limits);
  return prompt.systemPrompt;
}
