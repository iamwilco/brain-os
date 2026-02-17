/**
 * Agent scope enforcement
 * Ensures agents can only access files within their defined scope
 */

import { resolve, relative, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Scope violation severity
 */
export type ViolationSeverity = 'warning' | 'error' | 'critical';

/**
 * Scope violation record
 */
export interface ScopeViolation {
  agentId: string;
  attemptedPath: string;
  allowedScope: string;
  timestamp: string;
  severity: ViolationSeverity;
  message: string;
}

/**
 * Scope check result
 */
export interface ScopeCheckResult {
  allowed: boolean;
  violation?: ScopeViolation;
}

/**
 * Scope enforcement configuration
 */
export interface ScopeEnforcementConfig {
  vaultPath: string;
  logViolations: boolean;
  logPath?: string;
  strictMode: boolean;
}

/**
 * Default scope enforcement configuration
 */
export const DEFAULT_SCOPE_CONFIG: ScopeEnforcementConfig = {
  vaultPath: '',
  logViolations: true,
  strictMode: true,
};

/**
 * Convert glob pattern to regex
 */
export function globToRegex(pattern: string): RegExp {
  // Escape special regex chars except * and **
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');
  
  // Handle path prefix matching
  if (!regex.endsWith('.*')) {
    regex += '(/.*)?';
  }
  
  return new RegExp(`^${regex}$`);
}

/**
 * Normalize path for comparison
 */
export function normalizePath(path: string, basePath?: string): string {
  let normalized = path;
  
  // Make absolute if relative
  if (!isAbsolute(path) && basePath) {
    normalized = resolve(basePath, path);
  }
  
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  
  return normalized;
}

/**
 * Check if a path matches a scope pattern
 */
export function matchesScope(
  targetPath: string,
  scopePattern: string,
  basePath?: string
): boolean {
  const normalizedTarget = normalizePath(targetPath, basePath);
  const normalizedScope = normalizePath(scopePattern, basePath);
  
  // Handle ** (all files)
  if (scopePattern === '**/*' || scopePattern === '**') {
    return true;
  }
  
  // Handle path prefix patterns (e.g., "30_Projects/Brain/**")
  if (scopePattern.includes('**')) {
    const regex = globToRegex(normalizedScope);
    return regex.test(normalizedTarget);
  }
  
  // Handle exact path prefix
  if (normalizedTarget.startsWith(normalizedScope)) {
    return true;
  }
  
  // Handle relative paths within vault
  if (basePath) {
    const relativeTarget = relative(basePath, normalizedTarget);
    const relativeScope = scopePattern.replace(/\*\*\/?$/, '');
    
    if (relativeTarget.startsWith(relativeScope.replace(/\/+$/, ''))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if agent can access a path
 */
export function checkAccess(
  agentId: string,
  agentScope: string,
  targetPath: string,
  basePath?: string
): ScopeCheckResult {
  const allowed = matchesScope(targetPath, agentScope, basePath);
  
  if (allowed) {
    return { allowed: true };
  }
  
  const violation: ScopeViolation = {
    agentId,
    attemptedPath: targetPath,
    allowedScope: agentScope,
    timestamp: new Date().toISOString(),
    severity: 'error',
    message: `Agent "${agentId}" attempted to access "${targetPath}" which is outside scope "${agentScope}"`,
  };
  
  return { allowed: false, violation };
}

/**
 * Format violation for logging
 */
export function formatViolation(violation: ScopeViolation): string {
  return `[${violation.timestamp}] [${violation.severity.toUpperCase()}] ${violation.message}`;
}

/**
 * Log scope violation to file
 */
export async function logViolation(
  violation: ScopeViolation,
  logPath: string
): Promise<void> {
  const logDir = join(logPath, 'logs');
  const logFile = join(logDir, 'scope-violations.log');
  
  // Ensure log directory exists
  if (!existsSync(logDir)) {
    await mkdir(logDir, { recursive: true });
  }
  
  const logEntry = formatViolation(violation) + '\n';
  await appendFile(logFile, logEntry, 'utf-8');
}

/**
 * Create scope error message
 */
export function createScopeError(violation: ScopeViolation): Error {
  const error = new Error(violation.message);
  error.name = 'ScopeViolationError';
  return error;
}

/**
 * Scope enforcer class
 */
export class ScopeEnforcer {
  private agentId: string;
  private scope: string;
  private config: ScopeEnforcementConfig;
  private violations: ScopeViolation[] = [];

  constructor(
    agentId: string,
    scope: string,
    config: Partial<ScopeEnforcementConfig> = {}
  ) {
    this.agentId = agentId;
    this.scope = scope;
    this.config = { ...DEFAULT_SCOPE_CONFIG, ...config };
  }

  /**
   * Check if path is accessible
   */
  canAccess(targetPath: string): boolean {
    const result = checkAccess(
      this.agentId,
      this.scope,
      targetPath,
      this.config.vaultPath
    );
    
    if (!result.allowed && result.violation) {
      this.violations.push(result.violation);
      
      if (this.config.logViolations && this.config.logPath) {
        logViolation(result.violation, this.config.logPath).catch(() => {});
      }
    }
    
    return result.allowed;
  }

  /**
   * Check access and throw if not allowed (strict mode)
   */
  requireAccess(targetPath: string): void {
    if (!this.canAccess(targetPath)) {
      const violation = this.violations[this.violations.length - 1];
      throw createScopeError(violation);
    }
  }

  /**
   * Filter paths to only allowed ones
   */
  filterPaths(paths: string[]): string[] {
    return paths.filter(p => this.canAccess(p));
  }

  /**
   * Get all recorded violations
   */
  getViolations(): ScopeViolation[] {
    return [...this.violations];
  }

  /**
   * Clear recorded violations
   */
  clearViolations(): void {
    this.violations = [];
  }

  /**
   * Get violation count
   */
  getViolationCount(): number {
    return this.violations.length;
  }
}

/**
 * Create scope enforcer for agent
 */
export function createScopeEnforcer(
  agentId: string,
  scope: string,
  vaultPath: string,
  options?: Partial<ScopeEnforcementConfig>
): ScopeEnforcer {
  return new ScopeEnforcer(agentId, scope, {
    vaultPath,
    logPath: vaultPath,
    ...options,
  });
}

/**
 * Quick check if path is within scope
 */
export function isWithinScope(
  path: string,
  scope: string,
  basePath?: string
): boolean {
  return matchesScope(path, scope, basePath);
}

/**
 * Validate multiple paths against scope
 */
export function validatePaths(
  agentId: string,
  scope: string,
  paths: string[],
  basePath?: string
): { valid: string[]; invalid: ScopeViolation[] } {
  const valid: string[] = [];
  const invalid: ScopeViolation[] = [];
  
  for (const path of paths) {
    const result = checkAccess(agentId, scope, path, basePath);
    if (result.allowed) {
      valid.push(path);
    } else if (result.violation) {
      invalid.push(result.violation);
    }
  }
  
  return { valid, invalid };
}
