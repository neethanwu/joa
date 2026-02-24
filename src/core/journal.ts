import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Entry, EntryRow } from "./entry.ts";
import { serializeEntry } from "./entry.ts";
import { JournalWriteError } from "./errors.ts";
import { todayDate } from "./time.ts";

/**
 * Appends a single entry to the date-based JSONL file.
 * Uses O_APPEND semantics — atomic for entries < ~4KB on local POSIX filesystems.
 * Creates the journals directory if it does not exist.
 */
export async function appendEntry(entry: Entry, journalsDir: string): Promise<void> {
  try {
    await mkdir(journalsDir, { recursive: true });
    const filename = `${todayDate()}.jsonl`;
    const filePath = join(journalsDir, filename);
    const line = `${JSON.stringify(serializeEntry(entry))}\n`;
    await appendFile(filePath, line, "utf8");
  } catch (cause) {
    throw new JournalWriteError("Failed to append entry to journal", { cause });
  }
}

/**
 * Lists all YYYY-MM-DD.jsonl files in journalsDir, sorted by date ascending.
 * Returns empty array if directory does not exist.
 */
export async function listJournalFiles(journalsDir: string): Promise<string[]> {
  try {
    const files = await readdir(journalsDir);
    return files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .sort()
      .map((f) => join(journalsDir, f));
  } catch {
    return [];
  }
}

/**
 * Reads all valid entry rows from a single JSONL file.
 * Skips malformed lines (logs a warning to stderr). Never throws on parse errors.
 */
export async function readJournalFile(filePath: string): Promise<EntryRow[]> {
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const entries: EntryRow[] = [];

  for (const line of lines) {
    try {
      const row = JSON.parse(line) as EntryRow;
      entries.push(row);
    } catch {
      console.warn(`Skipping malformed JSONL line in ${filePath}: ${line.slice(0, 80)}`);
    }
  }

  return entries;
}
