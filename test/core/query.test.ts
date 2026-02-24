import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/core/config.ts";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import type { Entry } from "../../src/core/entry.ts";
import { entryId, sessionId, threadId } from "../../src/core/ids.ts";
import type { ReadContext } from "../../src/core/log.ts";
import { query } from "../../src/core/query.ts";

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

describe("query", () => {
  let db: JoaDb;
  let ctx: ReadContext;
  const config = defaultConfig();

  beforeEach(() => {
    db = openDatabase(":memory:");
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

  test("empty result returns empty entries and appropriate rendered string", () => {
    const result = query({ category: "nonexistent" }, ctx, config);
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.rendered).toBe("No entries found.");
  });
});
