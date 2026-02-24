import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import { threadId } from "../../src/core/ids.ts";
import { makeEntry } from "./helpers.ts";

describe("db", () => {
  let db: JoaDb;

  beforeEach(() => {
    db = openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  test("writeEntry stores in both entries and entries_fts", () => {
    const entry = makeEntry();
    db.writeEntry(entry);
    const rows = db.queryEntries({});
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(entry.id);

    // Verify FTS — search for the summary
    const ftsRows = db.queryEntries({ search: '"Test summary"' });
    expect(ftsRows.length).toBe(1);
  });

  test("FTS search returns matching entries", () => {
    db.writeEntry(makeEntry({ summary: "Auth token cache invalidation" }));
    db.writeEntry(makeEntry({ summary: "Database migration completed" }));

    const results = db.queryEntries({ search: '"auth token"' });
    expect(results.length).toBe(1);
    expect(results[0]?.summary).toBe("Auth token cache invalidation");
  });

  test("queryEntries with category filter returns only that category", () => {
    db.writeEntry(makeEntry({ category: "decision" }));
    db.writeEntry(makeEntry({ category: "file change" }));

    const results = db.queryEntries({ category: "decision" });
    expect(results.length).toBe(1);
    expect(results[0]?.category).toBe("decision");
  });

  test("queryEntries with since filter returns only newer entries", () => {
    db.writeEntry(makeEntry({ timestamp: "2025-01-01T00:00:00.000Z", summary: "old" }));
    db.writeEntry(makeEntry({ timestamp: "2025-02-18T00:00:00.000Z", summary: "new" }));

    const results = db.queryEntries({ since: "2025-02-01T00:00:00.000Z" as ISOTimestamp });
    expect(results.length).toBe(1);
    expect(results[0]?.summary).toBe("new");
  });

  test("queryEntries with combined filters applies all with AND", () => {
    db.writeEntry(makeEntry({ category: "decision", agent: "claude" }));
    db.writeEntry(makeEntry({ category: "decision", agent: "cursor" }));
    db.writeEntry(makeEntry({ category: "error", agent: "claude" }));

    const results = db.queryEntries({ category: "decision", agent: "claude" });
    expect(results.length).toBe(1);
  });

  test("queryEntries with tags filters using AND semantics", () => {
    db.writeEntry(makeEntry({ tags: ["auth", "p1"] }));
    db.writeEntry(makeEntry({ tags: ["auth"] }));
    db.writeEntry(makeEntry({ tags: ["p1"] }));

    const results = db.queryEntries({ tags: ["auth", "p1"] });
    expect(results.length).toBe(1);
  });

  test("queryThreadSummary returns correct aggregation", () => {
    const tid = threadId();
    db.writeEntry(
      makeEntry({
        thread_id: tid,
        summary: "first in thread",
        timestamp: "2025-02-18T10:00:00.000Z",
      }),
    );
    db.writeEntry(
      makeEntry({
        thread_id: tid,
        summary: "second in thread",
        timestamp: "2025-02-18T10:15:00.000Z",
      }),
    );
    db.writeEntry(makeEntry({ summary: "no thread" }));

    const threads = db.queryThreadSummary(10);
    expect(threads.length).toBe(1);
    expect(threads[0]?.thread_id).toBe(tid);
    expect(threads[0]?.entry_count).toBe(2);
    expect(threads[0]?.first_summary).toBe("first in thread");
  });

  test("countByCategory returns correct counts", () => {
    db.writeEntry(makeEntry({ category: "decision" }));
    db.writeEntry(makeEntry({ category: "decision" }));
    db.writeEntry(makeEntry({ category: "error" }));

    const counts = db.countByCategory();
    expect(counts.decision).toBe(2);
    expect(counts.error).toBe(1);
  });

  test("getEntryTimestampRange returns correct oldest/newest", () => {
    db.writeEntry(makeEntry({ timestamp: "2025-01-01T00:00:00.000Z" }));
    db.writeEntry(makeEntry({ timestamp: "2025-02-18T00:00:00.000Z" }));

    const range = db.getEntryTimestampRange();
    expect(range.oldest).toBe("2025-01-01T00:00:00.000Z");
    expect(range.newest).toBe("2025-02-18T00:00:00.000Z");
  });

  test("empty database returns null timestamps", () => {
    const range = db.getEntryTimestampRange();
    expect(range.oldest).toBeNull();
    expect(range.newest).toBeNull();
  });

  test("INSERT OR IGNORE skips duplicate IDs", () => {
    const entry = makeEntry();
    db.writeEntry(entry);
    db.writeEntry(entry); // same ID
    const rows = db.queryEntries({});
    expect(rows.length).toBe(1);
  });

  test("rebuildFts rebuilds from entries table", () => {
    db.writeEntry(makeEntry({ summary: "rebuild test" }));
    db.rebuildFts();
    const results = db.queryEntries({ search: '"rebuild test"' });
    expect(results.length).toBe(1);
  });

  test("isHealthy returns true for valid database", () => {
    expect(db.isHealthy()).toBe(true);
  });

  test("metadata get/set works", () => {
    expect(db.getLastIndexedAt()).toBeNull();
    db.setLastIndexedAt("2025-02-18T00:00:00.000Z");
    expect(db.getLastIndexedAt()).toBe("2025-02-18T00:00:00.000Z");
  });

  test("countEntries returns correct count", () => {
    db.writeEntry(makeEntry({ category: "decision" }));
    db.writeEntry(makeEntry({ category: "decision" }));
    db.writeEntry(makeEntry({ category: "error" }));

    expect(db.countEntries({})).toBe(3);
    expect(db.countEntries({ category: "decision" })).toBe(2);
  });

  test("tag filter uses exact match via json_each (no substring matching)", () => {
    db.writeEntry(makeEntry({ tags: ["deploy-staging"] }));
    db.writeEntry(makeEntry({ tags: ["deploy"] }));

    // Searching for "deploy" must NOT match "deploy-staging"
    const results = db.queryEntries({ tags: ["deploy"] });
    expect(results.length).toBe(1);
    expect(JSON.parse(results[0]!.tags)).toEqual(["deploy"]);
  });

  test("writeEntries batch inserts multiple entries in a single transaction", () => {
    const entries = [
      makeEntry({ summary: "batch 1" }),
      makeEntry({ summary: "batch 2" }),
      makeEntry({ summary: "batch 3" }),
    ];

    db.writeEntries(entries);

    expect(db.countEntries({})).toBe(3);
    // Verify FTS works for batch-inserted entries
    const ftsResults = db.queryEntries({ search: '"batch 2"' });
    expect(ftsResults.length).toBe(1);
    expect(ftsResults[0]?.summary).toBe("batch 2");
  });

  test("writeEntries skips duplicates via INSERT OR IGNORE", () => {
    const entry = makeEntry({ summary: "original" });
    db.writeEntry(entry);

    // Batch insert including the same entry again
    db.writeEntries([entry, makeEntry({ summary: "new one" })]);

    expect(db.countEntries({})).toBe(2);
  });

  test("clearEntries removes all entries and FTS data", () => {
    db.writeEntry(makeEntry({ summary: "entry one" }));
    db.writeEntry(makeEntry({ summary: "entry two" }));
    expect(db.countEntries({})).toBe(2);

    db.clearEntries();

    expect(db.countEntries({})).toBe(0);
    // Verify FTS is also cleared
    const ftsResults = db.queryEntries({ search: '"entry one"' });
    expect(ftsResults.length).toBe(0);
  });
});

// Import needed for typed test
import type { ISOTimestamp } from "../../src/core/time.ts";
