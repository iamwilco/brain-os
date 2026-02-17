---
name: code-review
description: Code review checklist and patterns for the Brain codebase. Use when reviewing changes before committing.
---

# Code Review Skill

Run through this checklist before marking any task complete.

## Quick Checklist

- [ ] **Types** — No `any`, all function params and returns typed
- [ ] **Imports** — All at top of file, no circular dependencies
- [ ] **Tests** — New code has colocated tests, existing tests still pass
- [ ] **Error handling** — Errors caught and logged, not swallowed
- [ ] **Scope** — Changes are within the task scope, no unrelated modifications
- [ ] **File size** — No file exceeds ~500 LOC
- [ ] **Security** — No hardcoded secrets, no path traversal, scope enforced
- [ ] **Naming** — Follows project conventions (camelCase vars, PascalCase types)
- [ ] **Documentation** — Public APIs documented, complex logic commented

## Red Flags

- Deleting or weakening existing tests
- Adding dependencies without justification
- Modifying files outside the task's `file_targets`
- Hardcoded paths or API keys
- `console.log` instead of proper logging
- Ignoring TypeScript errors with `@ts-ignore`

## Before Commit

1. Run `npm run lint` — must pass
2. Run `npm run typecheck` — must pass
3. Run `npm run test` — all tests pass
4. Run `npm run build` — builds cleanly
5. Review diff: `git diff --stat` — only expected files changed
