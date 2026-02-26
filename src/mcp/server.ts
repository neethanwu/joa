import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { bootstrap, log, query, status } from "../core/index.ts";
import type { PresetName } from "../core/index.ts";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResponse(toolName: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${toolName} error: ${message}`);
  return { ...textContent(`Error: ${message}`), isError: true as const };
}

// Agent name is set by the CLI dispatcher via JOA_MCP_AGENT env var
// before dynamic-importing this module (see src/cli/main.ts "mcp" case).
const { config, readCtx, logCtx, sid } = await bootstrap({
  agent: process.env.JOA_MCP_AGENT ?? "mcp",
});

const server = new McpServer({
  name: "joa",
  version: pkg.version,
});

// ---------------------------------------------------------------------------
// joa_log
// ---------------------------------------------------------------------------

server.registerTool(
  "joa_log",
  {
    title: "Log Entry",
    description:
      "Log a journal entry to joa. Records observations, decisions, file changes, and other agent activity.",
    inputSchema: {
      category: z.string().describe("Entry category (e.g. observation, decision, file change)"),
      summary: z.string().describe("Short summary of the entry"),
      thread_id: z
        .union([z.literal("new"), z.string().startsWith("th_")])
        .nullable()
        .optional()
        .describe("Thread ID or 'new' to start a thread"),
      detail: z.record(z.string(), z.unknown()).optional().describe("Additional structured detail"),
      resources: z
        .array(z.string())
        .optional()
        .describe("File paths or URLs related to this entry"),
      tags: z.array(z.string()).optional().describe("Tags for categorization"),
      annotations: z.record(z.string(), z.unknown()).optional().describe("Metadata annotations"),
    },
  },
  async (args) => {
    try {
      const result = await log(
        {
          category: args.category,
          summary: args.summary,
          thread_id: args.thread_id,
          detail: args.detail,
          resources: args.resources,
          tags: args.tags,
          annotations: args.annotations,
        },
        logCtx,
      );
      return textContent(
        JSON.stringify({
          entry_id: result.entry_id,
          thread_id: result.thread_id,
          status: result.status,
          ...(result.warning ? { warning: result.warning } : {}),
        }),
      );
    } catch (err) {
      return errorResponse("joa_log", err);
    }
  },
);

// ---------------------------------------------------------------------------
// joa_query
// ---------------------------------------------------------------------------

server.registerTool(
  "joa_query",
  {
    title: "Query Entries",
    description:
      "Query journal entries from joa. Supports presets (catchup, threads, timeline, decisions, changes), full-text search, and filters.",
    inputSchema: {
      preset: z
        .enum(["catchup", "threads", "timeline", "decisions", "changes"])
        .optional()
        .describe("Query preset"),
      thread_id: z.string().optional().describe("Filter by thread ID"),
      session_id: z.string().optional().describe("Filter by session ID"),
      category: z.string().optional().describe("Filter by category"),
      agent: z.string().optional().describe("Filter by agent name"),
      device: z.string().optional().describe("Filter by device name"),
      search: z.string().optional().describe("Full-text search term"),
      tags: z.array(z.string()).optional().describe("Filter by tags (AND semantics)"),
      since: z.string().optional().describe("Time filter: 1d, 7d, 2w, 1m, or ISO date"),
      until: z.string().optional().describe("Time upper bound"),
      limit: z.number().int().min(1).max(1000).optional().describe("Max entries to return"),
      format: z.enum(["md", "json", "compact"]).optional().describe("Output format (default: md)"),
    },
  },
  async (args) => {
    try {
      const result = query(
        {
          preset: args.preset as PresetName | undefined,
          thread_id: args.thread_id,
          session_id: args.session_id,
          category: args.category,
          agent: args.agent,
          device: args.device,
          search: args.search,
          tags: args.tags,
          since: args.since,
          until: args.until,
          limit: args.limit,
          format: args.format ?? "md",
        },
        readCtx,
        config,
      );

      let text = result.rendered;
      if (result.total > result.entries.length) {
        text += `\n\n_Showing ${result.entries.length} of ${result.total} entries_`;
      }

      return textContent(text);
    } catch (err) {
      return errorResponse("joa_query", err);
    }
  },
);

// ---------------------------------------------------------------------------
// joa_status
// ---------------------------------------------------------------------------

server.registerTool(
  "joa_status",
  {
    title: "Journal Status",
    description: "Get journal health stats: entry count, categories, timestamps, DB health.",
    inputSchema: {},
  },
  async () => {
    try {
      const s = status(readCtx, config, sid);
      return textContent(JSON.stringify(s, null, 2));
    } catch (err) {
      return errorResponse("joa_status", err);
    }
  },
);

// ---------------------------------------------------------------------------
// Start transport
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("joa MCP server started");

// Clean shutdown
function shutdown(): void {
  console.error("joa MCP server shutting down");
  logCtx.db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
