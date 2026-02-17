# Brain CLI

> Wilco OS Knowledge Management System CLI

## Overview

Brain is the command-line interface for Wilco OS, a local-first agentic PKM system built around Obsidian.

## Installation

```bash
# Install dependencies
npm install

# Build
npm run build

# Run CLI
npm run start -- --help
# or during development
npm run dev -- --help
```

## Development

```bash
# Run in development mode
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Test
npm run test

# Build
npm run build
```

## Commands

```bash
# Initialize a vault
brain init --vault /path/to/vault

# Ingest sources
brain ingest chatgpt --input /path/export.zip
brain ingest folder --input /path/projects --collection myprojects

# Build search index
brain index --scope all

# Search
brain search "query" --scope path:30_Projects/Brain

# Extract knowledge
brain extract --collection chatgpt --limit 50

# Synthesis
brain synth weekly

# Export context pack
brain export context-pack --scope moc:10_MOCs/Brain.md --to /path

# Agent commands
brain agent list
brain agent status <agent-id>
brain agent chat <agent-id>
brain agent send <agent-id> "message"
brain agent create --type project --project myproject
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
BRAIN_VAULT_PATH=/path/to/vault
ANTHROPIC_API_KEY=your-key
```

## Project Structure

```
src/
├── cli/          # CLI commands
├── config/       # Configuration management
├── db/           # SQLite database operations
├── ingest/       # Source ingestion
├── normalize/    # Data normalization
├── index_/       # Search indexing
├── retrieve/     # Scoped retrieval
├── extract/      # LLM extraction
├── synth/        # Synthesis operations
├── export/       # Context pack export
├── vault/        # Markdown operations
├── providers/    # LLM providers
├── agents/       # Agent management
└── utils/        # Utility functions
```

## License

MIT
