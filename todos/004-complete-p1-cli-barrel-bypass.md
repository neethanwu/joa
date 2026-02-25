---
status: complete
priority: p1
issue_id: "004"
tags: [code-review, architecture]
dependencies: ["003"]
---

# CLI bypasses core barrel module with direct submodule imports

## Problem Statement

`src/cli/main.ts` imports directly from `../core/config.ts`, `../core/entry.ts`, and `../core/journal.ts` instead of going through the barrel (`../core/index.ts`). This couples the CLI to core's internal file organization, which the barrel exists to prevent. Some symbols (`EntryRow`, `serializeEntry`, `deserializeEntry`, `appendEntry`) aren't even exported from the barrel.

## Findings

- **Architecture strategist**: "Barrel bypass. Four imports in `main.ts` go directly to core submodules instead of through `index.ts`. This couples the CLI to core's internal file organization."
- **Pattern recognition**: L2 — inconsistent import style. `bootstrap.ts` and `server.ts` use barrel exclusively, `main.ts` mixes approaches.
- **File**: `src/cli/main.ts:7-12`

## Proposed Solutions

### Option A: Export missing symbols from barrel, update all CLI imports
- **Pros**: Establishes barrel as sole API boundary. Consistent with bootstrap.ts and server.ts patterns.
- **Cons**: Minor change to index.ts.
- **Effort**: Small
- **Risk**: Low

## Recommended Action

Option A. Note: if #003 is resolved first (import logic moved to core), some of these direct imports (`appendEntry`, `serializeEntry`, `deserializeEntry`) may no longer be needed in the CLI at all.

## Technical Details

**Affected files:**
- `src/core/index.ts` — add missing exports
- `src/cli/main.ts` — change all `../core/*.ts` imports to `../core/index.ts`

## Acceptance Criteria

- [ ] `main.ts` imports exclusively from `../core/index.ts`
- [ ] All needed symbols are exported from the barrel
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | Depends on #003 resolution |

## Resources

- Architecture strategist, Pattern recognition reviews
