# Wilco OS Brain — Agent Documentation Index

> **For AI Agents:** Read this file first to understand available documentation and when to reference each resource.

This folder contains the control layer for AI-assisted development of Wilco OS Brain. It follows the **Invariant methodology** — deterministic, task-driven development where documentation is the source of truth.

---

## Quick Navigation

| Folder | Purpose | When to Read |
|--------|---------|--------------|
| [`/prd`](./prd/) | Product requirements, architecture | **First**, for any architectural decisions or understanding system design |
| [`/tasks`](./tasks/) | Task queue with phases and priorities | When starting work or checking what to build next |
| [`/SOPs`](./SOPs/) | Standard Operating Procedures | When encountering known issues or following established patterns |
| [`/skills`](./skills/) | Agent skills and reusable playbooks | When a task matches a supported skill |
| [`/workflows`](./workflows/) | Step-by-step development workflows | When executing specific development tasks |

---

## Folder Details

### `/prd` — Product Requirements

**The source of truth for what we're building.**

| File | Purpose |
|------|---------|
| `core.md` | Core PRD — system specification, data model, agent types, CLI spec |

Also read: `docs/STRATEGIC_ROADMAP.md` for the refined vision and gap analysis.

---

### `/tasks` — Task Queue

**Current work queue with phases, priorities, and acceptance criteria.**

| File | Purpose |
|------|---------|
| `tasks.json` | Active task queue (v3.0 — phased roadmap) |

Before implementing a feature:
1. Read `tasks.json` — find the highest-priority pending task
2. Check `blocked_by` — ensure dependencies are completed
3. Set status to `in_progress`
4. Implement, test, commit
5. Set status to `completed` with date

---

### `/SOPs` — Standard Operating Procedures

**Documented solutions to resolved issues.**

| SOP | Description |
|-----|-------------|
| `ssh-git-push.md` | Fix SSH passphrase issues when pushing to GitHub |
| `mock-to-real.md` | Pattern for replacing mock providers with real implementations |

To create a new SOP: document Problem → Root Cause → Solution → Verification.

---

### `/skills` — Agent Skills

**Reusable, task-specific playbooks for consistent quality.**

| Skill | Description | When to Use |
|-------|-------------|-------------|
| `git-commit-formatter` | Conventional commit message formatting | Every commit |
| `code-review` | Pre-commit review checklist | Before committing any code |
| `testing` | Testing patterns and best practices | Writing or debugging tests |
| `typescript-patterns` | TS coding conventions for Brain | Writing any TypeScript code |
| `frontend-patterns` | React/Vite/Tailwind patterns | Building UI components |

---

### `/workflows` — Development Workflows

**Step-by-step guides for common development tasks.**

| Workflow | Description | Trigger |
|----------|-------------|---------|
| `development.md` | Full development lifecycle | Starting any task |
| `test.md` | Quality gates (lint, typecheck, test, build) | Before marking task complete |
| `build.md` | Build backend and frontend | `/build` |
| `commit.md` | Stage, review, commit with conventional format | After task completion |
| `frontend.md` | Frontend-specific development | UI work |

---

## The Execution Loop

Every task follows this exact sequence:

```
1. READ tasks.json → find highest-priority pending task
2. SET status to "in_progress"
3. IMPLEMENT the task (small, focused changes)
4. RUN quality gates: lint → typecheck → test → build
5. COMMIT using git-commit-formatter skill
6. SET status to "completed" with date
7. STOP — do not proceed to next task
```

**Key rules:**
- **One task at a time** — Never batch tasks
- **Commit after each task** — Every successful task gets its own commit
- **Documentation is truth** — Not chat history or memory
- **Context resets expected** — All state lives in files, not in conversation

---

## Quick Commands

```bash
# View pending tasks
cat 40_Brain/.agent/tasks/tasks.json | jq '.tasks[] | select(.status == "pending") | {id, title, priority}'

# View current phase
cat 40_Brain/.agent/tasks/tasks.json | jq '.phases | to_entries[] | select(.value.status == "active")'

# Run quality gates
cd 40_Brain/src && npm run lint && npm run typecheck && npm run test && npm run build

# Quick commit
cd 40_Brain && git add -A && git commit -m "feat(scope): description"
```

---

## Related Documents

| Document | Location | Purpose |
|----------|----------|---------|
| Agent Guidelines | `40_Brain/AGENTS.md` | Coding standards, invariants, agent types |
| Architecture | `40_Brain/docs/Architecture.md` | System design and data flow |
| Strategic Roadmap | `40_Brain/docs/STRATEGIC_ROADMAP.md` | Vision, gap analysis, phased plan |
| Capabilities | `40_Brain/docs/CAPABILITIES.md` | Complete feature reference |
| Testing Guide | `40_Brain/docs/TESTING_GUIDE.md` | How to test each feature |
