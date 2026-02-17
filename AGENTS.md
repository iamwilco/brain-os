# Wilco OS — Agent Guidelines

> Guidelines for AI agents working on the Wilco OS codebase.
> **Start here:** Read `40_Brain/.agent/README.md` for the full documentation index.

---

## Project Structure

```
Wilco OS/                          # Obsidian Vault (root)
├── 00_Inbox/                      # Quick capture
├── 01_Daily/                      # Daily notes  
├── 10_MOCs/                       # Maps of Content
├── 20_Concepts/                   # Entity notes
├── 30_Projects/                   # Project folders
├── 40_Brain/                      # Brain system
│   ├── .agent/                    # Agent control layer
│   │   ├── prd/                   # Product requirements
│   │   ├── tasks/                 # Task queue (tasks.json)
│   │   ├── skills/                # Agent skills (playbooks)
│   │   ├── workflows/             # Development workflows
│   │   └── SOPs/                  # Standard Operating Procedures
│   ├── agents/                    # Runtime agent definitions
│   │   ├── admin/                 # Admin agent (Wilco)
│   │   └── skills/                # Skill agents
│   ├── docs/                      # System documentation
│   ├── src/                       # Backend source code
│   └── frontend/                  # React frontend
├── 70_Sources/                    # Immutable imports
├── 80_Resources/                  # Reference material
├── 95_Templates/                  # Note templates
└── 99_Archive/                    # Archived content
```

---

## Development Workflow (MANDATORY)

### The Task Loop

Every task follows this **exact** sequence. No exceptions.

```
1. READ  → 40_Brain/.agent/tasks/tasks.json (find highest-priority pending task)
2. CLAIM → Set task status to "in_progress"
3. CODE  → Implement the task (small, focused changes)
4. TEST  → Run quality gates: lint → typecheck → test → build
5. COMMIT → Git commit using git-commit-formatter skill (Conventional Commits)
6. DONE  → Set task status to "completed" with today's date
7. STOP  → Do NOT proceed to next task without human confirmation
```

### Commit After Every Task

**This is non-negotiable.** After each successful task:

1. Run quality gates (see `.agent/workflows/test.md`)
2. Stage changes: `git add -A`
3. Commit with Conventional Commits format (see `.agent/skills/git-commit-formatter/skill.md`):
   ```
   <type>(<scope>): <description>
   
   Task: <TASK-ID>
   ```
4. Example: `feat(llm): wire Claude API to agent execute stage`

### Why One Task + One Commit?

- **Atomic changes** — Each commit is a complete, working feature
- **Easy revert** — If something breaks, revert one commit
- **Clear history** — Git log tells the story of the project
- **Prevents scope creep** — Agents won't drift into unplanned work
- **Survives context loss** — Progress is committed, never lost

---

## Available Skills

Use these playbooks for consistent quality. Located in `.agent/skills/`.

| Skill | When to Use |
|-------|-------------|
| `git-commit-formatter` | **Every commit** — Conventional Commits format |
| `code-review` | **Before committing** — Pre-commit review checklist |
| `testing` | Writing or debugging tests |
| `typescript-patterns` | Writing any TypeScript code |
| `frontend-patterns` | Building UI components |

---

## Available Workflows

Step-by-step guides in `.agent/workflows/`.

| Workflow | When to Use |
|----------|-------------|
| `development.md` | Full development lifecycle for any task |
| `test.md` | Quality gates before marking task complete |
| `build.md` | Building backend and/or frontend |
| `commit.md` | Staging, reviewing, and committing changes |
| `frontend.md` | Frontend-specific development |

---

## Coding Standards

### Language & Runtime
- **TypeScript** (ESM) — Strict typing, avoid `any`
- **Node.js 22+** — Keep compatibility
- **SQLite** via better-sqlite3 — Local-first database

### Style
- Use existing patterns in the codebase
- Keep files under ~500 LOC when feasible
- Consistent naming (camelCase for variables, PascalCase for types)
- See `.agent/skills/typescript-patterns/skill.md` for full guide

### Testing
- Colocate tests: `*.test.ts` next to source
- Run `npm test` before marking tasks complete
- Target 70%+ coverage for new code
- See `.agent/skills/testing/skill.md` for patterns

---

## Key Files

| File | Purpose |
|------|---------|
| `.agent/README.md` | Documentation index (read first) |
| `.agent/prd/core.md` | Product requirements (source of truth) |
| `.agent/tasks/tasks.json` | Task queue with phases and priorities |
| `AGENTS.md` | This file (agent guidelines) |
| `docs/STRATEGIC_ROADMAP.md` | Vision, gap analysis, phased roadmap |
| `docs/Architecture.md` | System architecture |

---

## Task Management

### Task Phases

```
P1: Wire Up        → Make the system real (LLM, embeddings, frontend, watcher)
P2: Orchestrator    → Central routing, structured memory, workshop v1
P3: Cortex          → Meta-agent, non-blocking execution, memory graph
P4: Polish          → Obsidian plugin, knowledge graph, E2E tests, security
```

### Task Status Flow

```
pending → in_progress → completed
              ↓
          blocked (if dependencies not met)
```

### Task Format

```json
{
  "id": "P1-001",
  "phase": "P1",
  "priority": 1,
  "status": "pending",
  "title": "Wire real LLM provider to agent loop",
  "description": "...",
  "acceptance_criteria": ["..."],
  "file_targets": ["src/src/llm/provider.ts"],
  "created": "2026-02-17",
  "completed": null,
  "blocked_by": []
}
```

---

## Agent Types

### Admin Agent (Wilco)
- **Location:** `40_Brain/agents/admin/`
- **Scope:** Entire vault
- **Can:** Coordinate agents, manage system, full access

### Project Agents
- **Location:** `30_Projects/<project>/agent/`
- **Scope:** Project folder only
- **Can:** Project-specific tasks, maintain project memory

### Skill Agents
- **Location:** `40_Brain/agents/skills/<skill>/`
- **Scope:** Task-based (stateless)
- **Can:** Specialized capabilities (SEO, Writing, etc.)

---

## Invariants (Never Violate)

1. **Sources are immutable** — Never modify files in `70_Sources/`
2. **Items link to evidence** — Every extraction must cite source
3. **Scope enforcement** — Agents cannot access outside their scope
4. **Append-only transcripts** — Session logs never deleted
5. **One task, one commit** — Every completed task gets its own commit
6. **Quality gates before commit** — lint + typecheck + test + build must pass
7. **Idempotent operations** — Reruns produce same results

---

## SOPs (Standard Operating Procedures)

Check `.agent/SOPs/` for documented solutions to known issues:

| SOP | Problem |
|-----|---------|
| `ssh-git-push.md` | SSH passphrase fails during git push |
| `mock-to-real.md` | Replacing mock providers with real implementations |

---

## Troubleshooting

### Task Blocked
- Check `blocked_by` array in tasks.json
- Ensure dependencies are completed
- Pick next unblocked task instead

### Test Failures
- Fix issues before committing
- Do NOT skip tests or delete tests to make them pass
- Check `.agent/skills/testing/skill.md` for debugging help

### Build Errors
- Check `.agent/workflows/build.md` for troubleshooting steps
- Verify all imports are valid and no circular dependencies exist

---

## Quick Reference

| Step | Action | Command |
|------|--------|---------|
| 1 | Read task queue | `cat .agent/tasks/tasks.json \| jq '.tasks[] \| select(.status=="pending") \| {id,title,priority}'` |
| 2 | Claim task | Set `status: "in_progress"` in tasks.json |
| 3 | Implement | Write code following skills and patterns |
| 4 | Test | `cd src && npm run lint && npm run typecheck && npm run test && npm run build` |
| 5 | Commit | `git add -A && git commit -m "type(scope): description"` |
| 6 | Complete | Set `status: "completed"`, `completed: "YYYY-MM-DD"` |
| 7 | Stop | Report completion, await next instruction |
