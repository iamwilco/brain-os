---
type: moc
category: agents
created: 2026-02-01
---

# Skill Agents MOC

> Map of Content for all skill agents in Wilco OS.

## Overview

Skill Agents are specialized AI assistants that provide focused capabilities. They can be invoked by the Admin Agent, Project Agents, or directly by the user.

## Available Skills

### Content & Communication

| Skill | ID | Description | Status |
|-------|-----|-------------|--------|
| [[Writer]] | `agent_skill_writer` | Content creation, editing, tone adjustment | 🔲 Planned |
| [[SEO]] | `agent_skill_seo` | Search optimization, keywords, content analysis | 🔲 Planned |

### Thinking & Planning

| Skill | ID | Description | Status |
|-------|-----|-------------|--------|
| [[Brainstorm]] | `agent_skill_brainstorm` | Ideation, creative exploration, mind mapping | 🔲 Planned |
| [[Researcher]] | `agent_skill_researcher` | Deep research, fact-checking, source gathering | 🔲 Planned |

### Organization & Synthesis

| Skill | ID | Description | Status |
|-------|-----|-------------|--------|
| [[Organizer]] | `agent_skill_organizer` | Structure, categorization, cleanup | 🔲 Planned |
| [[Synthesizer]] | `agent_skill_synthesizer` | Summarization, pattern recognition, insights | 🔲 Planned |

## Creating New Skills

Skills follow the **SKILL.md** format (inspired by OpenClaw):

```
40_Brain/agents/skills/<skill-name>/
├── SKILL.md           # Required: Definition + instructions
├── references/        # Optional: Reference documentation
├── scripts/           # Optional: Helper scripts
└── assets/            # Optional: Templates, examples
```

### SKILL.md Format

```markdown
---
name: skill-name
id: agent_skill_<name>
description: What this skill does and when to use it
metadata:
  emoji: "🎯"
  category: content|thinking|organization
---

# Skill Name

Instructions for the skill agent...
```

## Skill Design Principles

1. **Concise is key** — Only include what the agent truly needs
2. **Progressive disclosure** — Core in SKILL.md, details in references/
3. **Appropriate freedom** — Match specificity to task fragility
4. **No duplication** — Information lives in one place

## Usage

### Direct Invocation

```bash
brain agent chat agent_skill_seo
brain agent send agent_skill_writer "Review this draft for clarity"
```

### Via Admin Agent

The Admin Agent can invoke skills as needed:

```
@Wilco: I need help optimizing this content for search
# Admin will delegate to SEO skill agent
```

### Via Project Agents

Project agents can request skill assistance:

```json
{
  "from": "agent_project_brain",
  "to": "agent_skill_brainstorm",
  "type": "request",
  "payload": {
    "action": "generate_ideas",
    "context": { "topic": "CLI architecture options" }
  }
}
```

## Related

- [[40_Brain/agents/admin/AGENT|Admin Agent]]
- [[40_Brain/.agent/prd/core|PRD]]
- [[40_Brain/docs/Architecture|Architecture]]
