---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, quality, ux]
dependencies: []
---

# Error hierarchy not leveraged — all errors shown identically

## Problem Statement

The top-level catch in CLI (line 675-678) and all MCP tool handlers flatten every error to `"Error: <message>"`. `ValidationError` (user's fault, fixable) is presented the same way as `DatabaseError` (infrastructure failure). `ValidationError` should not warrant `process.exit(1)` — it should print usage guidance. The custom error hierarchy (`JoaError > ValidationError, DatabaseError, ConfigError`) was purpose-built for this discrimination.

## Findings

- **Pattern recognition**: M2 moderate severity. The error hierarchy exists but is not leveraged by consumers.
- **Files**: `src/cli/main.ts:675-678`, `src/mcp/server.ts:71,139,167`

## Proposed Solutions

### Option A: Discriminate error types in catch blocks
- CLI: `ValidationError` → print message + usage hint, exit 1. `DatabaseError` → print message + "database may be corrupt", exit 2.
- MCP: Include error type in response for better agent handling.
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] `ValidationError` shown with user-friendly guidance (not just "Error:")
- [ ] Different exit codes for different error types in CLI
- [ ] Error type included in MCP error responses

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
