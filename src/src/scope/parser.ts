/**
 * Scope parser module
 * Parses scope strings and matches paths against scope filters
 */

/**
 * Scope type
 */
export type ScopeType = 'all' | 'path' | 'collection' | 'tag' | 'moc';

/**
 * Parsed scope
 */
export interface ParsedScope {
  type: ScopeType;
  value: string;
  pattern?: RegExp;
}

/**
 * Convert glob pattern to regex
 * Supports: * (any chars), ** (any path), ? (single char)
 */
export function globToRegex(glob: string): RegExp {
  let regex = glob
    // Escape special regex chars (except * and ?)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // **/ at start matches zero or more path segments
    .replace(/^\*\*\//, '{{STARTDOUBLESTAR}}')
    // /**/ in middle matches zero or more path segments
    .replace(/\/\*\*\//g, '{{MIDDLEDOUBLESTAR}}')
    // ** at end matches anything
    .replace(/\/\*\*$/, '{{ENDDOUBLESTAR}}')
    // Remaining ** (standalone)
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    // * matches any chars except /
    .replace(/\*/g, '[^/]*')
    // ? matches single char except /
    .replace(/\?/g, '[^/]')
    // Restore double stars
    .replace(/\{\{STARTDOUBLESTAR\}\}/g, '(?:.*/)?')
    .replace(/\{\{MIDDLEDOUBLESTAR\}\}/g, '(?:/.*)?/')
    .replace(/\{\{ENDDOUBLESTAR\}\}/g, '(?:/.*)?')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*');
  
  // Anchor the pattern
  return new RegExp(`^${regex}$`);
}

/**
 * Parse a scope string into structured scope
 */
export function parseScope(scope: string): ParsedScope {
  if (!scope || scope === 'all') {
    return { type: 'all', value: '' };
  }
  
  // Check for prefixed scopes
  if (scope.startsWith('path:')) {
    const value = scope.slice(5);
    return {
      type: 'path',
      value,
      pattern: globToRegex(value),
    };
  }
  
  if (scope.startsWith('collection:')) {
    return {
      type: 'collection',
      value: scope.slice(11),
    };
  }
  
  if (scope.startsWith('tag:')) {
    return {
      type: 'tag',
      value: scope.slice(4),
    };
  }
  
  if (scope.startsWith('moc:')) {
    return {
      type: 'moc',
      value: scope.slice(4),
    };
  }
  
  // Default: treat as path glob
  return {
    type: 'path',
    value: scope,
    pattern: globToRegex(scope),
  };
}

/**
 * Check if a path matches a scope
 */
export function matchesScope(path: string, scope: ParsedScope): boolean {
  switch (scope.type) {
    case 'all':
      return true;
      
    case 'path':
      if (!scope.pattern) {
        return path === scope.value;
      }
      return scope.pattern.test(path);
      
    case 'collection':
      // Collection matching is handled at query level
      return true;
      
    case 'tag':
    case 'moc':
      // Tag/MOC matching requires content inspection
      return true;
      
    default:
      return true;
  }
}

/**
 * Filter paths by scope
 */
export function filterByScope(paths: string[], scope: ParsedScope): string[] {
  return paths.filter(path => matchesScope(path, scope));
}

/**
 * Parse multiple scopes (comma-separated)
 */
export function parseScopes(scopeString: string): ParsedScope[] {
  if (!scopeString || scopeString === 'all') {
    return [{ type: 'all', value: '' }];
  }
  
  return scopeString.split(',').map(s => parseScope(s.trim()));
}

/**
 * Check if path matches any of multiple scopes
 */
export function matchesAnyScope(path: string, scopes: ParsedScope[]): boolean {
  return scopes.some(scope => matchesScope(path, scope));
}

/**
 * Common scope patterns
 */
export const SCOPE_PATTERNS = {
  // Vault structure
  inbox: 'path:00_Inbox/**',
  daily: 'path:01_Daily/**',
  mocs: 'path:10_MOCs/**',
  concepts: 'path:20_Concepts/**',
  projects: 'path:30_Projects/**',
  brain: 'path:40_Brain/**',
  sources: 'path:70_Sources/**',
  resources: 'path:80_Resources/**',
  templates: 'path:95_Templates/**',
  archive: 'path:99_Archive/**',
  
  // File types
  markdown: 'path:**/*.md',
  json: 'path:**/*.json',
  
  // Specific areas
  chatgpt: 'collection:chatgpt',
  claude: 'collection:claude',
} as const;

/**
 * Expand scope alias to full scope string
 */
export function expandScopeAlias(scope: string): string {
  const alias = scope.toLowerCase();
  if (alias in SCOPE_PATTERNS) {
    return SCOPE_PATTERNS[alias as keyof typeof SCOPE_PATTERNS];
  }
  return scope;
}

/**
 * Validate scope string
 */
export function isValidScope(scope: string): boolean {
  try {
    const parsed = parseScope(scope);
    // Check that glob patterns are valid
    if (parsed.type === 'path' && parsed.pattern) {
      // Pattern was created successfully
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get scope description for display
 */
export function describeSope(scope: ParsedScope): string {
  switch (scope.type) {
    case 'all':
      return 'All files';
    case 'path':
      return `Path matching: ${scope.value}`;
    case 'collection':
      return `Collection: ${scope.value}`;
    case 'tag':
      return `Tag: #${scope.value}`;
    case 'moc':
      return `MOC: ${scope.value}`;
    default:
      return `Unknown scope: ${scope.value}`;
  }
}

/**
 * Extract collection names from scopes
 */
export function getCollectionsFromScopes(scopes: ParsedScope[]): string[] {
  return scopes
    .filter(s => s.type === 'collection')
    .map(s => s.value);
}

/**
 * Parse collection value (supports multiple with +)
 * e.g., "collection:chatgpt+claude" -> ["chatgpt", "claude"]
 */
export function parseCollectionValue(value: string): string[] {
  return value.split('+').map(c => c.trim()).filter(c => c.length > 0);
}

/**
 * Check if a collection matches scope
 */
export function matchesCollectionScope(
  collection: string,
  scope: ParsedScope
): boolean {
  if (scope.type !== 'collection') {
    return true; // Non-collection scopes don't filter by collection
  }
  
  const collections = parseCollectionValue(scope.value);
  return collections.includes(collection);
}

/**
 * Build SQL WHERE clause for collection scopes
 */
export function buildCollectionWhereClause(
  scopes: ParsedScope[],
  tableAlias: string = 's'
): { clause: string; params: string[] } {
  const collectionScopes = scopes.filter(s => s.type === 'collection');
  
  if (collectionScopes.length === 0) {
    return { clause: '', params: [] };
  }
  
  // Collect all collection names
  const allCollections: string[] = [];
  for (const scope of collectionScopes) {
    allCollections.push(...parseCollectionValue(scope.value));
  }
  
  if (allCollections.length === 0) {
    return { clause: '', params: [] };
  }
  
  if (allCollections.length === 1) {
    return {
      clause: `${tableAlias}.collection = ?`,
      params: allCollections,
    };
  }
  
  const placeholders = allCollections.map(() => '?').join(', ');
  return {
    clause: `${tableAlias}.collection IN (${placeholders})`,
    params: allCollections,
  };
}

/**
 * Build SQL WHERE clause for path scopes
 */
export function buildPathWhereClause(
  scopes: ParsedScope[],
  tableAlias: string = 's'
): { clause: string; params: string[] } {
  const pathScopes = scopes.filter(s => s.type === 'path');
  
  if (pathScopes.length === 0) {
    return { clause: '', params: [] };
  }
  
  // For SQLite, we use GLOB or LIKE patterns
  // Convert glob patterns to SQLite GLOB syntax
  const conditions: string[] = [];
  const params: string[] = [];
  
  for (const scope of pathScopes) {
    // SQLite GLOB uses * and ? similar to shell globs
    // But ** needs special handling - convert to *
    const sqliteGlob = scope.value.replace(/\*\*/g, '*');
    conditions.push(`${tableAlias}.path GLOB ?`);
    params.push(sqliteGlob);
  }
  
  return {
    clause: conditions.length === 1 
      ? conditions[0] 
      : `(${conditions.join(' OR ')})`,
    params,
  };
}

/**
 * Build combined SQL WHERE clause for all scopes
 */
export function buildScopeWhereClause(
  scopes: ParsedScope[],
  tableAlias: string = 's'
): { clause: string; params: string[] } {
  // Check for 'all' scope
  if (scopes.some(s => s.type === 'all')) {
    return { clause: '', params: [] };
  }
  
  const collectionClause = buildCollectionWhereClause(scopes, tableAlias);
  const pathClause = buildPathWhereClause(scopes, tableAlias);
  
  const clauses: string[] = [];
  const params: string[] = [];
  
  if (collectionClause.clause) {
    clauses.push(collectionClause.clause);
    params.push(...collectionClause.params);
  }
  
  if (pathClause.clause) {
    clauses.push(pathClause.clause);
    params.push(...pathClause.params);
  }
  
  if (clauses.length === 0) {
    return { clause: '', params: [] };
  }
  
  // Combine with AND (collection AND path must both match)
  return {
    clause: clauses.length === 1 ? clauses[0] : `(${clauses.join(' AND ')})`,
    params,
  };
}
