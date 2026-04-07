# joa MCP Server Setup

## Install

```bash
npm install -g @neethan/joa
```

## Configure MCP Client

Use `joa setup` for interactive configuration, or manually add the config below.

The `--agent` flag sets the agent name on all entries logged via MCP, making it possible to filter entries by which agent created them. If omitted, defaults to `"mcp"`.

### Universal Agents

**Claude Code** (`~/.claude.json` global, or `.mcp.json` local):
```json
{
  "mcpServers": {
    "joa": {
      "command": "joa",
      "args": ["mcp", "--agent", "claude-code"]
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json` global, or `.cursor/mcp.json` local):
```json
{
  "mcpServers": {
    "joa": {
      "command": "joa",
      "args": ["mcp", "--agent", "cursor"]
    }
  }
}
```

**Gemini CLI** (`~/.gemini/settings.json` global, or `.gemini/settings.json` local):
```json
{
  "mcpServers": {
    "joa": {
      "command": "joa",
      "args": ["mcp", "--agent", "gemini-cli"]
    }
  }
}
```

**Codex** (`~/.codex/config.toml` global, or `.codex/config.toml` local):
```toml
[mcp_servers.joa]
command = "joa"
args = ["mcp", "--agent", "codex"]
```

**Amp** (`~/.config/amp/settings.json` global, or `.amp/settings.json` local):
```json
{
  "amp.mcpServers": {
    "joa": {
      "command": "joa",
      "args": ["mcp", "--agent", "amp"]
    }
  }
}
```

**OpenCode** (`~/.config/opencode/opencode.json` global, or `opencode.json` local):
```json
{
  "mcp": {
    "joa": {
      "type": "local",
      "command": ["joa", "mcp", "--agent", "opencode"]
    }
  }
}
```

### Additional Agents

**GitHub Copilot** (VS Code `mcp.json` global, or `.vscode/mcp.json` local):
```json
{
  "servers": {
    "joa": {
      "type": "stdio",
      "command": "joa",
      "args": ["mcp", "--agent", "github-copilot"]
    }
  }
}
```

**Pi** (`~/.pi/mcp.json` global, or `.pi/mcp.json` local):
```json
{
  "mcpServers": {
    "joa": {
      "command": "joa",
      "args": ["mcp", "--agent", "pi"]
    }
  }
}
```

## MCP Tools Reference

### joa_log

Log a journal entry.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | string | Yes | Entry category (e.g., `"decision"`, `"file change"`, `"error"`) |
| `summary` | string | Yes | Short description of what happened and why |
| `thread_id` | string \| null | No | `"new"` to start a thread, or a `th_`-prefixed ID to continue one |
| `detail` | object | No | Structured data — fields depend on category |
| `resources` | string[] | No | File paths or URLs related to this entry |
| `tags` | string[] | No | Tags for categorization and retrieval |
| `annotations` | object | No | Metadata annotations |

**Returns**: `{ entry_id, thread_id, status }` — `thread_id` is returned when a new thread is created.

### joa_query

Query journal entries with presets, search, and filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `preset` | enum | No | `catchup`, `threads`, `timeline`, `decisions`, `changes` |
| `search` | string | No | Full-text search term |
| `category` | string | No | Filter by category |
| `tags` | string[] | No | Filter by tags (AND semantics) |
| `thread_id` | string | No | Filter by thread ID |
| `session_id` | string | No | Filter by session ID |
| `agent` | string | No | Filter by agent name |
| `device` | string | No | Filter by device name |
| `since` | string | No | Time filter: `1d`, `7d`, `2w`, `1m`, or ISO date |
| `until` | string | No | Time upper bound |
| `limit` | number | No | Max entries to return (1-1000, default: 50) |
| `format` | enum | No | `md` (default), `json`, `compact` |

### joa_status

Get journal health stats. No parameters.

**Returns**: Entry count, categories breakdown, oldest/newest timestamps, session ID, DB path, DB health, journal file count.

## Troubleshooting

- **Empty journal**: Normal on first use. `joa_query` returns "No entries found." — proceed normally.
- **DB unhealthy**: Run `joa rebuild` to rebuild the SQLite index from JSONL source files.
- **MCP server not starting**: Verify joa is installed (`which joa`) and the config path is correct for your platform.
