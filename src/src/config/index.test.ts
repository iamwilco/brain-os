/**
 * Config module tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConfigSchema,
  ConfigError,
  loadConfig,
  validateConfig,
  getDefaultConfig,
  getConfig,
  setConfig,
  resetConfig,
  hasProvider,
} from './index.js';

describe('ConfigSchema', () => {
  it('should parse empty config with defaults', () => {
    const config = ConfigSchema.parse({});
    
    expect(config.vaultPath).toBe('./');
    expect(config.dbPath).toBe('./brain.db');
    expect(config.model).toBe('claude-sonnet-4-20250514');
    expect(config.maxTokens).toBe(4096);
    expect(config.logLevel).toBe('info');
    expect(config.logFormat).toBe('pretty');
    expect(config.dryRun).toBe(false);
  });

  it('should parse valid config values', () => {
    const config = ConfigSchema.parse({
      vaultPath: '/my/vault',
      dbPath: '/my/db.sqlite',
      anthropicApiKey: 'sk-ant-test',
      model: 'claude-3-opus',
      maxTokens: 8192,
      logLevel: 'debug',
      logFormat: 'json',
      dryRun: true,
    });

    expect(config.vaultPath).toBe('/my/vault');
    expect(config.dbPath).toBe('/my/db.sqlite');
    expect(config.anthropicApiKey).toBe('sk-ant-test');
    expect(config.model).toBe('claude-3-opus');
    expect(config.maxTokens).toBe(8192);
    expect(config.logLevel).toBe('debug');
    expect(config.logFormat).toBe('json');
    expect(config.dryRun).toBe(true);
  });

  it('should coerce string numbers to numbers', () => {
    const config = ConfigSchema.parse({
      maxTokens: '2048',
    });

    expect(config.maxTokens).toBe(2048);
  });

  it('should coerce string booleans to booleans', () => {
    const configTrue = ConfigSchema.parse({ dryRun: 'true' });
    expect(configTrue.dryRun).toBe(true);

    const configFalse = ConfigSchema.parse({ dryRun: 'false' });
    expect(configFalse.dryRun).toBe(false);
  });

  it('should reject invalid log level', () => {
    expect(() => ConfigSchema.parse({ logLevel: 'invalid' })).toThrow();
  });

  it('should reject maxTokens out of range', () => {
    expect(() => ConfigSchema.parse({ maxTokens: 0 })).toThrow();
    expect(() => ConfigSchema.parse({ maxTokens: 200000 })).toThrow();
  });
});

describe('ConfigError', () => {
  it('should format zod errors nicely', () => {
    const result = ConfigSchema.safeParse({ logLevel: 'invalid' });
    
    if (!result.success) {
      const error = ConfigError.fromZodError(result.error);
      expect(error.message).toContain('Configuration validation failed');
      expect(error.message).toContain('logLevel');
      expect(error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('validateConfig', () => {
  it('should validate valid config', () => {
    const config = validateConfig({
      vaultPath: '/test',
      logLevel: 'warn',
    });

    expect(config.vaultPath).toBe('/test');
    expect(config.logLevel).toBe('warn');
  });

  it('should throw ConfigError for invalid config', () => {
    expect(() => validateConfig({ logLevel: 'invalid' })).toThrow(ConfigError);
  });
});

describe('getDefaultConfig', () => {
  it('should return config with all defaults', () => {
    const config = getDefaultConfig();

    expect(config.vaultPath).toBe('./');
    expect(config.dbPath).toBe('./brain.db');
    expect(config.model).toBe('claude-sonnet-4-20250514');
    expect(config.maxTokens).toBe(4096);
    expect(config.logLevel).toBe('info');
    expect(config.logFormat).toBe('pretty');
    expect(config.dryRun).toBe(false);
    expect(config.anthropicApiKey).toBeUndefined();
    expect(config.openaiApiKey).toBeUndefined();
  });
});

describe('Config singleton', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('should return same instance on multiple calls', () => {
    const config1 = getConfig();
    const config2 = getConfig();

    expect(config1).toBe(config2);
  });

  it('should allow setting config programmatically', () => {
    setConfig({
      vaultPath: '/custom/vault',
      dbPath: './custom.db',
      model: 'gpt-4',
      maxTokens: 2000,
      logLevel: 'error',
      logFormat: 'json',
      dryRun: true,
    });

    const config = getConfig();
    expect(config.vaultPath).toBe('/custom/vault');
    expect(config.model).toBe('gpt-4');
    expect(config.dryRun).toBe(true);
  });

  it('should reset config on resetConfig call', () => {
    setConfig({
      vaultPath: '/custom',
      dbPath: './test.db',
      model: 'test',
      maxTokens: 100,
      logLevel: 'debug',
      logFormat: 'json',
      dryRun: true,
    });

    resetConfig();
    
    // After reset, getConfig will reload from env (which has defaults)
    const config = getConfig();
    expect(config.vaultPath).toBe('./');
  });
});

describe('hasProvider', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('should return false when no provider configured', () => {
    setConfig({
      vaultPath: './',
      dbPath: './brain.db',
      model: 'test',
      maxTokens: 4096,
      logLevel: 'info',
      logFormat: 'pretty',
      dryRun: false,
    });

    expect(hasProvider('anthropic')).toBe(false);
    expect(hasProvider('openai')).toBe(false);
  });

  it('should return true when anthropic configured', () => {
    setConfig({
      vaultPath: './',
      dbPath: './brain.db',
      anthropicApiKey: 'sk-ant-test',
      model: 'test',
      maxTokens: 4096,
      logLevel: 'info',
      logFormat: 'pretty',
      dryRun: false,
    });

    expect(hasProvider('anthropic')).toBe(true);
    expect(hasProvider('openai')).toBe(false);
  });

  it('should return true when openai configured', () => {
    setConfig({
      vaultPath: './',
      dbPath: './brain.db',
      openaiApiKey: 'sk-openai-test',
      model: 'test',
      maxTokens: 4096,
      logLevel: 'info',
      logFormat: 'pretty',
      dryRun: false,
    });

    expect(hasProvider('anthropic')).toBe(false);
    expect(hasProvider('openai')).toBe(true);
  });
});
