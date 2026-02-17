# Agent Control Layer

> Invariant-style control system for Wilco OS development.

## What This Is

This folder contains the control layer for AI-assisted development of Wilco OS. It follows the **Invariant methodology** — deterministic, task-driven development where documentation is the source of truth.

## Structure

```
.agent/
├── prd/
│   └── core.md          # Product Requirements Document
├── tasks/
│   └── tasks.json       # Task queue with priorities
├── workflows/
│   ├── test.md          # Test workflow (quality gates)
│   └── development.md   # Development workflow
└── README.md            # This file
```

## How to Use

### Starting a Session

Begin each AI session with:

```
Read the PRD at 40_Brain/.agent/prd/core.md and the task queue at 40_Brain/.agent/tasks/tasks.json.
Execute the highest-priority pending task.
Follow the one-task-per-loop discipline.
```

### The Execution Loop

```
1. READ PRD
2. READ TASK QUEUE
3. EXECUTE ONE TASK
4. RUN TEST WORKFLOW
5. UPDATE STATE
6. STOP
```

### Key Principles

- **One task per loop** — Do not batch tasks
- **Documentation is truth** — Not chat history or memory
- **Small, reversible changes** — Easy to review and revert
- **Context resets expected** — All state lives in files

## Files

| File | Purpose | Update Frequency |
|------|---------|------------------|
| `prd/core.md` | System specification | When scope changes |
| `tasks/tasks.json` | Work queue | After each task |
| `workflows/test.md` | Quality gates | Rarely |
| `workflows/development.md` | Dev process | Rarely |

## Quick Commands

```bash
# View current task
cat 40_Brain/.agent/tasks/tasks.json | jq '.tasks[] | select(.status == "pending")' | head -20

# Count tasks by status
cat 40_Brain/.agent/tasks/tasks.json | jq '.tasks | group_by(.status) | map({status: .[0].status, count: length})'
```

## Related

- [[40_Brain/AGENTS.md]] — Agent guidelines
- [[40_Brain/docs/Architecture.md]] — System architecture
- [[40_Brain/docs/Documentation MOC.md]] — All documentation
