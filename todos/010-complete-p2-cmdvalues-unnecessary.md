---
status: complete
priority: p2
issue_id: "010"
tags: [code-review, simplicity]
dependencies: []
---

# CmdValues interface and toCmd() are unnecessary abstraction

## Problem Statement

The `CmdValues` interface and `toCmd()` function exist solely to perform a type cast from `parseArgs` output. The cast erases type connection between the parseArgs config and handler code — if an option is removed from parseArgs, `CmdValues` would still have it at the type level with no compiler error.

## Findings

- **Simplicity reviewer**: CmdValues/toCmd unnecessary, adds indirection without safety.
- **Architecture strategist**: "Pragmatic but has a type safety gap." Suggests typing values directly or adding a sync comment.
- **File**: `src/cli/main.ts:50-77`

## Proposed Solutions

### Option A: Cast parseArgs result directly
- Remove `CmdValues` and `toCmd()`. Use `as` cast inline or at parseArgs call site.
- **Effort**: Small
- **Risk**: Low

### Option B: Keep but add sync comment
- Add `// Must stay in sync with parseArgs options above` comment.
- **Effort**: Trivial
- **Risk**: Low

## Acceptance Criteria

- [ ] Unnecessary abstraction removed or justified with comment
- [ ] All command handlers still work correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
