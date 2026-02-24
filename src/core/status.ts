import { readdirSync } from "node:fs";
import type { JoaConfig } from "./config.ts";
import { resolveDbPath, resolveJournalsPath } from "./config.ts";
import type { ReadContext } from "./log.ts";

export interface StatusOutput {
  total_entries: number;
  entries_by_category: Record<string, number>;
  oldest_entry: string | null;
  newest_entry: string | null;
  current_session_id: string;
  db_path: string;
  journals_dir: string;
  journal_files: number;
  db_healthy: boolean;
  db_size_bytes: number;
}

/** Returns journal health and stats. */
export function status(ctx: ReadContext, config: JoaConfig, sessionId: string): StatusOutput {
  const entriesByCategory = ctx.db.countByCategory();
  const totalEntries = Object.values(entriesByCategory).reduce((sum, n) => sum + n, 0);
  const range = ctx.db.getEntryTimestampRange();
  const dbPath = resolveDbPath(config);
  const journalsDir = resolveJournalsPath(config);

  let journalFiles = 0;
  try {
    const files = readdirSync(journalsDir);
    journalFiles = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).length;
  } catch {
    // Directory doesn't exist yet
  }

  return {
    total_entries: totalEntries,
    entries_by_category: entriesByCategory,
    oldest_entry: range.oldest,
    newest_entry: range.newest,
    current_session_id: sessionId,
    db_path: dbPath,
    journals_dir: journalsDir,
    journal_files: journalFiles,
    db_healthy: ctx.db.isHealthy(),
    db_size_bytes: ctx.db.getDbSizeBytes(),
  };
}
