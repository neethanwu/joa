---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, architecture]
dependencies: []
---

# MCP server imports from CLI layer (bootstrap.ts)

## Problem Statement

`src/mcp/server.ts` imports `bootstrap` from `../cli/bootstrap.ts`, creating a `mcp -> cli` dependency that violates the architectural boundary. CLI and MCP should be independent peer layers that both depend only on core. This means MCP cannot be shipped or tested independently of CLI.

## Findings

- **Architecture strategist**: "This is the most significant architectural issue in the review." MCP depends on CLI via bootstrap.ts import. If CLI-specific behavior is ever added to bootstrap.ts, MCP will silently inherit it.
- **Pattern recognition**: Confirmed M1 moderate severity. The dependency graph is `mcp -> cli -> core` instead of the intended `mcp -> core` and `cli -> core`.
- **File**: `src/mcp/server.ts:4` — `import { bootstrap } from "../cli/bootstrap.ts";`

## Proposed Solutions

### Option A: Move bootstrap to `src/core/bootstrap.ts`
- **Pros**: Bootstrap is just lifecycle/initialization around core types; fits naturally in core. Exported through barrel.
- **Cons**: Core gets a file that knows about directory creation (slightly beyond pure domain logic).
- **Effort**: Small
- **Risk**: Low

### Option B: Move bootstrap to `src/shared/bootstrap.ts`
- **Pros**: Clean separation — shared utilities live in a dedicated layer.
- **Cons**: Adds a new directory/layer for a single file (may feel over-engineered).
- **Effort**: Small
- **Risk**: Low

### Option C: Duplicate bootstrap logic in MCP server
- **Pros**: No shared dependency at all. Bootstrap is only ~43 lines.
- **Cons**: Code duplication that will drift over time.
- **Effort**: Small
- **Risk**: Medium (drift)

## Recommended Action

Option A — move to `src/core/bootstrap.ts` and export through barrel.

## Technical Details

**Affected files:**
- `src/cli/bootstrap.ts` → move to `src/core/bootstrap.ts`
- `src/core/index.ts` — add export
- `src/mcp/server.ts` — update import
- `src/cli/main.ts` — update import

## Acceptance Criteria

- [ ] `src/mcp/server.ts` has zero imports from `src/cli/`
- [ ] `src/cli/main.ts` has zero imports from `src/mcp/`
- [ ] Both CLI and MCP import bootstrap from core or shared
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | 6 agents flagged this |

## Resources

- Architecture strategist review
- Pattern recognition review
