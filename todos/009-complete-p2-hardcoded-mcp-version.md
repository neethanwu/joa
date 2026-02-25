---
status: complete
priority: p2
issue_id: "009"
tags: [code-review, quality]
dependencies: []
---

# MCP server has hardcoded version "0.1.0"

## Problem Statement

`src/mcp/server.ts:13` hardcodes `version: "0.1.0"` while the CLI reads version from `package.json` at runtime. These will drift as versions increment.

## Findings

- **Pattern recognition**: L1 low severity.
- **Architecture strategist**: Confirmed inconsistency.
- **File**: `src/mcp/server.ts:13`

## Proposed Solutions

### Option A: Read version from package.json like CLI does
- Use `import pkg from "../../package.json"` or `readFileSync` approach.
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] MCP server version comes from package.json
- [ ] Version stays in sync automatically

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
