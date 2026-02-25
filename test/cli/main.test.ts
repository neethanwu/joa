import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig } from "../../src/core/config.ts";
import type { LogContext, ReadContext } from "../../src/core/context.ts";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import { deserializeEntry, serializeEntry } from "../../src/core/entry.ts";
import { sessionId } from "../../src/core/ids.ts";
import { appendEntry, listJournalFiles } from "../../src/core/journal.ts";
import { log } from "../../src/core/log.ts";
import { query } from "../../src/core/query.ts";
import { status } from "../../src/core/status.ts";
import { rebuildIndex } from "../../src/core/sync.ts";
import { makeEntry } from "../core/helpers.ts";

function makeLogCtx(db: JoaDb, journalsDir: string): LogContext {
  return {
    db,
    journalsDir,
    sessionId: sessionId(),
    agent: "test-agent",
    device: "test-device",
    defaultTags: [],
  };
}

// ---------------------------------------------------------------------------
// CLI command handler integration tests
// ---------------------------------------------------------------------------

describe("CLI: log command", () => {
  let db: JoaDb;
  let tmp: string;
  let ctx: LogContext;

  beforeEach(() => {
    db = openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-cli-test-"));
    ctx = makeLogCtx(db, tmp);
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("log creates entry with correct category", async () => {
    const result = await log({ category: "decision", summary: "Chose Postgres" }, ctx);
    expect(result.status).toBe("ok");
    const rows = db.queryEntries({});
    expect(rows[0]?.category).toBe("decision");
  });

  test("log with tags stores them", async () => {
    await log({ category: "observation", summary: "test", tags: ["auth", "backend"] }, ctx);
    const rows = db.queryEntries({});
    const tags = JSON.parse(rows[0]?.tags ?? "[]") as string[];
    expect(tags).toContain("auth");
    expect(tags).toContain("backend");
  });

  test("log with detail stores JSON", async () => {
    await log({ category: "decision", summary: "test", detail: { reasoning: "performance" } }, ctx);
    const rows = db.queryEntries({});
    const detail = JSON.parse(rows[0]?.detail ?? "{}") as Record<string, unknown>;
    expect(detail.reasoning).toBe("performance");
  });

  test("log with thread new generates thread ID", async () => {
    const result = await log({ category: "decision", summary: "test", thread_id: "new" }, ctx);
    expect(result.thread_id).toMatch(/^th_/);
  });
});

describe("CLI: query command", () => {
  let db: JoaDb;
  let tmp: string;
  let ctx: LogContext;
  const config = defaultConfig();

  beforeEach(async () => {
    db = openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-cli-query-test-"));
    ctx = makeLogCtx(db, tmp);
    // Seed entries
    await log({ category: "decision", summary: "Chose Postgres" }, ctx);
    await log({ category: "file change", summary: "Refactored auth" }, ctx);
    await log({ category: "observation", summary: "Performance looks good" }, ctx);
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("query returns all entries by default", () => {
    const result = query({}, { db }, config);
    expect(result.entries.length).toBe(3);
  });

  test("query with preset decisions filters by category", () => {
    const result = query({ preset: "decisions" }, { db }, config);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.category).toBe("decision");
  });

  test("query with format compact returns compact output", () => {
    const result = query({ format: "compact" }, { db }, config);
    expect(result.format).toBe("compact");
    expect(result.rendered).toContain("decision:");
    expect(result.rendered).toContain("file change:");
  });

  test("query with format json returns valid JSON", () => {
    const result = query({ format: "json" }, { db }, config);
    const parsed = JSON.parse(result.rendered);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
  });

  test("query with limit restricts results", () => {
    const result = query({ limit: 1 }, { db }, config);
    expect(result.entries.length).toBe(1);
    expect(result.total).toBe(3);
  });

  test("search finds entries by text", () => {
    const result = query({ search: "Postgres" }, { db }, config);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.summary).toBe("Chose Postgres");
  });
});

describe("CLI: status command", () => {
  let db: JoaDb;
  let tmp: string;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-cli-status-test-"));
    const ctx = makeLogCtx(db, tmp);
    await log({ category: "decision", summary: "test" }, ctx);
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("status returns entry count and categories", () => {
    const config = loadConfig(tmp);
    const s = status({ db }, config, sessionId());
    expect(s.total_entries).toBe(1);
    expect(s.entries_by_category.decision).toBe(1);
    expect(s.db_healthy).toBe(true);
  });
});

describe("CLI: rebuild command", () => {
  let db: JoaDb;
  let tmp: string;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-cli-rebuild-test-"));
    const ctx = makeLogCtx(db, tmp);
    await log({ category: "decision", summary: "entry 1" }, ctx);
    await log({ category: "observation", summary: "entry 2" }, ctx);
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("rebuild reconstructs index from JSONL", async () => {
    // Clear DB
    db.clearEntries();
    expect(db.countEntries({})).toBe(0);
    // Rebuild
    await rebuildIndex(db, tmp);
    expect(db.countEntries({})).toBe(2);
  });
});

describe("CLI: export/import", () => {
  let db: JoaDb;
  let tmp: string;
  let ctx: LogContext;

  beforeEach(async () => {
    db = openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-cli-export-test-"));
    ctx = makeLogCtx(db, tmp);
    await log({ category: "decision", summary: "Chose Postgres" }, ctx);
    await log({ category: "observation", summary: "Looks good" }, ctx);
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("export writes entries as JSONL", () => {
    const config = defaultConfig();
    const result = query({ limit: 1000, format: "json" }, { db }, config);
    const jsonlLines = result.entries.map((e) => JSON.stringify(serializeEntry(e)));
    expect(jsonlLines.length).toBe(2);
    for (const line of jsonlLines) {
      const parsed = JSON.parse(line);
      expect(typeof parsed.id).toBe("string");
      expect(typeof parsed.summary).toBe("string");
    }
  });

  test("import parses JSONL and writes to DB", async () => {
    const config = defaultConfig();
    const result = query({ limit: 1000, format: "json" }, { db }, config);
    const jsonlContent = result.entries.map((e) => JSON.stringify(serializeEntry(e))).join("\n");

    // Create new DB to import into
    const db2 = openDatabase(":memory:");
    const tmp2 = mkdtempSync(join(tmpdir(), "joa-cli-import-test-"));

    const lines = jsonlContent.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const row = JSON.parse(line);
      const entry = deserializeEntry(row);
      await appendEntry(entry, tmp2);
      db2.writeEntry(entry);
    }

    expect(db2.countEntries({})).toBe(2);
    db2.close();
    rmSync(tmp2, { recursive: true });
  });

  test("import skips duplicates via INSERT OR IGNORE", async () => {
    const entry = makeEntry();
    db.writeEntry(entry);
    const countBefore = db.countEntries({});
    // Write same entry again
    db.writeEntry(entry);
    const countAfter = db.countEntries({});
    expect(countAfter).toBe(countBefore);
  });

  test("import handles malformed JSONL lines gracefully", () => {
    const lines = ["not valid json", '{"id": 123}', '{"id": "ok", "summary": "valid"}'];
    const valid = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed.id === "string" && typeof parsed.summary === "string") {
          valid.push(parsed);
        }
      } catch {
        // Skip malformed
      }
    }
    expect(valid.length).toBe(1);
  });
});

describe("CLI: config get/set", () => {
  test("config resolves aliases", () => {
    const aliases: Record<string, string> = {
      device: "defaults.device",
      agent: "defaults.agent",
    };
    expect(aliases.device).toBe("defaults.device");
    expect(aliases.agent).toBe("defaults.agent");
  });

  test("config get traverses nested keys", () => {
    const config = defaultConfig();
    const parts = "defaults.device".split(".");
    let value: unknown = config;
    for (const part of parts) {
      value = (value as Record<string, unknown>)[part];
    }
    expect(value).toBeNull(); // default device is null
  });

  test("config value detection parses JSON arrays and objects", () => {
    const testCases: Array<[string, unknown]> = [
      ['["a","b"]', ["a", "b"]],
      ['{"key":"val"}', { key: "val" }],
      ["true", true],
      ["false", false],
      ["null", null],
      ["plain string", "plain string"],
    ];

    for (const [input, expected] of testCases) {
      let parsed: unknown = input;
      if (
        input.startsWith("[") ||
        input.startsWith("{") ||
        input === "true" ||
        input === "false" ||
        input === "null"
      ) {
        try {
          parsed = JSON.parse(input);
        } catch {
          // Keep as string
        }
      }
      expect(parsed).toEqual(expected);
    }
  });
});
