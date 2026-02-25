---
status: complete
priority: p3
issue_id: "012"
tags: [code-review, testing]
dependencies: []
---

# Duplicated makeLogCtx helper across 3 test files

## Problem Statement

`makeLogCtx` / `makeCtx` is defined separately in `test/core/log.test.ts`, `test/cli/main.test.ts`, and `test/mcp/server.test.ts`. All three are nearly identical — they construct a `LogContext` with in-memory defaults.

## Findings

- **Pattern recognition**: L3 low severity. Extract to `test/core/helpers.ts` alongside existing `makeEntry()`.

## Proposed Solutions

### Option A: Add `makeLogCtx()` to `test/core/helpers.ts` with optional overrides
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Single `makeLogCtx()` in helpers.ts used by all test files
- [ ] Supports overrides for agent name, tags, etc.

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
