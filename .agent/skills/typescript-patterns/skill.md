---
name: typescript-patterns
description: TypeScript coding patterns and conventions used in the Wilco OS Brain codebase. Reference when writing or reviewing TypeScript code.
---

# TypeScript Patterns Skill

When writing TypeScript code for the Brain system, follow these patterns.

## Module Style

- **ESM only** — Use `import`/`export`, never `require`
- **Strict mode** — `strict: true` in tsconfig
- **No `any`** — Use `unknown` + type guards instead

## File Organization

```typescript
// 1. External imports
import { z } from 'zod';
import Database from 'better-sqlite3';

// 2. Internal imports
import { getDb } from '../db/connection.js';
import type { Config } from '../config.js';

// 3. Types/interfaces
export interface MyThing { ... }

// 4. Zod schemas (if applicable)
export const MyThingSchema = z.object({ ... });

// 5. Implementation
export function doThing(): MyThing { ... }
```

## Zod for Validation

- Define schemas for all external data (API inputs, file parsing, LLM outputs)
- Export both schema and inferred type: `export type MyThing = z.infer<typeof MyThingSchema>`
- Use `.safeParse()` for graceful error handling

## Database Patterns

- Use `better-sqlite3` synchronous API
- Prepare statements for repeated queries
- Use transactions for multi-row operations
- Always close database on shutdown

## Error Handling

- Throw typed errors: `throw new ScopeViolationError(path, scope)`
- Use `Result<T, E>` pattern for expected failures
- Log errors with context: `logger.error({ err, context }, 'message')`

## Testing

- Colocate: `thing.ts` → `thing.test.ts`
- Use `vitest` with `describe`/`it` blocks
- Mock external dependencies (LLM, filesystem)
- Test edge cases: empty input, max limits, invalid data

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | kebab-case | `session-lock.ts` |
| Variables | camelCase | `sessionId` |
| Types/Interfaces | PascalCase | `AgentDefinition` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Zod schemas | PascalCase + Schema | `AgentMessageSchema` |
