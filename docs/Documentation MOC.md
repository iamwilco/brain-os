---
type: moc
category: documentation
created: 2026-02-01
updated: 2026-02-01
---

# Documentation MOC

> Master index of all Wilco OS documentation.

## Quick Links

- **Start Here:** [[40_Brain/.agent/prd/core|PRD]]
- **Current Tasks:** [[40_Brain/.agent/tasks/tasks|Task Queue]]
- **Admin Agent:** [[40_Brain/agents/admin/AGENT|Wilco]]

---

## Core Documentation

### Product & Planning
- [[40_Brain/.agent/prd/core|Product Requirements Document]] — Full system specification
- [[40_Brain/docs/PRD_vNext|PRD v2.0]] — Autonomous multi-agent system requirements
- [[40_Brain/.agent/tasks/tasks|Task Queue]] — Current work items and milestones
- [[40_Brain/tasks_vNext|Task Queue v2.0]] — Implementation tasks for autonomy
- [[40_Brain/.agent/workflows/test|Test Workflow]] — Quality gates before completion

### Architecture & Design
- [[40_Brain/docs/Architecture|System Architecture]] — Layers, data flow, components
- [[40_Brain/docs/agent-loop|Agent Loop Specification]] — Canonical loop stages (v2)
- [[40_Brain/docs/memory-architecture|Memory Architecture]] — Memory types and persistence (v2)
- [[40_Brain/docs/system-comparison-openclaw|OpenClaw Comparison]] — Reference architecture analysis
- [[40_Brain/docs/code-patterns|Code Patterns]] — Reusable implementation patterns
- [[40_Brain/docs/Data Model|Data Model]] — Schemas and structures
- [[40_Brain/docs/CLI Specification|CLI Specification]] — Command reference

### Agents
- [[40_Brain/agents/admin/AGENT|Admin Agent (Wilco)]] — System orchestrator
- [[40_Brain/agents/skills/Skills MOC|Skill Agents]] — Specialized capabilities

---

## By Category

### System Design
| Document | Description |
|----------|-------------|
| [[Architecture]] | High-level system design |
| [[Data Model]] | Schemas and data structures |
| [[CLI Specification]] | Command-line interface |

### Agent System
| Document | Description |
|----------|-------------|
| [[Admin Agent]] | Wilco orchestrator |
| [[Skills MOC]] | Skill agent index |
| [[Agent Communication]] | Inter-agent protocol |

### Operations
| Document | Description |
|----------|-------------|
| [[Test Workflow]] | Quality gates |
| [[Deployment]] | Installation and setup |
| [[Troubleshooting]] | Common issues |

---

## Development Guides

### Getting Started
1. Read the [[40_Brain/.agent/prd/core|PRD]]
2. Check [[40_Brain/.agent/tasks/tasks|current tasks]]
3. Review [[40_Brain/docs/Architecture|architecture]]
4. Start with highest-priority pending task

### Invariant Workflow
```
1. READ PRD
2. READ TASK QUEUE  
3. EXECUTE ONE TASK
4. RUN TEST WORKFLOW
5. UPDATE STATE
6. STOP
```

### Adding Documentation
- Place docs in `40_Brain/docs/`
- Update this MOC when adding new docs
- Use consistent frontmatter
- Link bidirectionally

---

## Status

| Section | Status | Last Updated |
|---------|--------|--------------|
| PRD | ✅ Complete | 2026-02-01 |
| PRD v2.0 | ✅ Complete | 2026-02-05 |
| Architecture | ✅ Complete | 2026-02-01 |
| Agent Loop Spec | ✅ Complete | 2026-02-05 |
| Memory Architecture | ✅ Complete | 2026-02-05 |
| OpenClaw Comparison | ✅ Complete | 2026-02-05 |
| Code Patterns | ✅ Complete | 2026-02-05 |
| Task Queue | ✅ Complete | 2026-02-01 |
| Task Queue v2.0 | ✅ Complete | 2026-02-05 |
| Agent Docs | ✅ Complete | 2026-02-01 |
| CLI Spec | 🔲 Pending | — |
| Data Model | 🔲 Pending | — |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-02-05 | Added v2.0 architecture documents: agent-loop, memory-architecture, PRD_vNext, tasks_vNext, system-comparison-openclaw, code-patterns |
| 2026-02-01 | Initial documentation structure created |
