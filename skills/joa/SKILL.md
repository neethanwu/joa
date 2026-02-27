---
name: joa
description: Persistent activity journal for AI agents. Use joa to log decisions, file changes, errors, observations, and conversations — then query them for context in future sessions. Use at session start for catchup, mid-session when prior context would help, and throughout to log meaningful events.
license: MIT
compatibility: Requires joa CLI installed via `npm install -g joa`, or the joa MCP server configured for your agent platform.
metadata:
  author: neethan
  version: "0.1.0"
allowed-tools: Bash(joa:*), mcp__joa__*
---

# joa — Agent Instructions

Persistent activity journal. You write entries, you query them later. The journal builds context across sessions so you (and future agents) can understand what happened and why.

## When to Query

Querying is not a one-time session-start ritual. Query whenever context from the journal would make your response better.

**Session start**: Call `joa_query { preset: "catchup" }` to orient. Silently absorb context — only surface it when directly relevant to the user's request. If the journal is empty, proceed normally.

**Recognition triggers**: When the user asks about something that might have prior context — a project, a person, a topic, a past decision — query before answering.

```json
{ "search": "auth middleware", "category": "decision" }
{ "search": "payment service", "preset": "timeline" }
{ "tags": ["project:my-app"], "since": "7d" }
```

**Mid-session**: When you hit something unfamiliar, want to understand past decisions, or the user references "yesterday" or "last week" — query. Don't guess when the journal might have the answer.

**Thread resumption**: When continuing work that relates to a previous thread, query the thread first to understand full context before adding entries.

## When to Log

Think of logging like production observability. Don't log noise, but don't miss anything meaningful. The goal is traceability — anyone should be able to reconstruct the story of a session from its entries.

**Log every meaningful event:**
- File changes (with paths and reasoning)
- Decisions (with reasoning, alternatives, confidence)
- Errors and their resolutions
- Commands with notable outcomes
- Test results
- Observations and insights
- Conversations and preferences the user shares
- Research findings
- Milestones and completions

**"If it might be useful later, log it."** An entry that's never queried costs nothing. A missing entry when you need context is a real loss.

**What NOT to log**: Trivial intermediate steps with no lasting value — "ran `ls` to check directory", "read file contents". The test: would this entry help someone understand what happened and why?

**Batch when natural**: If you edit 5 files as part of one logical change, one entry with all paths in `resources` is better than 5 separate entries. But if each edit has different reasoning, separate entries are fine.

## Entry Quality

Good entries have specific summaries, structured detail, and relevant metadata.

**Summaries**: Describe what actually happened and why — not just "edited file".
- Bad: `"Updated auth file"`
- Good: `"Refactored auth middleware to use JWT refresh tokens instead of session cookies"`

**Detail**: Structured object with fields relevant to the category. See category table below.

**Resources**: Always attach relevant file paths or URLs.

**Tags**: Use for retrieval. Conventions: `project:<name>`, `person:<name>`, plus topic tags.

## Categories

Use these consistently so filtering works. Domain-specific categories are fine too.

| Category | When to use | Detail fields |
|---|---|---|
| `file change` | Created, modified, deleted, moved a file | `path`, `language`, `diff_summary`, `reason` |
| `decision` | Made or rejected a decision | `decision`, `reasoning`, `alternatives`, `confidence` |
| `error` | Encountered or resolved an error | `error`, `resolution`, `stack_trace` |
| `command` | Ran a shell command, installed a dependency | `command`, `exit_code`, `duration_ms` |
| `test` | Ran tests | `passed`, `failed`, `skipped`, `duration_ms` |
| `research` | Discovered useful information | `source`, `findings`, `relevance` |
| `conversation` | Noted something from a conversation | `context`, `people`, `topics` |
| `observation` | Free-form insight or note | (freeform) |
| `milestone` | Completed a significant piece of work | `scope`, `next_steps` |
| `preference` | Recorded a user preference | `context`, `related_to` |
| `plan` | Outlined a plan or approach | `scope`, `steps`, `risks` |
| `memory` | Something worth remembering | `context`, `related_to` |

Always use the exact category string (e.g., `"decision"` not `"Decision"` or `"decisions"`). joa normalizes to lowercase, but consistency helps readability.

## Threads

Threads group related entries into a workstream. They are optional — many entries don't need them.

- **Start a thread**: `thread_id: "new"` — joa returns a `th_`-prefixed ID
- **Continue a thread**: Use the exact `thread_id` from a previous entry or query result
- **When to use**: Bug fixes, feature implementations, research projects, multi-step tasks
- **When not to use**: Standalone observations, preferences, one-off commands

## Non-Work Context

Log conversations, personal details, preferences, and memories — anything the user mentions that might be useful in future sessions.

- Use category `"preference"`, `"memory"`, or `"conversation"`
- These entries typically don't need thread IDs
- Tag with `person:<name>` when relevant

Examples:
- User mentions they prefer tabs over spaces → log as `preference`
- User shares they're preparing for a conference → log as `memory`
- User discusses project priorities with a colleague → log as `conversation`

## MCP Tools

### joa_log

Log a journal entry.

```json
{
  "category": "decision",
  "summary": "Chose PostgreSQL over MongoDB for user data",
  "detail": {
    "decision": "Use PostgreSQL",
    "reasoning": "Need ACID transactions for payment data",
    "alternatives": ["MongoDB", "DynamoDB"],
    "confidence": "high"
  },
  "resources": ["docs/architecture.md"],
  "tags": ["project:payments", "database"],
  "thread_id": "new"
}
```

Returns: `{ entry_id, thread_id, status }`.

### joa_query

Query journal entries. Supports presets, full-text search, and filters.

**Presets** (curated views):
- `catchup` — Recent entries across key categories (last 7 days)
- `threads` — Active threads summary
- `timeline` — Chronological entries
- `decisions` — Decision entries only
- `changes` — File change entries only

**Filters** (combine freely):
- `search` — Full-text search
- `category` — Filter by category
- `tags` — Filter by tags (AND semantics)
- `thread_id` — Filter by thread
- `since` / `until` — Time range (`1d`, `7d`, `2w`, `1m`, or ISO date)
- `agent` — Filter by agent name
- `limit` — Max entries (default: 50)
- `format` — `md` (default for MCP), `json`, `compact`

```json
{ "preset": "catchup" }
{ "search": "auth", "category": "decision", "since": "7d" }
{ "tags": ["project:payments"], "preset": "timeline" }
```

### joa_status

Get journal health: entry count, categories, timestamps, DB health. No parameters.

## Error Handling

- If `joa_log` fails: Note the error, continue working. Do not retry in a loop.
- If `joa_query` returns no entries: Proceed normally. Empty journal is expected on first use.
- If `joa_status` shows DB issues: Suggest `joa rebuild` to the user.

## Additional Resources

- For MCP server setup and tool parameter reference, see [references/mcp-setup.md](references/mcp-setup.md)
