import { statSync } from "node:fs";
import type { JoaDb } from "./db.ts";
import type { Entry } from "./entry.ts";
import { deserializeEntry } from "./entry.ts";
import { listJournalFiles, readJournalFile } from "./journal.ts";

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

  // Capture max mtime of stale files BEFORE processing to avoid data loss window
  let maxMtimeMs = 0;
  for (const f of staleFiles) {
    try {
      const mtime = statSync(f).mtimeMs;
      if (mtime > maxMtimeMs) maxMtimeMs = mtime;
    } catch {
      /* already filtered */
    }
  }

  for (const file of staleFiles) {
    const rows = await readJournalFile(file);
    const entries: Entry[] = [];
    for (const row of rows) {
      try {
        entries.push(deserializeEntry(row));
      } catch {
        console.warn(`Skipping entry during sync: ${row.id}`);
      }
    }
    if (entries.length > 0) {
      db.writeEntries(entries);
    }
  }

  // Use the max mtime instead of nowUtc() to avoid missing files modified during sync
  db.setLastIndexedAt(new Date(maxMtimeMs).toISOString());
}

/**
 * Full reconstruction of SQLite entries + FTS from all JSONL files.
 * For use when the index is corrupted or during joa rebuild.
 */
export async function rebuildIndex(db: JoaDb, journalsDir: string): Promise<void> {
  db.clearEntries();
  const files = await listJournalFiles(journalsDir);

  // Capture max mtime of all files BEFORE processing
  let maxMtimeMs = 0;
  for (const f of files) {
    try {
      const mtime = statSync(f).mtimeMs;
      if (mtime > maxMtimeMs) maxMtimeMs = mtime;
    } catch {
      /* skip unreadable files */
    }
  }

  for (const file of files) {
    const rows = await readJournalFile(file);
    const entries: Entry[] = [];
    for (const row of rows) {
      try {
        entries.push(deserializeEntry(row));
      } catch {
        console.warn(`Skipping entry during rebuild: ${row.id}`);
      }
    }
    if (entries.length > 0) {
      db.writeEntries(entries);
    }
  }

  db.rebuildFts();
  if (maxMtimeMs > 0) {
    db.setLastIndexedAt(new Date(maxMtimeMs).toISOString());
  }
}
