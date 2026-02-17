---
description: Commit changes after completing a task using conventional commits
---

# Commit Workflow

Run this workflow after every successful task completion. Uses the `git-commit-formatter` skill.

## Steps

### 1. Verify Quality Gates Passed

Before committing, ensure ALL of these passed:

```bash
cd 40_Brain/src && npm run lint && npm run typecheck && npm run test && npm run build
```

For docs-only changes, skip build/test:
```bash
cd 40_Brain/src && npm run lint
```

### 2. Stage Changes

Stage only files related to the current task:

```bash
cd 40_Brain
git add <specific files>
```

Or if all changes are task-related:
```bash
git add -A
```

### 3. Review Staged Changes

```bash
git diff --cached --stat
```

Verify only expected files are staged. Unstage anything unrelated.

### 4. Write Commit Message

Follow the `git-commit-formatter` skill format:

```
<type>(<scope>): <description>

[optional body with details]

Task: <TASK-ID>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

**Examples**:
- `feat(llm): wire Claude API to agent execute stage`
- `fix(search): correct RRF scoring formula in hybrid search`
- `docs(agent): add testing skill and code review checklist`
- `chore(tasks): update task queue with P1 roadmap tasks`

### 5. Commit

```bash
git commit -m "<message>"
```

### 6. Verify

```bash
git log --oneline -1
```

Confirm the commit looks correct.
