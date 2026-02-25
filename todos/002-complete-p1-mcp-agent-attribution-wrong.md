---
status: complete
priority: p1
issue_id: "002"
tags: [code-review, architecture, data-correctness]
dependencies: ["001"]
---

# MCP entries mislabeled with agent: "cli"

## Problem Statement

`bootstrap()` hardcodes the agent fallback to `"cli"` (line 38: `agent: config.defaults.agent ?? "cli"`). The MCP server calls `bootstrap()` without overriding, so all MCP-logged entries get `agent: "cli"` — making it impossible to distinguish CLI vs MCP entries when querying by agent. This produces incorrect data in the journal that is difficult to retroactively fix.

## Findings

- **Architecture strategist**: "MCP agent attribution is wrong. All entries logged via MCP get `agent: "cli"`. Severity: Medium."
- **File**: `src/cli/bootstrap.ts:38`

## Proposed Solutions

### Option A: Parameterize bootstrap() with options
- **Pros**: Clean, extensible. MCP calls `bootstrap({ agent: "mcp" })`.
- **Cons**: Minor API change.
- **Effort**: Small
- **Risk**: Low

```typescript
interface BootstrapOptions {
  agent?: string;
}
export async function bootstrap(opts?: BootstrapOptions): Promise<BootstrapResult> {
  // ...
  agent: opts?.agent ?? config.defaults.agent ?? "cli",
}
```

## Recommended Action

Option A — add options parameter.

## Technical Details

**Affected files:**
- `src/cli/bootstrap.ts` (or wherever it moves per #001) — add options param
- `src/mcp/server.ts` — pass `{ agent: "mcp" }`

## Acceptance Criteria

- [ ] MCP-logged entries have `agent: "mcp"` (or similar, not "cli")
- [ ] CLI-logged entries still default to `agent: "cli"`
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | Depends on #001 |

## Resources

- Architecture strategist review
