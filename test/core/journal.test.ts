import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Entry } from "../../src/core/entry.ts";
import { entryId, sessionId } from "../../src/core/ids.ts";
import { appendEntry, listJournalFiles, readJournalFile } from "../../src/core/journal.ts";

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

describe("journal", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "joa-journal-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  test("appendEntry creates the file if it does not exist", async () => {
    const entry = makeEntry();
    await appendEntry(entry, tmp);
    const files = await listJournalFiles(tmp);
    expect(files.length).toBe(1);
  });

  test("multiple appendEntry calls produce valid separate JSONL lines", async () => {
    const e1 = makeEntry({ summary: "first" });
    const e2 = makeEntry({ summary: "second" });
    await appendEntry(e1, tmp);
    await appendEntry(e2, tmp);

    const files = await listJournalFiles(tmp);
    const rows = await readJournalFile(files[0]!);
    expect(rows.length).toBe(2);
    expect(rows[0]?.summary).toBe("first");
    expect(rows[1]?.summary).toBe("second");
  });

  test("readJournalFile returns all valid entries", async () => {
    const entry = makeEntry();
    await appendEntry(entry, tmp);
    const files = await listJournalFiles(tmp);
    const rows = await readJournalFile(files[0]!);
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(entry.id);
  });

  test("readJournalFile skips malformed lines and returns valid remainder", async () => {
    const entry = makeEntry();
    await appendEntry(entry, tmp);
    const files = await listJournalFiles(tmp);
    // Append a malformed line
    const content = readFileSync(files[0]!, "utf8");
    writeFileSync(files[0]!, `${content}not valid json\n`);
    const rows = await readJournalFile(files[0]!);
    expect(rows.length).toBe(1);
  });

  test("listJournalFiles returns files sorted by date", async () => {
    // Create files with different dates
    writeFileSync(join(tmp, "2025-02-20.jsonl"), "");
    writeFileSync(join(tmp, "2025-02-18.jsonl"), "");
    writeFileSync(join(tmp, "2025-02-19.jsonl"), "");
    const files = await listJournalFiles(tmp);
    expect(files.length).toBe(3);
    expect(files[0]!).toContain("2025-02-18");
    expect(files[1]!).toContain("2025-02-19");
    expect(files[2]!).toContain("2025-02-20");
  });

  test("listJournalFiles returns empty array for non-existent directory", async () => {
    const files = await listJournalFiles("/tmp/does-not-exist-joa-test");
    expect(files).toEqual([]);
  });
});
