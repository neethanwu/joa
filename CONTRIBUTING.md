# Contributing to joa

## Setup

```bash
bun install
```

## Commands

```bash
bun test          # Run tests
bunx biome check . # Lint and format check
bunx tsc --noEmit  # Type check
```

## Project Structure

- `src/core/` — Pure TypeScript library (Phase 1A)
- `test/core/` — Unit and integration tests
- `docs/plans/` — Implementation plans by phase

## Module Layers

1. **Foundations**: `errors.ts`, `ids.ts`, `config.ts` — no internal deps
2. **Storage**: `entry.ts`, `time.ts`, `journal.ts`, `db.ts`, `sync.ts`
3. **Operations**: `formatters.ts`, `log.ts`, `query.ts`, `status.ts`

## Guidelines

- Follow existing patterns in the codebase
- Write tests for new functionality
- JSONL is source of truth; SQLite is the derived index
- No `any` without a JSDoc comment
