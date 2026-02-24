import { describe, expect, test } from "bun:test";
import {
  deserializeEntry,
  normalizeCategory,
  serializeEntry,
  validateEntryInput,
} from "../../src/core/entry.ts";
import { InvalidThreadId, ValidationError } from "../../src/core/errors.ts";
import { threadId } from "../../src/core/ids.ts";
import { makeEntry } from "./helpers.ts";

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
