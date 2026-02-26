# joa — CLAUDE.md

## Runtime
- **Dev tooling**: Bun — `bun test`, `bun install`, `bunx biome`.
- **Published CLI**: Node.js — `tsc` build to `dist/`, shebang `#!/usr/bin/env node`.
- **SQLite**: Runtime shim in `db.ts` — `bun:sqlite` under Bun, `better-sqlite3` under Node.js.

## Architecture
- Write order: JSONL first, SQLite second. JSONL is source of truth.
- Session ID: no module-level singleton. `sessionId()` is a generator. Callers pass it through `LogContext`.
- Three-layer module architecture:
  - **Layer 1 (Foundations):** `errors`, `ids`, `config` — no internal deps
  - **Layer 2 (Storage):** `time`, `entry`, `journal`, `db`, `sync`, `context` — depends on Layer 1 only
  - **Layer 3 (Operations):** `formatters`, `log`, `query`, `status` — depends on Layer 1 + 2

## Code Standards
- No `any` without a JSDoc comment explaining why.
- No SQLite driver imports outside `db.ts`.
- Core library (`src/core/`) has no CLI or MCP imports.

## Testing
- Tests use in-memory SQLite (`new Database(":memory:")`) and temp dirs.
- Run tests: `bun test`

## Lint / Format
- Run lint: `bunx biome check .`
- Fix lint: `bunx biome check --write .`
- Typecheck: `bunx tsc --noEmit`

## Important Constraints
- FTS escaping: always escape user-provided search strings before passing to SQLite FTS.
- Tag filtering: uses `json_each()` for exact match. Tags must not contain `"` or `\` characters (validated at write time).
