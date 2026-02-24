import type { JoaDb } from "./db.ts";
import type { Entry, EntryInput } from "./entry.ts";
import { normalizeCategory, validateEntryInput } from "./entry.ts";
import { JournalWriteError } from "./errors.ts";
import { entryId, threadId as generateThreadId, isThreadId } from "./ids.ts";
import { appendEntry } from "./journal.ts";
import { nowUtc } from "./time.ts";

/** Read context — minimal, for query() and status(). */
export interface ReadContext {
  readonly db: JoaDb;
}

/** Write context — extends read, adds write-path metadata. */
export interface LogContext extends ReadContext {
  readonly journalsDir: string;
  readonly sessionId: string;
  readonly agent: string | null;
  readonly device: string | null;
  readonly defaultTags: readonly string[];
}

export interface LogInput {
  category: string;
  summary: string;
  thread_id?: string | null;
  detail?: Record<string, unknown>;
  resources?: string[];
  tags?: string[];
  annotations?: Record<string, unknown>;
}

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

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

/** Write a journal entry. JSONL first (source of truth), then SQLite (derived index). */
export async function log(input: LogInput, ctx: LogContext): Promise<LogOutput> {
  // 1. Validate before any I/O
  validateEntryInput(input as EntryInput);

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
    tags: dedupe([...(input.tags ?? []), ...ctx.defaultTags]),
    detail: input.detail ?? {},
    annotations: input.annotations ?? {},
  };

  // 4. JSONL first — source of truth
  try {
    await appendEntry(entry, ctx.journalsDir);
  } catch (cause) {
    throw new JournalWriteError("Failed to append entry to journal", { cause });
  }

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
