# Wilco OS — Agent Guidelines

> Guidelines for AI agents working on the Wilco OS codebase.

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
│   ├── .agent/                    # Invariant control layer
│   │   ├── prd/                   # Product requirements
│   │   ├── tasks/                 # Task queue (tasks.json)
│   │   └── workflows/             # Reusable procedures
│   ├── agents/                    # Agent definitions
│   │   ├── admin/                 # Admin agent (Wilco)
│   │   └── skills/                # Skill agents
│   ├── docs/                      # System documentation
│   └── src/                       # Source code (brain CLI)
├── 70_Sources/                    # Immutable imports
├── 80_Resources/                  # Reference material
├── 95_Templates/                  # Note templates
└── 99_Archive/                    # Archived content
```

---

## Development Workflow (Invariant)

### The Agent Loop

Every session follows this sequence:

```
1. READ PRD at 40_Brain/.agent/prd/core.md
2. READ TASK QUEUE at 40_Brain/.agent/tasks/tasks.json
3. EXECUTE ONE TASK (small, reversible changes)
4. RUN WORKFLOW (lint, test, build)
5. UPDATE STATE (mark complete, update docs)
6. STOP (context reset before next loop)
```

### Why One Task Per Loop?

- **Prevents scope creep** — Agents won't drift into unplanned work
- **Enables review** — Humans can verify each change
- **Reduces errors** — Smaller changes are easier to test
- **Survives context loss** — Minimal work lost on reset

---

## Coding Standards

### Language & Runtime
- **TypeScript** (ESM) — Strict typing, avoid `any`
- **Node.js 22+** — Keep compatibility
- **SQLite** via better-sqlite3 — Local-first database

### Style
- Use existing patterns in the codebase
- Keep files under ~500 LOC when feasible
- Add brief comments for tricky logic
- Consistent naming (camelCase for variables, PascalCase for types)

### Testing
- Colocate tests: `*.test.ts` next to source
- Run `npm test` before marking tasks complete
- Target 70%+ coverage for new code

---

## Key Files

| File | Purpose |
|------|---------|
| `40_Brain/.agent/prd/core.md` | Product requirements (source of truth) |
| `40_Brain/.agent/tasks/tasks.json` | Task queue with priorities |
| `40_Brain/.agent/workflows/test.md` | Test workflow to run before completion |
| `40_Brain/AGENTS.md` | This file (agent guidelines) |
| `40_Brain/docs/Architecture.md` | System architecture |

---

## Task Management

### Task Status Flow

```
pending → in_progress → completed
                ↓
            blocked (if dependencies not met)
```

### Updating tasks.json

When completing a task:
1. Set `status` to `"completed"`
2. Set `completed` to current date
3. Do NOT proceed to next task
4. Report completion and stop

### Task Format

```json
{
  "id": "TASK-001",
  "milestone": "M0",
  "priority": 1,
  "status": "pending",
  "description": "...",
  "acceptance_criteria": ["..."],
  "created": "2026-02-01",
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
5. **Regenerated context** — CONTEXT.md is auto-generated, not edited
6. **Idempotent operations** — Reruns produce same results

---

## Communication

### With Humans
- Be concise and direct
- Cite sources when providing information
- Ask for clarification when truly uncertain
- Report completion status clearly

### With Other Agents
Use the message protocol:
```json
{
  "from": "<agent_id>",
  "to": "<agent_id>",
  "type": "request|response|notify",
  "payload": { ... }
}
```

---

## Common Operations

### Search the Knowledge Base
```bash
brain search "query" --scope path:30_Projects/Brain
```

### Run Extraction
```bash
brain extract --collection chatgpt --limit 50
```

### Export Context Pack
```bash
brain export context-pack --scope moc:10_MOCs/Brain.md --to /path
```

### List Agents
```bash
brain agent list
```

---

## Troubleshooting

### Task Blocked
- Check `blocked_by` array
- Ensure dependencies are completed
- Update task status if unblocked

### Test Failures
- Fix issues before marking complete
- Do NOT skip tests
- Ask for help if stuck

### Scope Violations
- Check agent's configured scope
- Use Admin agent for cross-scope operations
- Never bypass scope enforcement

---

## Quick Reference

| Command | Action |
|---------|--------|
| Read PRD | Understand current goals |
| Read tasks.json | Find next task |
| One task only | Do not batch |
| Run tests | Before marking complete |
| Update state | Mark task done |
| Stop | Reset context before next |
