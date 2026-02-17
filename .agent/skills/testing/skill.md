---
name: testing
description: Testing patterns and best practices for the Brain system. Use when writing or debugging tests.
---

# Testing Skill

## Framework

- **Vitest** for unit and integration tests
- **Playwright** for E2E tests (Phase 4)
- Colocated tests: `module.ts` → `module.test.ts`

## Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ModuleName', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // setup
  });

  afterEach(() => {
    db.close();
  });

  describe('functionName', () => {
    it('should handle normal case', () => {
      const result = functionName(validInput);
      expect(result).toEqual(expectedOutput);
    });

    it('should handle edge case', () => {
      expect(() => functionName(invalidInput)).toThrow();
    });
  });
});
```

## Mocking

- Mock LLM calls: return predetermined responses
- Mock filesystem: use in-memory database or temp dirs
- Mock time: `vi.useFakeTimers()` for scheduler tests
- Mock fetch: `vi.fn()` for external API calls

## What to Test

| Layer | Test Focus |
|-------|-----------|
| Agent loop | Stage transitions, error recovery, lock behavior |
| Memory | Read/write, compaction, flush triggers |
| Search | FTS5 queries, vector similarity, hybrid scoring |
| Extraction | Schema validation, item creation, idempotency |
| API | Route responses, auth, error codes |
| Scheduler | Cron parsing, execution timing, concurrency |

## Running Tests

```bash
# All tests
npm run test

# Specific file
npx vitest run src/search/vector.test.ts

# Watch mode
npx vitest watch

# Coverage
npx vitest run --coverage
```

## Coverage Target

- **70% minimum** for new code
- Focus on logic branches, not line count
- Skip coverage for pure type definitions
