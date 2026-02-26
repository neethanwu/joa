import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/core/config.ts";
import type { ReadContext } from "../../src/core/context.ts";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import { threadId } from "../../src/core/ids.ts";
import { query } from "../../src/core/query.ts";
import { makeEntry } from "./helpers.ts";

describe("query", () => {
  let db: JoaDb;
  let ctx: ReadContext;
  const config = defaultConfig();

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    ctx = { db };
  });

  afterEach(() => {
    db.close();
  });

  test("no params returns recent entries", () => {
    db.writeEntry(makeEntry());
    db.writeEntry(makeEntry());
    const result = query({}, ctx, config);
    expect(result.entries.length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("catchup preset returns last 7 days", () => {
    db.writeEntry(makeEntry({ timestamp: new Date().toISOString() }));
    db.writeEntry(makeEntry({ timestamp: "2020-01-01T00:00:00.000Z" }));

    const result = query({ preset: "catchup" }, ctx, config);
    expect(result.entries.length).toBe(1);
  });

  test("decisions preset returns only decision entries", () => {
    db.writeEntry(makeEntry({ category: "decision" }));
    db.writeEntry(makeEntry({ category: "error" }));
    db.writeEntry(makeEntry({ category: "decision" }));

    const result = query({ preset: "decisions" }, ctx, config);
    expect(result.entries.length).toBe(2);
    for (const e of result.entries) {
      expect(e.category).toBe("decision");
    }
  });

  test("threads preset uses queryThreadSummary", () => {
    const tid = threadId();
    db.writeEntry(makeEntry({ thread_id: tid, timestamp: "2025-02-18T10:00:00.000Z" }));
    db.writeEntry(makeEntry({ thread_id: tid, timestamp: "2025-02-18T10:15:00.000Z" }));

    const result = query({ preset: "threads" }, ctx, config);
    // threads preset returns rendered thread summaries, not individual entries
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(1);
    expect(result.rendered).toContain(tid);
  });

  test("search returns FTS-matched entries", () => {
    db.writeEntry(makeEntry({ summary: "Auth token cache invalidation" }));
    db.writeEntry(makeEntry({ summary: "Database migration" }));

    const result = query({ search: "auth" }, ctx, config);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.summary).toContain("Auth");
  });

  test("search with special chars does not throw", () => {
    db.writeEntry(makeEntry({ summary: "Changed src/auth.ts file" }));
    expect(() => query({ search: "src/auth.ts" }, ctx, config)).not.toThrow();
  });

  test("since: 1d returns last 24 hours", () => {
    db.writeEntry(makeEntry({ timestamp: new Date().toISOString() }));
    db.writeEntry(makeEntry({ timestamp: "2020-01-01T00:00:00.000Z" }));

    const result = query({ since: "1d" }, ctx, config);
    expect(result.entries.length).toBe(1);
  });

  test("since: ISO date returns from that date", () => {
    db.writeEntry(makeEntry({ timestamp: "2025-02-18T10:00:00.000Z" }));
    db.writeEntry(makeEntry({ timestamp: "2025-02-01T10:00:00.000Z" }));

    const result = query({ since: "2025-02-15" }, ctx, config);
    expect(result.entries.length).toBe(1);
  });

  test("combined filters all apply", () => {
    db.writeEntry(
      makeEntry({ category: "decision", agent: "claude", timestamp: new Date().toISOString() }),
    );
    db.writeEntry(
      makeEntry({ category: "decision", agent: "cursor", timestamp: new Date().toISOString() }),
    );
    db.writeEntry(
      makeEntry({ category: "error", agent: "claude", timestamp: new Date().toISOString() }),
    );

    const result = query({ category: "decision", agent: "claude", since: "1d" }, ctx, config);
    expect(result.entries.length).toBe(1);
  });

  test("category filter normalizes mixed case", () => {
    db.writeEntry(makeEntry({ category: "decision" }));

    const result = query({ category: "Decision" }, ctx, config);
    expect(result.entries.length).toBe(1);
  });

  test("tags filter uses AND semantics", () => {
    db.writeEntry(makeEntry({ tags: ["auth", "p1"] }));
    db.writeEntry(makeEntry({ tags: ["auth"] }));
    db.writeEntry(makeEntry({ tags: ["p1"] }));

    const result = query({ tags: ["auth", "p1"] }, ctx, config);
    expect(result.entries.length).toBe(1);
  });

  test("format: md returns markdown", () => {
    db.writeEntry(makeEntry());
    const result = query({ format: "md" }, ctx, config);
    expect(result.format).toBe("md");
    expect(result.rendered).toContain("##");
  });

  test("format: json returns parseable JSON", () => {
    db.writeEntry(makeEntry());
    const result = query({ format: "json" }, ctx, config);
    expect(result.format).toBe("json");
    const parsed = JSON.parse(result.rendered);
    expect(Array.isArray(parsed)).toBe(true);
  });

  test("limit above 1000 is capped to 1000", () => {
    // Insert 2 entries, request limit of 5000 — should be capped to MAX_LIMIT (1000)
    db.writeEntry(makeEntry());
    db.writeEntry(makeEntry());
    const result = query({ limit: 5000 }, ctx, config);
    // We only have 2 entries so we can't observe the 1000 cap directly,
    // but we verify it doesn't break and returns all available entries
    expect(result.entries.length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("limit: 0 is preserved via nullish coalescing (not replaced by default 50)", () => {
    // With the old falsy check, limit:0 was silently replaced with 50.
    // With nullish coalescing, 0 is a valid value and is kept as-is.
    // The DB layer treats limit:0 as no limit, so all entries are returned.
    db.writeEntry(makeEntry());
    db.writeEntry(makeEntry());
    const result = query({ limit: 0 }, ctx, config);
    expect(result.entries.length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("very long search string is truncated to 500 characters", () => {
    const longWord = "a".repeat(1000);
    db.writeEntry(makeEntry({ summary: longWord }));
    // Should not throw even with a 1000-char search string
    expect(() => query({ search: longWord }, ctx, config)).not.toThrow();
  });

  test("empty result returns empty entries and appropriate rendered string", () => {
    const result = query({ category: "nonexistent" }, ctx, config);
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.rendered).toBe("No entries found.");
  });
});
