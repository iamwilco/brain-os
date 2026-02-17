/**
 * Token estimation module
 * 
 * Provides fast, accurate token counting for context window management.
 * Uses a character-based estimation with adjustments for different content types.
 * 
 * Target: ±10% accuracy, <50ms execution
 */

/**
 * Token estimation result
 */
export interface TokenEstimate {
  /** Estimated token count */
  tokens: number;
  /** Characters counted */
  characters: number;
  /** Estimation method used */
  method: 'chars' | 'words' | 'hybrid';
}

/**
 * Configuration for token estimation
 */
export interface TokenConfig {
  /** Average characters per token (default: 4 for English) */
  charsPerToken: number;
  /** Average words per token (default: 0.75) */
  wordsPerToken: number;
  /** Overhead tokens per message (role, formatting) */
  messageOverhead: number;
  /** Use hybrid estimation for better accuracy */
  useHybrid: boolean;
}

const DEFAULT_CONFIG: TokenConfig = {
  charsPerToken: 4,
  wordsPerToken: 0.75,
  messageOverhead: 4,
  useHybrid: true,
};

/**
 * Count words in text
 */
function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate tokens using character count
 * Fast method, ~±15% accuracy
 */
export function estimateByChars(text: string, charsPerToken = 4): number {
  if (!text) return 0;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens using word count
 * Slightly more accurate for natural language
 */
export function estimateByWords(text: string, wordsPerToken = 0.75): number {
  if (!text) return 0;
  const words = countWords(text);
  return Math.ceil(words / wordsPerToken);
}

/**
 * Hybrid estimation combining chars and words
 * Better accuracy for mixed content (code + prose)
 */
export function estimateHybrid(text: string, config: Partial<TokenConfig> = {}): number {
  if (!text) return 0;
  
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Character-based estimate
  const charEstimate = estimateByChars(text, cfg.charsPerToken);
  
  // Word-based estimate
  const wordEstimate = estimateByWords(text, cfg.wordsPerToken);
  
  // Detect content type and weight accordingly
  const codeIndicators = (text.match(/[{}[\]();=<>]/g) || []).length;
  const isCodeHeavy = codeIndicators > text.length * 0.02;
  
  if (isCodeHeavy) {
    // Code tends to have more tokens per character
    return Math.ceil(charEstimate * 1.1);
  }
  
  // For natural language, average the estimates
  return Math.ceil((charEstimate + wordEstimate) / 2);
}

/**
 * Estimate tokens for a string
 * Main entry point - uses hybrid estimation by default
 */
export function estimateTokens(
  text: string,
  config: Partial<TokenConfig> = {}
): TokenEstimate {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  if (!text) {
    return { tokens: 0, characters: 0, method: 'hybrid' };
  }
  
  const tokens = cfg.useHybrid
    ? estimateHybrid(text, cfg)
    : estimateByChars(text, cfg.charsPerToken);
  
  return {
    tokens,
    characters: text.length,
    method: cfg.useHybrid ? 'hybrid' : 'chars',
  };
}

/**
 * Message structure for token counting
 */
export interface TokenMessage {
  role: string;
  content: string;
  name?: string;
}

/**
 * Estimate tokens for a message array
 * Includes overhead for message formatting
 */
export function estimateMessagesTokens(
  messages: TokenMessage[],
  config: Partial<TokenConfig> = {}
): TokenEstimate {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  let totalTokens = 0;
  let totalChars = 0;
  
  for (const msg of messages) {
    // Message overhead (role, separators)
    totalTokens += cfg.messageOverhead;
    
    // Content tokens
    const contentEstimate = estimateTokens(msg.content, cfg);
    totalTokens += contentEstimate.tokens;
    totalChars += contentEstimate.characters;
    
    // Name field if present
    if (msg.name) {
      totalTokens += estimateTokens(msg.name, cfg).tokens;
    }
  }
  
  return {
    tokens: totalTokens,
    characters: totalChars,
    method: cfg.useHybrid ? 'hybrid' : 'chars',
  };
}

/**
 * Estimate tokens for tool definitions
 */
export function estimateToolsTokens(
  tools: Array<{ name: string; description: string; parameters?: unknown }>
): TokenEstimate {
  if (!tools || tools.length === 0) {
    return { tokens: 0, characters: 0, method: 'hybrid' };
  }
  
  let totalTokens = 0;
  let totalChars = 0;
  
  for (const tool of tools) {
    // Tool name and description
    const nameTokens = estimateTokens(tool.name);
    const descTokens = estimateTokens(tool.description);
    
    totalTokens += nameTokens.tokens + descTokens.tokens;
    totalChars += nameTokens.characters + descTokens.characters;
    
    // Parameters schema if present
    if (tool.parameters) {
      const paramStr = JSON.stringify(tool.parameters);
      const paramTokens = estimateTokens(paramStr);
      totalTokens += paramTokens.tokens;
      totalChars += paramTokens.characters;
    }
    
    // Tool formatting overhead
    totalTokens += 10;
  }
  
  return {
    tokens: totalTokens,
    characters: totalChars,
    method: 'hybrid',
  };
}

/**
 * Streaming token counter
 * Allows incremental token counting as content streams in
 */
export class StreamingTokenCounter {
  private buffer = '';
  private totalTokens = 0;
  private totalChars = 0;
  private config: TokenConfig;
  private flushThreshold: number;
  
  constructor(config: Partial<TokenConfig> = {}, flushThreshold = 100) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.flushThreshold = flushThreshold;
  }
  
  /**
   * Add chunk to counter
   */
  add(chunk: string): void {
    this.buffer += chunk;
    this.totalChars += chunk.length;
    
    // Flush buffer when threshold reached for efficiency
    if (this.buffer.length >= this.flushThreshold) {
      this.flush();
    }
  }
  
  /**
   * Flush buffer and update token count
   */
  flush(): void {
    if (this.buffer) {
      const estimate = estimateTokens(this.buffer, this.config);
      this.totalTokens += estimate.tokens;
      this.buffer = '';
    }
  }
  
  /**
   * Get current estimate
   */
  getEstimate(): TokenEstimate {
    // Include unflushed buffer
    const bufferTokens = this.buffer 
      ? estimateTokens(this.buffer, this.config).tokens 
      : 0;
    
    return {
      tokens: this.totalTokens + bufferTokens,
      characters: this.totalChars,
      method: this.config.useHybrid ? 'hybrid' : 'chars',
    };
  }
  
  /**
   * Reset counter
   */
  reset(): void {
    this.buffer = '';
    this.totalTokens = 0;
    this.totalChars = 0;
  }
}

/**
 * Estimate total context tokens
 * Combines system prompt, history, user message, and tools
 */
export function estimateContextTokens(params: {
  systemPrompt: string;
  messages: TokenMessage[];
  userMessage: string;
  tools?: Array<{ name: string; description: string; parameters?: unknown }>;
}): TokenEstimate {
  const { systemPrompt, messages, userMessage, tools } = params;
  
  let totalTokens = 0;
  let totalChars = 0;
  
  // System prompt
  const systemEstimate = estimateTokens(systemPrompt);
  totalTokens += systemEstimate.tokens;
  totalChars += systemEstimate.characters;
  
  // History messages
  const historyEstimate = estimateMessagesTokens(messages);
  totalTokens += historyEstimate.tokens;
  totalChars += historyEstimate.characters;
  
  // User message (with overhead)
  const userEstimate = estimateTokens(userMessage);
  totalTokens += userEstimate.tokens + DEFAULT_CONFIG.messageOverhead;
  totalChars += userEstimate.characters;
  
  // Tools
  if (tools && tools.length > 0) {
    const toolsEstimate = estimateToolsTokens(tools);
    totalTokens += toolsEstimate.tokens;
    totalChars += toolsEstimate.characters;
  }
  
  return {
    tokens: totalTokens,
    characters: totalChars,
    method: 'hybrid',
  };
}

/**
 * Check if context fits within window
 */
export function contextFitsWindow(
  tokenEstimate: number,
  contextWindow: number,
  reserveTokens: number
): { fits: boolean; available: number; overage: number } {
  const available = contextWindow - reserveTokens;
  const overage = tokenEstimate - available;
  
  return {
    fits: overage <= 0,
    available,
    overage: Math.max(0, overage),
  };
}
