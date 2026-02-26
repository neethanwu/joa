import { InvalidThreadId, ValidationError } from "./errors.ts";
import { isThreadId } from "./ids.ts";

/** A fully resolved entry — the canonical representation in memory. */
export interface Entry {
  id: string;
  timestamp: string;
  category: string;
  summary: string;
  thread_id: string | null;
  session_id: string;
  agent: string | null;
  device: string | null;
  resources: string[];
  tags: string[];
  detail: Record<string, unknown>;
  annotations: Record<string, unknown>;
}

/** What joa_log accepts from the caller. */
export interface EntryInput {
  category: string;
  summary: string;
  thread_id?: string | null;
  detail?: Record<string, unknown>;
  resources?: string[];
  tags?: string[];
  annotations?: Record<string, unknown>;
}

/** What SQLite stores (JSON fields serialized as TEXT). */
export interface EntryRow {
  id: string;
  timestamp: string;
  category: string;
  summary: string;
  thread_id: string | null;
  session_id: string;
  agent: string | null;
  device: string | null;
  resources: string;
  tags: string;
  detail: string;
  annotations: string;
}

/** Normalizes a category string: lowercase + trim. Throws if empty after normalization. */
export function normalizeCategory(category: string): string {
  const normalized = category.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new ValidationError("category must not be empty");
  }
  return normalized;
}

/** Converts an Entry to an EntryRow for SQLite storage. */
export function serializeEntry(entry: Entry): EntryRow {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    category: entry.category,
    summary: entry.summary,
    thread_id: entry.thread_id,
    session_id: entry.session_id,
    agent: entry.agent,
    device: entry.device,
    resources: JSON.stringify(entry.resources),
    tags: JSON.stringify(entry.tags),
    detail: JSON.stringify(entry.detail),
    annotations: JSON.stringify(entry.annotations),
  };
}

/** Converts an EntryRow from SQLite back to an Entry. */
export function deserializeEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    category: row.category,
    summary: row.summary,
    thread_id: row.thread_id,
    session_id: row.session_id,
    agent: row.agent,
    device: row.device,
    resources: JSON.parse(row.resources),
    tags: JSON.parse(row.tags),
    detail: JSON.parse(row.detail),
    annotations: JSON.parse(row.annotations),
  };
}

/** Validates EntryInput. Throws ValidationError or InvalidThreadId before any I/O. */
export function validateEntryInput(input: EntryInput): void {
  // category
  const cat = input.category?.trim().toLowerCase() ?? "";
  if (cat.length === 0) {
    throw new ValidationError("category must not be empty");
  }

  // summary
  if (!input.summary || input.summary.trim().length === 0) {
    throw new ValidationError("summary must not be empty");
  }

  // thread_id
  if (input.thread_id !== undefined && input.thread_id !== null) {
    if (input.thread_id !== "new" && !isThreadId(input.thread_id)) {
      throw new InvalidThreadId(
        `Invalid thread_id: "${input.thread_id}". Must be null, "new", or a th_ prefixed ULID.`,
      );
    }
  }

  // tags
  if (input.tags) {
    for (const tag of input.tags) {
      if (typeof tag !== "string") {
        throw new ValidationError("tags must be strings");
      }
      if (tag.trim().length === 0) {
        throw new ValidationError("tag must not be empty");
      }
      if (tag.includes('"') || tag.includes("\\")) {
        throw new ValidationError('tag must not contain " or \\');
      }
    }
  }

  // resources
  if (input.resources) {
    for (const r of input.resources) {
      if (typeof r !== "string") {
        throw new ValidationError("resources must be strings");
      }
    }
  }
}
