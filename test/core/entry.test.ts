import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../../src/core/config.ts";
import { openDatabase } from "../../src/core/db.ts";
import {
  deserializeEntry,
  normalizeCategory,
  serializeEntry,
  validateEntryInput,
} from "../../src/core/entry.ts";
import { InvalidThreadId, ValidationError } from "../../src/core/errors.ts";
import { threadId } from "../../src/core/ids.ts";
import { log } from "../../src/core/log.ts";
import { query } from "../../src/core/query.ts";
import { makeEntry, makeLogCtx } from "./helpers.ts";

describe("normalizeCategory", () => {
  test('"Decision" → "decision"', () => {
    expect(normalizeCategory("Decision")).toBe("decision");
  });

  test('"  FILE CHANGE  " → "file change"', () => {
    expect(normalizeCategory("  FILE CHANGE  ")).toBe("file change");
  });

  test('"   " throws ValidationError', () => {
    expect(() => normalizeCategory("   ")).toThrow(ValidationError);
  });
});

describe("serializeEntry / deserializeEntry", () => {
  test("roundtrip is lossless for all field types", () => {
    const entry = makeEntry({
      resources: ["a.ts", "b.ts"],
      tags: ["auth", "bug"],
      detail: { nested: { deep: true } },
      annotations: { score: 0.95 },
    });
    const row = serializeEntry(entry);
    const roundtripped = deserializeEntry(row);
    expect(roundtripped).toEqual(entry);
  });

  test("serialized JSON fields are strings", () => {
    const entry = makeEntry();
    const row = serializeEntry(entry);
    expect(typeof row.resources).toBe("string");
    expect(typeof row.tags).toBe("string");
    expect(typeof row.detail).toBe("string");
    expect(typeof row.annotations).toBe("string");
  });
});

describe("validateEntryInput", () => {
  test("throws on empty category", () => {
    expect(() => validateEntryInput({ category: "   ", summary: "ok" })).toThrow(ValidationError);
  });

  test("throws on empty summary", () => {
    expect(() => validateEntryInput({ category: "decision", summary: "  " })).toThrow(
      ValidationError,
    );
  });

  test("throws on malformed thread_id", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", thread_id: "invalid" }),
    ).toThrow(InvalidThreadId);
  });

  test('throws on tag containing "', () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ['bad"tag'] }),
    ).toThrow(ValidationError);
  });

  test("throws on tag containing \\", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["bad\\tag"] }),
    ).toThrow(ValidationError);
  });

  test('accepts thread_id: "new"', () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", thread_id: "new" }),
    ).not.toThrow();
  });

  test("accepts valid th_ IDs", () => {
    const tid = threadId();
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", thread_id: tid }),
    ).not.toThrow();
  });

  test("accepts thread_id: null and undefined", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", thread_id: null }),
    ).not.toThrow();
    expect(() => validateEntryInput({ category: "decision", summary: "ok" })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tag validation boundary (Section 1.5)
// ---------------------------------------------------------------------------

describe("tag validation boundary", () => {
  // --- Forbidden characters ---

  test('rejects tag containing "', () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ['scope:"admin"'] }),
    ).toThrow(ValidationError);
  });

  test("rejects tag containing \\", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["path\\to\\file"] }),
    ).toThrow(ValidationError);
  });

  test('rejects tag containing both " and \\', () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ['"escaped\\"'] }),
    ).toThrow(ValidationError);
  });

  test('rejects tag that is just "', () => {
    expect(() => validateEntryInput({ category: "decision", summary: "ok", tags: ['"'] })).toThrow(
      ValidationError,
    );
  });

  test("rejects tag that is just \\", () => {
    expect(() => validateEntryInput({ category: "decision", summary: "ok", tags: ["\\"] })).toThrow(
      ValidationError,
    );
  });

  // --- Empty / whitespace ---

  test("rejects empty string tag", () => {
    expect(() => validateEntryInput({ category: "decision", summary: "ok", tags: [""] })).toThrow(
      "tag must not be empty",
    );
  });

  test("rejects whitespace-only tag", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["   "] }),
    ).toThrow("tag must not be empty");
  });

  // --- Allowed characters ---

  test("accepts tags with colons", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["project:api"] }),
    ).not.toThrow();
  });

  test("accepts tags with slashes", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["scope/security"] }),
    ).not.toThrow();
  });

  test("accepts tags with @ sign", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["@neethan"] }),
    ).not.toThrow();
  });

  test("accepts tags with spaces", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["my tag"] }),
    ).not.toThrow();
  });

  test("accepts tags with Unicode", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["项目:api"] }),
    ).not.toThrow();
  });

  test("accepts long tags (256 chars)", () => {
    expect(() =>
      validateEntryInput({ category: "decision", summary: "ok", tags: ["a".repeat(256)] }),
    ).not.toThrow();
  });

  // --- Roundtrip ---

  test("tags with special allowed chars survive roundtrip", async () => {
    const db = await openDatabase(":memory:");
    const tmp = mkdtempSync(join(tmpdir(), "joa-tag-roundtrip-"));
    try {
      const ctx = makeLogCtx(db, tmp);
      const tags = ["project:api", "scope/security", "🏷️"];
      await log({ category: "observation", summary: "tag roundtrip test", tags }, ctx);

      const config = defaultConfig();
      const result = query({ format: "json" }, { db }, config);
      expect(result.entries.length).toBe(1);
      expect(result.entries[0]!.tags).toEqual(tags);
    } finally {
      db.close();
      rmSync(tmp, { recursive: true });
    }
  });
});
