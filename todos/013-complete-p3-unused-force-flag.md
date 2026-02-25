---
status: complete
priority: p3
issue_id: "013"
tags: [code-review, simplicity]
dependencies: []
---

# --force flag declared but never consumed

## Problem Statement

The `--force` flag is declared in the `parseArgs` options but is never read or acted upon in any command handler.

## Findings

- **Simplicity reviewer**: Dead code. Remove until actually needed.
- **File**: `src/cli/main.ts` parseArgs options config

## Proposed Solutions

### Option A: Remove the flag declaration
- **Effort**: Trivial
- **Risk**: None

## Acceptance Criteria

- [ ] `--force` removed from parseArgs options
- [ ] No references to force in help text

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
