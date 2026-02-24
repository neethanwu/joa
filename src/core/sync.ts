import { statSync } from "node:fs";
import type { JoaDb } from "./db.ts";
import { listJournalFiles, readJournalFile } from "./journal.ts";
import { nowUtc } from "./time.ts";

/**
 * Called on every process startup after openDatabase().
 * Checks JSONL file modification times against last_indexed_at in metadata.
 * Performs incremental rebuild if any file is newer.
 */
export async function checkAndSyncIfStale(db: JoaDb, journalsDir: string): Promise<void> {
  const lastIndexed = db.getLastIndexedAt();
  const files = await listJournalFiles(journalsDir);

  if (files.length === 0) return;

  const lastIndexedMs = lastIndexed ? new Date(lastIndexed).getTime() : 0;

  const staleFiles = files.filter((f) => {
    try {
      const mtime = statSync(f).mtimeMs;
      return mtime > lastIndexedMs;
    } catch {
      return false;
    }
  });

  if (staleFiles.length === 0) return;

  for (const file of staleFiles) {
    const rows = await readJournalFile(file);
    for (const row of rows) {
      try {
        // INSERT OR IGNORE — skips already-indexed entries by PK
        db.writeEntry({
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
        });
      } catch {
        console.warn(`Skipping entry during sync: ${row.id}`);
      }
    }
  }

  db.setLastIndexedAt(nowUtc());
}

/**
 * Full reconstruction of SQLite entries + FTS from all JSONL files.
 * For use when the index is corrupted or during joa rebuild.
 */
export async function rebuildIndex(db: JoaDb, journalsDir: string): Promise<void> {
  const files = await listJournalFiles(journalsDir);

  for (const file of files) {
    const rows = await readJournalFile(file);
    for (const row of rows) {
      try {
        db.writeEntry({
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
        });
      } catch {
        console.warn(`Skipping entry during rebuild: ${row.id}`);
      }
    }
  }

  db.rebuildFts();
  db.setLastIndexedAt(nowUtc());
}
