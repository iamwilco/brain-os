---
name: test
description: Run the test workflow before marking any task complete
---

# Test Workflow

Before marking any task as complete, run this workflow.

## Steps

### 1. Install Dependencies

```bash
cd 40_Brain/src
npm install
```

### 2. Lint

```bash
npm run lint
```

**Must pass with no errors.** Warnings are acceptable but should be minimized.

### 3. Type Check

```bash
npm run typecheck
```

**Must pass with no type errors.**

### 4. Unit Tests

```bash
npm run test
```

**All tests must pass.** Coverage should be maintained above 70%.

### 5. Build

```bash
npm run build
```

**Build must complete successfully.**

## Failure Handling

If any step fails:

1. **Do NOT mark the task complete**
2. Fix the issues
3. Re-run the entire workflow
4. Only mark complete when all steps pass

## Quick Check (for minor changes)

For documentation-only or trivial changes:

```bash
npm run lint && npm run typecheck
```

This is acceptable for non-code changes, but full workflow is required for any logic changes.
