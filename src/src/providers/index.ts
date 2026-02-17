/**
 * LLM Providers module
 * Abstraction layer for LLM APIs
 */

// Placeholder - will be implemented in TASK-024+
export const providers = {
  claude: async () => { throw new Error('Not implemented'); },
  openai: async () => { throw new Error('Not implemented'); },
};

export interface LLMProvider {
  complete(prompt: string, options?: unknown): Promise<string>;
  extractJson<T>(prompt: string, schema: unknown): Promise<T>;
}
