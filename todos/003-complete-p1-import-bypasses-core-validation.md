---
status: complete
priority: p1
issue_id: "003"
tags: [code-review, architecture, data-integrity, performance]
dependencies: []
---

# cmdImport bypasses core validation and write path

## Problem Statement

The `cmdImport` handler in `main.ts` directly calls `appendEntry()` + `db.writeEntry()`, bypassing `core.log()` and its validation (`validateEntryInput`). This means imported entries skip category validation, tag character validation, thread ID format checks, and session/agent enrichment. Malformed entries can enter the journal and cause downstream query failures.

Additionally, the import reads the entire file into memory and processes entries one-by-one without batching — a performance concern for large imports.

## Findings

- **Architecture strategist**: "Import bypasses core validation. The `cmdImport` handler writes entries without running them through `validateEntryInput`. This is business logic that reimplements parts of what `core.log` does."
- **TypeScript reviewer**: Unvalidated import cast — `deserializeEntry(row)` trusts arbitrary JSON.
- **Security sentinel**: Import trusts unvalidated data — medium severity.
- **Performance oracle**: Unbatched import (critical perf), entire file in memory (critical perf).
- **File**: `src/cli/main.ts:330-393`

## Proposed Solutions

### Option A: Create `core.importEntries()` function
- **Pros**: Centralizes write path. Import gets same validation as `log()`. CLI stays thin. Removes need for CLI to import `appendEntry` directly.
- **Cons**: Core gets a new function.
- **Effort**: Medium
- **Risk**: Low

### Option B: Route each imported entry through `core.log()`
- **Pros**: Reuses existing validated write path completely.
- **Cons**: `log()` generates new IDs and timestamps — imports should preserve originals. Would need a flag or separate path.
- **Effort**: Medium
- **Risk**: Medium (semantic mismatch)

### Option C: Add validation to cmdImport inline
- **Pros**: Minimal change.
- **Cons**: Duplicates validation logic. Doesn't fix performance. Still bypasses barrel.
- **Effort**: Small
- **Risk**: Medium (drift from core validation)

## Recommended Action

Option A — create `core.importEntries()` that validates, deduplicates, and batch-writes.

## Technical Details

**Affected files:**
- New: `src/core/import.ts` (or add to existing module)
- `src/core/index.ts` — export new function
- `src/cli/main.ts` — simplify cmdImport to call core function
- Remove direct imports of `appendEntry`, `serializeEntry`, `deserializeEntry` from CLI

## Acceptance Criteria

- [ ] Imported entries pass through `validateEntryInput` or equivalent
- [ ] Invalid entries are skipped with error messages (not silently accepted)
- [ ] Import handles large files without loading entire content into memory
- [ ] CLI no longer imports directly from `core/entry.ts` or `core/journal.ts`
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | Multiple agents flagged |

## Resources

- Architecture strategist, TypeScript reviewer, Security sentinel, Performance oracle reviews
