import type { JoaDb } from "./db.ts";
import { deserializeEntry } from "./entry.ts";
import { appendEntry } from "./journal.ts";

export interface ImportResult {
  imported: number;
  skipped: number;
  malformed: number;
}

/**
 * Import entries from JSONL lines into the journal + database.
 * Validates each line, skips malformed entries and duplicates.
 */
export async function importEntries(
  lines: string[],
  db: JoaDb,
  journalsDir: string,
): Promise<ImportResult> {
  const countBefore = db.countEntries({});
  let parsedCount = 0;
  let malformed = 0;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (
        typeof parsed !== "object" ||
        !parsed ||
        typeof parsed.id !== "string" ||
        typeof parsed.summary !== "string"
      ) {
        malformed++;
        continue;
      }
      const entry = deserializeEntry(parsed);
      await appendEntry(entry, journalsDir);
      db.writeEntry(entry);
      parsedCount++;
    } catch {
      malformed++;
    }
  }

  const countAfter = db.countEntries({});
  const imported = countAfter - countBefore;
  const skipped = parsedCount - imported;

  return { imported, skipped, malformed };
}
