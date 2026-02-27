# joa

[![CI](https://github.com/neethanwu/joa/actions/workflows/ci.yml/badge.svg)](https://github.com/neethanwu/joa/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/joa)](https://www.npmjs.com/package/joa)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Persistent activity journal for AI agents. Log decisions, file changes, errors, and observations — then query them for context across sessions.

## What is joa?

AI agents lose context between sessions. joa gives them a journal — a structured log of what happened and why, queryable by any agent on any platform. Start a session with `catchup` to see what happened last time. Log meaningful events as you work. Future sessions inherit the full picture.

Works as a **CLI tool** and as an **MCP server** for agent platforms like Claude Code, Cursor, Gemini CLI, Codex, Amp, and more.

## Install

```bash
npm install -g joa
```

Requires Node.js >= 18.

## Quick Start

```bash
# Log an entry
joa log "Chose PostgreSQL over MongoDB for user data" -c decision -t project:api

# See recent activity
joa catchup

# Search the journal
joa search "PostgreSQL"

# Check journal health
joa status
```

## MCP Server Setup

joa runs as an MCP server so agents can log and query entries directly.

**Claude Code** (`~/.claude.json` or `.mcp.json`):

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

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json`):

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

Or run `joa setup` for interactive configuration.

<details>
<summary>All supported platforms</summary>

**Gemini CLI** (`~/.gemini/settings.json`):

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

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.joa]
command = "joa"
args = ["mcp", "--agent", "codex"]
```

**Amp** (`~/.config/amp/settings.json`):

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

**OpenCode** (`~/.config/opencode/opencode.json`):

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

**GitHub Copilot** (VS Code `mcp.json` or `.vscode/mcp.json`):

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

**Pi** (`~/.pi/mcp.json`):

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

</details>

## CLI Commands

**Logging:**

```
joa log <summary>       Log an entry
  -c, --category <cat>  Category (decision, change, observation, error, ...)
  -t, --tag <tag>       Tag (repeatable, e.g. project:api)
  --thread <id|new>     Thread ID or "new" to start one
  --detail <json>       Structured detail as JSON
```

**Querying:**

```
joa query               Query with filters
joa catchup             Recent entries (last 7 days)
joa threads             Active threads summary
joa timeline            Chronological entries
joa decisions           Decision entries
joa search <term>       Full-text search
```

**Maintenance:**

```
joa status              Journal health and stats
joa rebuild             Rebuild SQLite index from JSONL
joa export              Export entries as JSONL to stdout
joa import <file>       Import entries from JSONL (or - for stdin)
joa setup               Configure MCP for agent platforms
joa config get|set      View or update configuration
```

Run `joa <command> --help` for detailed usage.

## How It Works

joa writes entries to **JSONL files** (one per day, append-only) as the source of truth, then indexes them in **SQLite with FTS5** for fast full-text search and filtered queries.

```
~/.joa/
  journals/
    2026-02-27.jsonl    # Append-only daily logs
    2026-02-26.jsonl
  journal.db            # SQLite FTS5 index (derived, rebuildable)
  config.yaml           # Optional configuration
```

If the SQLite index is ever lost or corrupted, `joa rebuild` reconstructs it from the JSONL files.

Runs on both **Node.js** (published CLI) and **Bun** (development).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
