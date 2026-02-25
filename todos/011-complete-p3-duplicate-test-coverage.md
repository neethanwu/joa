---
status: complete
priority: p3
issue_id: "011"
tags: [code-review, simplicity, testing]
dependencies: []
---

# CLI and MCP tests duplicate ~200 lines of core test coverage

## Problem Statement

`test/cli/main.test.ts` and `test/mcp/server.test.ts` re-test core functions (log, query, status) that are already thoroughly tested in `test/core/`. The bootstrap test (`test/cli/bootstrap.test.ts`) replicates bootstrap logic inline and never actually calls `bootstrap()`.

## Findings

- **Simplicity reviewer**: ~200 lines removable. CLI and MCP tests should focus on interface-specific behavior (arg parsing, output formatting, error presentation), not re-testing core logic.
- **Pattern recognition**: bootstrap.test.ts "tests nothing" — replicates bootstrap logic inline.

## Proposed Solutions

### Option A: Remove duplicated core tests, keep interface-specific tests
- CLI tests: keep config alias resolution, value detection, export/import JSONL format, colorize output
- MCP tests: keep response formatting, error structure, JSON serialization
- Remove tests that just call `core.log()` and check the result
- Rewrite bootstrap.test.ts to actually test `bootstrap()`
- **Effort**: Medium
- **Risk**: Low

## Acceptance Criteria

- [ ] No CLI/MCP test duplicates a core test
- [ ] Interface-specific behavior still tested
- [ ] bootstrap.test.ts actually calls bootstrap()

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
