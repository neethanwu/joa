---
status: complete
priority: p2
issue_id: "008"
tags: [code-review, quality, simplicity]
dependencies: []
---

# MCP server has identical try/catch boilerplate in all 3 tool handlers

## Problem Statement

All three MCP tool handlers (`joa_log`, `joa_query`, `joa_status`) follow the exact same pattern:

```typescript
try {
  // call core function
  return { content: [{ type: "text" as const, text: ... }] };
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`joa_<tool> error: ${message}`);
  return { isError: true, content: [{ type: "text" as const, text: `Error: ${message}` }] };
}
```

This pattern appears 3 times with `type: "text" as const` appearing 6 times total.

## Findings

- **Pattern recognition**: M4 moderate severity. Extract shared wrapper.
- **Simplicity reviewer**: `type: "text" as const` repetition adds noise.
- **File**: `src/mcp/server.ts:43-78,109-146,160-174`

## Proposed Solutions

### Option A: Extract `wrapToolHandler(name, fn)` helper
- Wraps the try/catch and response formatting.
- **Effort**: Small
- **Risk**: Low

### Option B: Extract `textContent(text)` and `errorResponse(name, err)` helpers
- Smaller extraction, keeps handlers explicit.
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Error handling logic exists in one place
- [ ] `type: "text" as const` not repeated 6 times
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
