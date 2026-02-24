import type { LogContext } from "./context.ts";
import type { Entry, EntryInput } from "./entry.ts";
import { normalizeCategory, validateEntryInput } from "./entry.ts";
import { entryId, threadId as generateThreadId } from "./ids.ts";
import { appendEntry } from "./journal.ts";
import { nowUtc } from "./time.ts";

export type LogInput = EntryInput;

export interface LogOutput {
  entry_id: string;
  thread_id: string | null;
  status: "ok";
  /** Present only when JSONL succeeded but SQLite index write failed. */
  warning?: "index_sync_failed";
}

function resolveThreadId(tid: string | null | undefined): string | null {
  if (tid === undefined || tid === null) return null;
  if (tid === "new") return generateThreadId();
  return tid; // already validated by validateEntryInput
}

/** Write a journal entry. JSONL first (source of truth), then SQLite (derived index). */
export async function log(input: LogInput, ctx: LogContext): Promise<LogOutput> {
  // 1. Validate before any I/O
  validateEntryInput(input);

  // 2. Resolve thread_id
  const resolvedThreadId = resolveThreadId(input.thread_id);

  // 3. Build entry
  const entry: Entry = {
    id: entryId(),
    timestamp: nowUtc(),
    category: normalizeCategory(input.category),
    summary: input.summary.trim(),
    thread_id: resolvedThreadId,
    session_id: ctx.sessionId,
    agent: ctx.agent,
    device: ctx.device,
    resources: input.resources ?? [],
    tags: [...new Set([...(input.tags ?? []), ...ctx.defaultTags])],
    detail: input.detail ?? {},
    annotations: input.annotations ?? {},
  };

  // 4. JSONL first — source of truth
  await appendEntry(entry, ctx.journalsDir);

  // 5. SQLite second — derived index
  try {
    ctx.db.writeEntry(entry);
  } catch {
    // Entry is durable in JSONL; index will recover on next startup
    return {
      entry_id: entry.id,
      thread_id: entry.thread_id,
      status: "ok",
      warning: "index_sync_failed",
    };
  }

  return { entry_id: entry.id, thread_id: entry.thread_id, status: "ok" };
}
