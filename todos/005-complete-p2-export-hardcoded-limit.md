---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, quality]
dependencies: []
---

# Export command hardcoded to 1000 entry limit

## Problem Statement

`cmdExport` passes `limit: 1000` to `query()`, silently truncating exports for journals with more than 1000 entries. There's no `--all` flag or way to override. Users may believe they exported everything when they didn't.

## Findings

- **TypeScript reviewer**: High severity — silent data loss on export.
- **Performance oracle**: P1 — export cap arbitrary.
- **File**: `src/cli/main.ts:311`

## Proposed Solutions

### Option A: Add `--all` flag that removes limit
- **Pros**: Simple, explicit user intent.
- **Effort**: Small
- **Risk**: Low

### Option B: Default to no limit for export, add `--limit` to restrict
- **Pros**: Export should default to everything.
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Export can retrieve all entries (not capped at 1000)
- [ ] User has control over limiting if desired

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
