import { describe, expect, test } from "bun:test";
import type { Entry } from "../../src/core/entry.ts";
import { formatCompact, formatJson, formatMd } from "../../src/core/formatters.ts";
import { entryId, sessionId } from "../../src/core/ids.ts";

function makeEntry(overrides?: Partial<Entry>): Entry {
  return {
    id: entryId(),
    timestamp: "2025-02-18T10:00:00.000Z",
    category: "decision",
    summary: "Chose Postgres over SQLite",
    thread_id: null,
    session_id: sessionId(),
    agent: "claude-code",
    device: "macbook-pro",
    resources: ["src/db.ts"],
    tags: ["backend"],
    detail: { reasoning: "write-heavy workload" },
    annotations: {},
    ...overrides,
  };
}

describe("formatMd", () => {
  test("returns non-empty string with expected structure", () => {
    const entries = [makeEntry()];
    const result = formatMd(entries);
    expect(result).toContain("## 2025-02-18");
    expect(result).toContain("decision");
    expect(result).toContain("**Chose Postgres over SQLite**");
    expect(result).toContain("Agent: claude-code");
    expect(result).toContain("Tags: backend");
  });

  test('returns "No entries found." for empty array', () => {
    expect(formatMd([])).toBe("No entries found.");
  });

  test("multiple entries are separated by ---", () => {
    const entries = [makeEntry(), makeEntry({ summary: "Second entry" })];
    const result = formatMd(entries);
    expect(result).toContain("---");
  });
});

describe("formatJson", () => {
  test("returns valid JSON parseable back to Entry[]", () => {
    const entries = [makeEntry()];
    const result = formatJson(entries);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].summary).toBe("Chose Postgres over SQLite");
  });
});

describe("formatCompact", () => {
  test("returns a string without throwing", () => {
    const entries = [makeEntry()];
    const result = formatCompact(entries);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("decision");
    expect(result).toContain("Chose Postgres");
  });

  test('returns "No entries found." for empty array', () => {
    expect(formatCompact([])).toBe("No entries found.");
  });
});
