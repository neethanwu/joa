import type { JoaConfig, PresetName } from "./config.ts";
import type { JoaDb, QueryParams, ThreadSummaryRow } from "./db.ts";
import type { Entry } from "./entry.ts";
import { deserializeEntry } from "./entry.ts";
import { formatCompact, formatJson, formatMd } from "./formatters.ts";
import type { ReadContext } from "./log.ts";
import { parseSince } from "./time.ts";
import type { ISOTimestamp } from "./time.ts";

export interface QueryInput {
  preset?: PresetName;
  thread_id?: string;
  session_id?: string;
  category?: string;
  agent?: string;
  device?: string;
  search?: string;
  tags?: string[];
  since?: string;
  until?: string;
  limit?: number;
  format?: "md" | "json" | "compact";
}

export interface QueryOutput {
  entries: Entry[];
  rendered: string;
  total: number;
  format: "md" | "json" | "compact";
}

/** Escape FTS5 special characters by wrapping in double quotes. */
function escapeFts(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

function formatThreadSummary(threads: ThreadSummaryRow[]): string {
  if (threads.length === 0) return "No active threads.";

  return threads
    .map((t) => {
      const agents = t.agents ? ` (${t.agents})` : "";
      return `- **${t.first_summary}**\n  Thread: ${t.thread_id} \u00b7 ${t.entry_count} entries \u00b7 Last active: ${t.last_active_at}${agents}`;
    })
    .join("\n\n");
}

/** Query entries with optional preset, filters, and formatting. */
export function query(input: QueryInput, ctx: ReadContext, config: JoaConfig): QueryOutput {
  const format = input.format ?? "md";
  const presetConfig = input.preset ? config.presets[input.preset] : undefined;

  // Threads preset is special — uses the thread_summary view
  if (input.preset === "threads") {
    const limit = input.limit ?? presetConfig?.thread_limit ?? 20;
    const threads = ctx.db.queryThreadSummary(limit);
    const rendered = formatThreadSummary(threads);
    return {
      entries: [],
      rendered,
      total: threads.length,
      format,
    };
  }

  // Build query params from preset + direct input
  const params: QueryParams = {};

  // Apply preset defaults
  if (input.preset === "catchup") {
    params.since = parseSince("7d");
    params.limit = input.limit ?? presetConfig?.default_limit ?? 50;
  } else if (input.preset === "timeline") {
    params.limit = input.limit ?? presetConfig?.default_limit ?? 50;
  } else if (input.preset === "decisions") {
    params.category = "decision";
    params.limit = input.limit ?? presetConfig?.default_limit ?? 50;
  } else if (input.preset === "changes") {
    params.category = "file change";
    params.limit = input.limit ?? presetConfig?.default_limit ?? 50;
  }

  // Direct params override preset defaults
  if (input.thread_id) params.thread_id = input.thread_id;
  if (input.session_id) params.session_id = input.session_id;
  if (input.category) params.category = input.category.trim().toLowerCase();
  if (input.agent) params.agent = input.agent;
  if (input.device) params.device = input.device;
  if (input.tags) params.tags = input.tags;
  if (input.since) params.since = parseSince(input.since);
  if (input.until) params.until = parseSince(input.until);
  if (input.limit !== undefined) params.limit = input.limit;
  if (!params.limit) params.limit = 50;

  // FTS search — escape special chars
  if (input.search) {
    params.search = escapeFts(input.search);
  }

  // Get total count (before limit)
  const countParams = { ...params };
  countParams.limit = undefined;
  countParams.offset = undefined;
  const total = ctx.db.countEntries(countParams);

  // Query entries
  const rows = ctx.db.queryEntries(params);
  const entries = rows.map(deserializeEntry);

  // Format output
  let rendered: string;
  switch (format) {
    case "json":
      rendered = formatJson(entries);
      break;
    case "compact":
      rendered = formatCompact(entries);
      break;
    default:
      rendered = formatMd(entries);
  }

  return { entries, rendered, total, format };
}
