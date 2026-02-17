---
name: development
description: Standard development workflow for implementing features
---

# Development Workflow

Follow this workflow when implementing new features or fixing bugs.

## Prerequisites

- Node.js 22+ installed
- pnpm or npm available
- Vault initialized with `brain init`

## Steps

### 1. Read Current State

```bash
# Check current task
cat 40_Brain/.agent/tasks/tasks.json | jq '.tasks[] | select(.status == "pending") | select(.priority == (.priority | min))'
```

Or manually review the task queue file.

### 2. Create Feature Branch (optional)

For larger features:
```bash
cd 40_Brain/src
git checkout -b feature/TASK-XXX-description
```

### 3. Implement Changes

- Make small, focused changes
- Follow existing code patterns
- Add tests for new functionality
- Update documentation if needed

### 4. Run Quality Checks

```bash
# Lint
npm run lint

# Type check
npm run typecheck

# Tests
npm run test

# Build
npm run build
```

**All must pass before proceeding.**

### 5. Update Task Status

Edit `40_Brain/.agent/tasks/tasks.json`:

```json
{
  "id": "TASK-XXX",
  "status": "completed",
  "completed": "2026-02-01"
}
```

### 6. Commit Changes

```bash
git add .
git commit -m "feat(TASK-XXX): description of change"
```

Commit message format:
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes nor adds
- `test:` — Adding tests
- `chore:` — Maintenance

### 7. Stop

**Do NOT proceed to the next task.**

Context reset (`/new`) before starting the next task.

## Checklist

Before marking complete:

- [ ] Code compiles without errors
- [ ] Lint passes
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Documentation updated (if needed)
- [ ] Task status updated in tasks.json
- [ ] Changes committed

## Troubleshooting

### Lint Errors
```bash
npm run lint:fix  # Auto-fix where possible
```

### Type Errors
- Check import statements
- Verify type definitions exist
- Add type annotations if needed

### Test Failures
- Read error messages carefully
- Check test expectations vs actual
- Don't delete tests to make them pass

### Build Errors
- Ensure all imports are valid
- Check for circular dependencies
- Verify TypeScript config
