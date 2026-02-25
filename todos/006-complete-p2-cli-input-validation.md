---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, quality, typescript]
dependencies: []
---

# CLI doesn't validate preset, limit, or empty search inputs

## Problem Statement

Several CLI inputs are passed through without validation:
1. `--preset foo` silently becomes a no-op (MCP validates via Zod, CLI does not)
2. `--limit abc` produces `NaN` passed to query (no `Number.parseInt` validation)
3. `--search ""` empty string passed to FTS (should be treated as no search)

## Findings

- **TypeScript reviewer**: Medium severity for each — unvalidated preset, NaN limit, empty search.
- **Pattern recognition**: L5 — CLI doesn't validate `--preset` before passing to `query()`.
- **Files**: `src/cli/main.ts:247` (preset), `src/cli/main.ts:258` (limit), `src/cli/main.ts:252` (search)

## Proposed Solutions

### Option A: Add inline validation before calling core
- Validate preset against known list, parse limit with NaN check, skip empty search
- **Effort**: Small
- **Risk**: Low

## Acceptance Criteria

- [ ] Invalid `--preset` shows error message listing valid presets
- [ ] Non-numeric `--limit` shows error message
- [ ] Empty `--search ""` is treated as no search filter

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
