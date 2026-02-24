import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import type { Entry } from "../../src/core/entry.ts";
import { serializeEntry } from "../../src/core/entry.ts";
import { entryId, sessionId } from "../../src/core/ids.ts";
import { checkAndSyncIfStale, rebuildIndex } from "../../src/core/sync.ts";

function makeEntry(overrides?: Partial<Entry>): Entry {
  return {
    id: entryId(),
    timestamp: new Date().toISOString(),
    category: "decision",
    summary: "Test summary",
    thread_id: null,
    session_id: sessionId(),
    agent: "test-agent",
    device: "test-device",
    resources: [],
    tags: [],
    detail: {},
    annotations: {},
    ...overrides,
  };
}

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

  beforeEach(() => {
    db = openDatabase(":memory:");
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
});
