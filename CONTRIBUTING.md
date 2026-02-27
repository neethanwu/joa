# Contributing to joa

## Setup

```bash
bun install
```

## Commands

```bash
bun test               # Run all tests (unit + E2E)
bun test test/e2e/     # Run E2E tests only
bunx biome check .     # Lint and format check
bunx biome check --write .  # Auto-fix lint issues
bunx tsc --noEmit      # Type check
bun run build          # Build for Node.js (dist/)
```

## Dual-Runtime Requirement

joa runs on **Bun** during development and **Node.js** when installed via npm. Changes must work under both runtimes.

After modifying core or CLI code, always verify the Node.js build:

```bash
bun run build && node dist/cli/main.js --version
```

The SQLite shim in `src/core/db.ts` handles runtime differences — use `bun:sqlite` under Bun and `better-sqlite3` under Node.js. Never import SQLite drivers outside `db.ts`.

## Project Structure

```
src/
  core/     Core library (no CLI or MCP imports)
  cli/      CLI entry point and output formatting
  mcp/      MCP stdio server
test/
  core/     Unit tests (in-memory SQLite, temp dirs)
  cli/      CLI integration tests (child process spawning)
  mcp/      MCP server tests
  e2e/      End-to-end tests (real filesystem, real processes)
skills/     Agent skill definitions (SKILL.md)
```

## Module Layers

Core follows a strict three-layer architecture. Imports only flow downward.

1. **Foundations**: `errors.ts`, `ids.ts`, `config.ts` — no internal deps
2. **Storage**: `entry.ts`, `time.ts`, `journal.ts`, `db.ts`, `sync.ts`, `context.ts` — depends on Layer 1 only
3. **Operations**: `formatters.ts`, `log.ts`, `query.ts`, `status.ts` — depends on Layer 1 + 2

## Key Conventions

- JSONL is source of truth; SQLite is the derived index
- No `any` without a JSDoc comment explaining why
- No SQLite driver imports outside `db.ts`
- FTS escaping: always escape user-provided search strings before passing to SQLite FTS
- Tests use in-memory SQLite (`:memory:`) and temp dirs (cleaned up in `afterEach`)

## Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add thread summary query
fix(cli): handle empty journal on first run
refactor(db): extract bootstrap into separate module
```

## Pull Requests

- CI must pass (lint + typecheck + tests)
- Maintainer review required
- Keep PRs focused — one logical change per PR
