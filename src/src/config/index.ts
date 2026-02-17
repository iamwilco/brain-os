/**
 * Configuration module
 * Handles loading and validating configuration from environment
 */

import { z, ZodError } from 'zod';
import dotenv from 'dotenv';
import { resolve } from 'path';

/**
 * Configuration schema with zod validation
 * All options have sensible defaults
 */
export const ConfigSchema = z.object({
  // Vault Configuration
  vaultPath: z
    .string()
    .default('./')
    .describe('Path to the Obsidian vault'),
  dbPath: z
    .string()
    .default('./brain.db')
    .describe('Path to the SQLite database'),
  
  // LLM Provider Configuration
  anthropicApiKey: z
    .string()
    .optional()
    .describe('Anthropic API key for Claude'),
  openaiApiKey: z
    .string()
    .optional()
    .describe('OpenAI API key'),
  model: z
    .string()
    .default('claude-sonnet-4-20250514')
    .describe('Default LLM model to use'),
  maxTokens: z
    .coerce
    .number()
    .min(1)
    .max(100000)
    .default(4096)
    .describe('Maximum tokens for LLM responses'),
  
  // Logging Configuration
  logLevel: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info')
    .describe('Logging verbosity level'),
  logFormat: z
    .enum(['json', 'pretty'])
    .default('pretty')
    .describe('Log output format'),
  
  // Feature Flags
  dryRun: z
    .union([z.boolean(), z.string()])
    .transform((val) => {
      if (typeof val === 'boolean') return val;
      return val.toLowerCase() === 'true' || val === '1';
    })
    .default(false)
    .describe('Run without making changes'),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Configuration error with helpful messages
 */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[] = []
  ) {
    super(message);
    this.name = 'ConfigError';
  }

  static fromZodError(error: ZodError): ConfigError {
    const messages = error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    );
    return new ConfigError(
      `Configuration validation failed:\n${messages.join('\n')}`,
      error.issues
    );
  }
}

/**
 * Load .env file from specified path or default locations
 */
export function loadEnvFile(envPath?: string): void {
  if (envPath) {
    dotenv.config({ path: resolve(envPath) });
  } else {
    // Try multiple locations
    dotenv.config({ path: resolve(process.cwd(), '.env') });
    dotenv.config({ path: resolve(process.cwd(), '.env.local') });
  }
}

/**
 * Build raw config object from environment variables
 */
function buildRawConfig(): Record<string, unknown> {
  return {
    vaultPath: process.env.BRAIN_VAULT_PATH,
    dbPath: process.env.BRAIN_DB_PATH,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    model: process.env.BRAIN_MODEL,
    maxTokens: process.env.BRAIN_MAX_TOKENS,
    logLevel: process.env.BRAIN_LOG_LEVEL,
    logFormat: process.env.BRAIN_LOG_FORMAT,
    dryRun: process.env.BRAIN_DRY_RUN,
  };
}

/**
 * Load and validate configuration from environment
 * @param envPath Optional path to .env file
 * @throws ConfigError if validation fails
 */
export function loadConfig(envPath?: string): Config {
  loadEnvFile(envPath);
  
  const rawConfig = buildRawConfig();
  const result = ConfigSchema.safeParse(rawConfig);
  
  if (!result.success) {
    throw ConfigError.fromZodError(result.error);
  }
  
  return result.data;
}

/**
 * Validate a partial config object
 */
export function validateConfig(config: unknown): Config {
  const result = ConfigSchema.safeParse(config);
  
  if (!result.success) {
    throw ConfigError.fromZodError(result.error);
  }
  
  return result.data;
}

/**
 * Get default configuration values
 */
export function getDefaultConfig(): Config {
  return ConfigSchema.parse({});
}

// Singleton config instance
let _config: Config | null = null;

/**
 * Get the global configuration instance (singleton)
 * Loads from environment on first access
 */
export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Set the global configuration instance
 * Useful for testing or programmatic configuration
 */
export function setConfig(config: Config): void {
  _config = validateConfig(config);
}

/**
 * Reset the global configuration instance
 * Forces reload on next getConfig() call
 */
export function resetConfig(): void {
  _config = null;
}

/**
 * Check if a specific provider is configured
 */
export function hasProvider(provider: 'anthropic' | 'openai'): boolean {
  const config = getConfig();
  switch (provider) {
    case 'anthropic':
      return !!config.anthropicApiKey;
    case 'openai':
      return !!config.openaiApiKey;
    default:
      return false;
  }
}
