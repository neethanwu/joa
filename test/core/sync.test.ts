import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import type { Entry } from "../../src/core/entry.ts";
import { serializeEntry } from "../../src/core/entry.ts";
import { checkAndSyncIfStale, rebuildIndex } from "../../src/core/sync.ts";
import { makeEntry } from "./helpers.ts";

function writeJournalLine(dir: string, entry: Entry, date = "2025-02-18"): void {
  const filePath = join(dir, `${date}.jsonl`);
  const row = serializeEntry(entry);
  const existing = (() => {
    try {
      return Bun.file(filePath).size > 0
        ? `${require("node:fs").readFileSync(filePath, "utf8")}`
        : "";
    } catch {
      return "";
    }
  })();
  writeFileSync(filePath, `${existing}${JSON.stringify(row)}\n`);
}

describe("sync", () => {
  let db: JoaDb;
  let tmp: string;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-sync-test-"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("checkAndSyncIfStale with no stale files makes no writes", async () => {
    // Set last_indexed_at to the future so nothing is stale
    db.setLastIndexedAt("2099-01-01T00:00:00.000Z");
    const entry = makeEntry();
    writeJournalLine(tmp, entry);

    await checkAndSyncIfStale(db, tmp);
    expect(db.countEntries({})).toBe(0);
  });

  test("checkAndSyncIfStale with stale file imports missing entries", async () => {
    const entry = makeEntry();
    writeJournalLine(tmp, entry);

    await checkAndSyncIfStale(db, tmp);
    expect(db.countEntries({})).toBe(1);
    const rows = db.queryEntries({});
    expect(rows[0]?.id).toBe(entry.id);
  });

  test("duplicate entries are correctly skipped", async () => {
    const entry = makeEntry();
    db.writeEntry(entry);
    writeJournalLine(tmp, entry);

    await checkAndSyncIfStale(db, tmp);
    expect(db.countEntries({})).toBe(1);
  });

  test("malformed JSONL lines do not abort sync", async () => {
    const entry = makeEntry();
    const filePath = join(tmp, "2025-02-18.jsonl");
    const row = serializeEntry(entry);
    writeFileSync(filePath, `not valid json\n${JSON.stringify(row)}\n`);

    await checkAndSyncIfStale(db, tmp);
    expect(db.countEntries({})).toBe(1);
  });

  test("rebuildIndex reconstructs correctly from JSONL", async () => {
    const e1 = makeEntry({ summary: "first" });
    const e2 = makeEntry({ summary: "second" });
    writeJournalLine(tmp, e1);
    writeJournalLine(tmp, e2);

    await rebuildIndex(db, tmp);
    expect(db.countEntries({})).toBe(2);
  });

  test("rebuildIndex handles empty journals directory", async () => {
    await rebuildIndex(db, tmp);
    expect(db.countEntries({})).toBe(0);
  });

  test("rebuildIndex clears existing entries not in JSONL", async () => {
    // Write an entry directly to the DB (not in any JSONL file)
    const orphan = makeEntry({ summary: "orphan entry" });
    db.writeEntry(orphan);
    expect(db.countEntries({})).toBe(1);

    // Write a different entry to a JSONL file
    const kept = makeEntry({ summary: "kept entry" });
    writeJournalLine(tmp, kept);

    // Rebuild should clear orphan and only have the JSONL entry
    await rebuildIndex(db, tmp);
    expect(db.countEntries({})).toBe(1);
    const rows = db.queryEntries({});
    expect(rows[0]?.id).toBe(kept.id);
  });

  test("checkAndSyncIfStale uses mtime-based last_indexed_at", async () => {
    const entry = makeEntry();
    writeJournalLine(tmp, entry);

    // Get the file's mtime before syncing
    const filePath = join(tmp, "2025-02-18.jsonl");
    const fileMtimeMs = statSync(filePath).mtimeMs;
    const expectedTs = new Date(fileMtimeMs).toISOString();

    await checkAndSyncIfStale(db, tmp);

    // last_indexed_at should be based on the file's mtime, not nowUtc()
    const lastIndexed = db.getLastIndexedAt();
    expect(lastIndexed).toBe(expectedTs);
  });

  test("checkAndSyncIfStale uses writeEntries for batch inserts", async () => {
    // Write multiple entries to a single file
    const e1 = makeEntry({ summary: "batch one" });
    const e2 = makeEntry({ summary: "batch two" });
    const e3 = makeEntry({ summary: "batch three" });
    writeJournalLine(tmp, e1);
    writeJournalLine(tmp, e2);
    writeJournalLine(tmp, e3);

    await checkAndSyncIfStale(db, tmp);
    expect(db.countEntries({})).toBe(3);
  });
});
