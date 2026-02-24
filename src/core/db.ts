import { Database } from "bun:sqlite";
import { statSync } from "node:fs";
import type { Entry, EntryRow } from "./entry.ts";
import { serializeEntry } from "./entry.ts";
import { DatabaseError } from "./errors.ts";
import type { ISOTimestamp } from "./time.ts";

export interface QueryParams {
  thread_id?: string;
  session_id?: string;
  category?: string;
  agent?: string;
  device?: string;
  search?: string;
  tags?: string[];
  since?: ISOTimestamp;
  until?: ISOTimestamp;
  limit?: number;
  offset?: number;
}

export interface ThreadSummaryRow {
  thread_id: string;
  entry_count: number;
  first_entry_at: string;
  last_active_at: string;
  first_summary: string;
  agents: string;
}

/** Narrow database interface — decouples operation layer from bun:sqlite. */
export interface JoaDb {
  writeEntry(entry: Entry): void;
  queryEntries(params: QueryParams): EntryRow[];
  countEntries(params: QueryParams): number;
  queryThreadSummary(limit: number): ThreadSummaryRow[];
  countByCategory(): Record<string, number>;
  getEntryTimestampRange(): { oldest: string | null; newest: string | null };
  getLastIndexedAt(): string | null;
  setLastIndexedAt(ts: string): void;
  rebuildFts(): void;
  getDbSizeBytes(): number;
  isHealthy(): boolean;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id          TEXT PRIMARY KEY,
  timestamp   TEXT NOT NULL,
  category    TEXT NOT NULL,
  summary     TEXT NOT NULL,
  thread_id   TEXT,
  session_id  TEXT,
  agent       TEXT,
  device      TEXT,
  resources   TEXT,
  tags        TEXT,
  detail      TEXT,
  annotations TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  summary, detail, resources, tags,
  content=entries,
  content_rowid=rowid,
  tokenize='porter'
);

CREATE INDEX IF NOT EXISTS idx_entries_timestamp      ON entries(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_entries_category       ON entries(category);
CREATE INDEX IF NOT EXISTS idx_entries_thread         ON entries(thread_id);
CREATE INDEX IF NOT EXISTS idx_entries_session        ON entries(session_id);
CREATE INDEX IF NOT EXISTS idx_entries_agent          ON entries(agent);
CREATE INDEX IF NOT EXISTS idx_entries_device         ON entries(device);
CREATE INDEX IF NOT EXISTS idx_entries_thread_ts      ON entries(thread_id, timestamp DESC);

CREATE VIEW IF NOT EXISTS thread_summary AS
SELECT
  e.thread_id,
  COUNT(*)                              AS entry_count,
  MIN(e.timestamp)                      AS first_entry_at,
  MAX(e.timestamp)                      AS last_active_at,
  (SELECT summary FROM entries
   WHERE thread_id = e.thread_id
   ORDER BY timestamp ASC LIMIT 1)     AS first_summary,
  GROUP_CONCAT(DISTINCT e.agent)        AS agents
FROM entries e
WHERE e.thread_id IS NOT NULL
GROUP BY e.thread_id
ORDER BY last_active_at DESC;
`;

type BindValue = string | number | null;

function buildWhereClause(params: QueryParams): { sql: string; values: BindValue[] } {
  const conditions: string[] = [];
  const values: BindValue[] = [];

  if (params.thread_id) {
    conditions.push("e.thread_id = ?");
    values.push(params.thread_id);
  }
  if (params.session_id) {
    conditions.push("e.session_id = ?");
    values.push(params.session_id);
  }
  if (params.category) {
    conditions.push("e.category = ?");
    values.push(params.category.trim().toLowerCase());
  }
  if (params.agent) {
    conditions.push("e.agent = ?");
    values.push(params.agent);
  }
  if (params.device) {
    conditions.push("e.device = ?");
    values.push(params.device);
  }
  if (params.since) {
    conditions.push("e.timestamp >= ?");
    values.push(params.since);
  }
  if (params.until) {
    conditions.push("e.timestamp <= ?");
    values.push(params.until);
  }
  if (params.tags?.length) {
    for (const tag of params.tags) {
      conditions.push("e.tags LIKE ?");
      values.push(`%"${tag}"%`);
    }
  }
  if (params.search) {
    conditions.push("e.rowid IN (SELECT rowid FROM entries_fts WHERE entries_fts MATCH ?)");
    values.push(params.search);
  }

  const sql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { sql, values };
}

/** Opens and initializes the joa SQLite database. Returns a JoaDb instance. */
export function openDatabase(dbPath: string): JoaDb {
  const db = new Database(dbPath);

  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA cache_size = -32000;");
  db.exec(SCHEMA);

  // Prepared statements
  const insertEntry = db.prepare(`
    INSERT OR IGNORE INTO entries
      (id, timestamp, category, summary, thread_id, session_id, agent, device, resources, tags, detail, annotations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT INTO entries_fts(rowid, summary, detail, resources, tags)
    SELECT rowid, summary, detail, resources, tags FROM entries WHERE id = ?
  `);

  const getMetadata = db.prepare("SELECT value FROM metadata WHERE key = ?");
  const setMetadata = db.prepare(
    "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );

  const countByCat = db.prepare("SELECT category, COUNT(*) as cnt FROM entries GROUP BY category");
  const tsRange = db.prepare(
    "SELECT MIN(timestamp) as oldest, MAX(timestamp) as newest FROM entries",
  );
  const threadSummary = db.prepare("SELECT * FROM thread_summary LIMIT ?");

  return {
    writeEntry(entry: Entry): void {
      try {
        const row = serializeEntry(entry);
        db.transaction(() => {
          const result = insertEntry.run(
            row.id,
            row.timestamp,
            row.category,
            row.summary,
            row.thread_id,
            row.session_id,
            row.agent,
            row.device,
            row.resources,
            row.tags,
            row.detail,
            row.annotations,
          );
          if (result.changes > 0) {
            insertFts.run(row.id);
          }
        })();
      } catch (cause) {
        throw new DatabaseError("Failed to write entry to database", { cause });
      }
    },

    queryEntries(params: QueryParams): EntryRow[] {
      const { sql: where, values } = buildWhereClause(params);
      let query = `SELECT e.* FROM entries e ${where} ORDER BY e.timestamp DESC`;
      if (params.limit) {
        query += " LIMIT ?";
        values.push(params.limit);
      }
      if (params.offset) {
        query += " OFFSET ?";
        values.push(params.offset);
      }
      return db.prepare(query).all(...values) as EntryRow[];
    },

    countEntries(params: QueryParams): number {
      const { sql: where, values } = buildWhereClause(params);
      const query = `SELECT COUNT(*) as cnt FROM entries e ${where}`;
      const row = db.prepare(query).get(...values) as { cnt: number } | null;
      return row?.cnt ?? 0;
    },

    queryThreadSummary(limit: number): ThreadSummaryRow[] {
      return threadSummary.all(limit) as ThreadSummaryRow[];
    },

    countByCategory(): Record<string, number> {
      const rows = countByCat.all() as Array<{ category: string; cnt: number }>;
      const result: Record<string, number> = {};
      for (const row of rows) {
        result[row.category] = row.cnt;
      }
      return result;
    },

    getEntryTimestampRange(): { oldest: string | null; newest: string | null } {
      const row = tsRange.get() as { oldest: string | null; newest: string | null } | null;
      return { oldest: row?.oldest ?? null, newest: row?.newest ?? null };
    },

    getLastIndexedAt(): string | null {
      const row = getMetadata.get("last_indexed_at") as { value: string } | null;
      return row?.value ?? null;
    },

    setLastIndexedAt(ts: string): void {
      setMetadata.run("last_indexed_at", ts);
    },

    rebuildFts(): void {
      db.exec("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')");
    },

    getDbSizeBytes(): number {
      if (dbPath === ":memory:") return 0;
      try {
        return statSync(dbPath).size;
      } catch {
        return 0;
      }
    },

    isHealthy(): boolean {
      try {
        const row = db.prepare("PRAGMA integrity_check").get() as {
          integrity_check: string;
        } | null;
        return row?.integrity_check === "ok";
      } catch {
        return false;
      }
    },

    close(): void {
      db.close();
    },
  };
}
