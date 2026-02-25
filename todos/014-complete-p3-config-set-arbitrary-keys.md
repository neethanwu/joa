---
status: complete
priority: p3
issue_id: "014"
tags: [code-review, security]
dependencies: []
---

# config set allows writing arbitrary keys without validation

## Problem Statement

`cmdConfigSet` accepts any key path and writes it to the YAML config file without validating against the config schema. Users could accidentally create invalid config keys that are silently ignored, or overwrite structural keys.

## Findings

- **Security sentinel**: Medium severity — config set allows arbitrary keys.
- **Architecture strategist**: "cmdConfigSet contains YAML write logic that probably belongs in core."
- **File**: `src/cli/main.ts:548-607`

## Proposed Solutions

### Option A: Validate key against known config schema before writing
- **Effort**: Small
- **Risk**: Low

### Option B: Move config write logic to core with validation
- **Effort**: Medium
- **Risk**: Low

## Acceptance Criteria

- [ ] Invalid config keys produce an error message
- [ ] Valid keys still work normally

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-02-25 | Created from code review | |
