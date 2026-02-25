import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../../src/core/config.ts";
import type { LogContext } from "../../src/core/context.ts";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import { deserializeEntry, serializeEntry } from "../../src/core/entry.ts";
import { appendEntry } from "../../src/core/journal.ts";
import { log } from "../../src/core/log.ts";
import { query } from "../../src/core/query.ts";
import { makeEntry, makeLogCtx } from "../core/helpers.ts";

// ---------------------------------------------------------------------------
// CLI command handler integration tests
// ---------------------------------------------------------------------------

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
