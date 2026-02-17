/**
 * Agent scope enforcement tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  globToRegex,
  normalizePath,
  matchesScope,
  checkAccess,
  formatViolation,
  logViolation,
  createScopeError,
  ScopeEnforcer,
  createScopeEnforcer,
  isWithinScope,
  validatePaths,
  type ScopeViolation,
} from './scope.js';

describe('globToRegex', () => {
  it('should convert ** to match any path', () => {
    const regex = globToRegex('30_Projects/**');
    expect(regex.test('30_Projects/Brain/file.md')).toBe(true);
    expect(regex.test('30_Projects/Other/sub/file.md')).toBe(true);
  });

  it('should convert * to match single segment', () => {
    const regex = globToRegex('30_Projects/*/file.md');
    expect(regex.test('30_Projects/Brain/file.md')).toBe(true);
    expect(regex.test('30_Projects/Brain/sub/file.md')).toBe(false);
  });

  it('should escape special regex characters', () => {
    const regex = globToRegex('path.with.dots/**');
    expect(regex.test('path.with.dots/file')).toBe(true);
  });
});

describe('normalizePath', () => {
  it('should remove trailing slashes', () => {
    expect(normalizePath('/path/to/dir/')).toBe('/path/to/dir');
    expect(normalizePath('/path/to/dir///')).toBe('/path/to/dir');
  });

  it('should resolve relative paths with base', () => {
    const result = normalizePath('subdir/file.md', '/base/path');
    expect(result).toBe('/base/path/subdir/file.md');
  });

  it('should keep absolute paths unchanged', () => {
    expect(normalizePath('/absolute/path')).toBe('/absolute/path');
  });
});

describe('matchesScope', () => {
  it('should allow ** scope (all files)', () => {
    expect(matchesScope('/any/path/file.md', '**/*')).toBe(true);
    expect(matchesScope('/other/path', '**')).toBe(true);
  });

  it('should match path prefix', () => {
    expect(matchesScope('/vault/30_Projects/Brain/file.md', '/vault/30_Projects/Brain')).toBe(true);
    expect(matchesScope('/vault/30_Projects/Other/file.md', '/vault/30_Projects/Brain')).toBe(false);
  });

  it('should match glob patterns', () => {
    const basePath = '/vault';
    expect(matchesScope('/vault/30_Projects/Brain/file.md', '30_Projects/Brain/**', basePath)).toBe(true);
    expect(matchesScope('/vault/40_Brain/file.md', '30_Projects/Brain/**', basePath)).toBe(false);
  });

  it('should handle relative paths', () => {
    const basePath = '/vault';
    expect(matchesScope('/vault/30_Projects/Test/file.md', '30_Projects/Test/**', basePath)).toBe(true);
  });
});

describe('checkAccess', () => {
  it('should return allowed for valid access', () => {
    const result = checkAccess(
      'agent_test',
      '30_Projects/Brain/**',
      '/vault/30_Projects/Brain/file.md',
      '/vault'
    );

    expect(result.allowed).toBe(true);
    expect(result.violation).toBeUndefined();
  });

  it('should return violation for invalid access', () => {
    const result = checkAccess(
      'agent_test',
      '30_Projects/Brain/**',
      '/vault/40_Brain/file.md',
      '/vault'
    );

    expect(result.allowed).toBe(false);
    expect(result.violation).toBeDefined();
    expect(result.violation?.agentId).toBe('agent_test');
    expect(result.violation?.severity).toBe('error');
  });
});

describe('formatViolation', () => {
  it('should format violation for logging', () => {
    const violation: ScopeViolation = {
      agentId: 'agent_test',
      attemptedPath: '/path/to/file',
      allowedScope: '30_Projects/**',
      timestamp: '2026-02-01T12:00:00Z',
      severity: 'error',
      message: 'Access denied',
    };

    const formatted = formatViolation(violation);

    expect(formatted).toContain('[ERROR]');
    expect(formatted).toContain('2026-02-01');
    expect(formatted).toContain('Access denied');
  });
});

describe('createScopeError', () => {
  it('should create error with violation message', () => {
    const violation: ScopeViolation = {
      agentId: 'agent_test',
      attemptedPath: '/path',
      allowedScope: 'scope',
      timestamp: '',
      severity: 'error',
      message: 'Custom error message',
    };

    const error = createScopeError(violation);

    expect(error.name).toBe('ScopeViolationError');
    expect(error.message).toBe('Custom error message');
  });
});

describe('ScopeEnforcer', () => {
  let enforcer: ScopeEnforcer;

  beforeEach(() => {
    enforcer = new ScopeEnforcer('agent_test', '30_Projects/Brain/**', {
      vaultPath: '/vault',
      logViolations: false,
    });
  });

  describe('canAccess', () => {
    it('should allow access within scope', () => {
      expect(enforcer.canAccess('/vault/30_Projects/Brain/file.md')).toBe(true);
    });

    it('should deny access outside scope', () => {
      expect(enforcer.canAccess('/vault/40_Brain/file.md')).toBe(false);
    });

    it('should record violations', () => {
      enforcer.canAccess('/vault/40_Brain/file.md');
      
      expect(enforcer.getViolationCount()).toBe(1);
      expect(enforcer.getViolations()[0].attemptedPath).toBe('/vault/40_Brain/file.md');
    });
  });

  describe('requireAccess', () => {
    it('should not throw for allowed access', () => {
      expect(() => {
        enforcer.requireAccess('/vault/30_Projects/Brain/file.md');
      }).not.toThrow();
    });

    it('should throw for denied access', () => {
      expect(() => {
        enforcer.requireAccess('/vault/40_Brain/file.md');
      }).toThrow(/outside scope/);
    });
  });

  describe('filterPaths', () => {
    it('should filter to only allowed paths', () => {
      const paths = [
        '/vault/30_Projects/Brain/a.md',
        '/vault/40_Brain/b.md',
        '/vault/30_Projects/Brain/c.md',
      ];

      const allowed = enforcer.filterPaths(paths);

      expect(allowed).toHaveLength(2);
      expect(allowed).toContain('/vault/30_Projects/Brain/a.md');
      expect(allowed).toContain('/vault/30_Projects/Brain/c.md');
    });
  });

  describe('clearViolations', () => {
    it('should clear recorded violations', () => {
      enforcer.canAccess('/vault/40_Brain/file.md');
      expect(enforcer.getViolationCount()).toBe(1);

      enforcer.clearViolations();

      expect(enforcer.getViolationCount()).toBe(0);
    });
  });
});

describe('createScopeEnforcer', () => {
  it('should create configured enforcer', () => {
    const enforcer = createScopeEnforcer(
      'agent_test',
      '30_Projects/**',
      '/vault'
    );

    expect(enforcer.canAccess('/vault/30_Projects/file.md')).toBe(true);
  });
});

describe('isWithinScope', () => {
  it('should check scope quickly', () => {
    expect(isWithinScope('/vault/30_Projects/file.md', '/vault/30_Projects')).toBe(true);
    expect(isWithinScope('/vault/40_Brain/file.md', '/vault/30_Projects')).toBe(false);
  });
});

describe('validatePaths', () => {
  it('should separate valid and invalid paths', () => {
    const paths = [
      '/vault/30_Projects/Brain/a.md',
      '/vault/40_Brain/b.md',
      '/vault/30_Projects/Brain/c.md',
    ];

    const result = validatePaths('agent_test', '/vault/30_Projects/Brain', paths);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].attemptedPath).toBe('/vault/40_Brain/b.md');
  });
});

describe('File operations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `brain-scope-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('logViolation', () => {
    it('should log violation to file', async () => {
      const violation: ScopeViolation = {
        agentId: 'agent_test',
        attemptedPath: '/path/to/file',
        allowedScope: '30_Projects/**',
        timestamp: '2026-02-01T12:00:00Z',
        severity: 'error',
        message: 'Test violation',
      };

      await logViolation(violation, testDir);

      const logPath = join(testDir, 'logs', 'scope-violations.log');
      expect(existsSync(logPath)).toBe(true);

      const content = await readFile(logPath, 'utf-8');
      expect(content).toContain('Test violation');
    });
  });
});
