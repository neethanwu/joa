import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../../src/core/config.ts";
import type { LogContext } from "../../src/core/context.ts";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import { serializeEntry } from "../../src/core/entry.ts";
import { sessionId } from "../../src/core/ids.ts";
import { entryId } from "../../src/core/ids.ts";
import { appendEntry, listJournalFiles, readJournalFile } from "../../src/core/journal.ts";
import { log } from "../../src/core/log.ts";
import { query } from "../../src/core/query.ts";
import { status } from "../../src/core/status.ts";
import { checkAndSyncIfStale } from "../../src/core/sync.ts";
import { nowUtc } from "../../src/core/time.ts";

describe("integration: write → sync → query cycle", () => {
  let db: JoaDb;
  let tmp: string;
  let ctx: LogContext;
  let sharedThreadId: string;
  const config = defaultConfig();

  beforeAll(async () => {
    db = openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-integration-"));
    const sid = sessionId();
    ctx = {
      db,
      journalsDir: tmp,
      sessionId: sid,
      agent: "claude-code",
      device: "test-machine",
      defaultTags: [],
    };

    // Write 5 "decision" entries
    for (let i = 0; i < 5; i++) {
      await log({ category: "decision", summary: `Decision ${i + 1}` }, ctx);
    }

    // Write 3 "file change" entries
    for (let i = 0; i < 3; i++) {
      await log({ category: "file change", summary: `File change ${i + 1}` }, ctx);
    }

    // Write 2 "observation" entries
    for (let i = 0; i < 2; i++) {
      await log({ category: "observation", summary: `Observation ${i + 1}` }, ctx);
    }

    // Write 3 entries under a shared thread ID
    const firstThread = await log(
      {
        category: "decision",
        summary: "Thread entry 1 - starting investigation",
        thread_id: "new",
      },
      ctx,
    );
    sharedThreadId = firstThread.thread_id!;

    await log(
      {
        category: "observation",
        summary: "Thread entry 2 - found the issue",
        thread_id: sharedThreadId,
      },
      ctx,
    );

    await log(
      {
        category: "file change",
        summary: "Thread entry 3 - applied fix",
        thread_id: sharedThreadId,
      },
      ctx,
    );

    // Write 1 threadless personal entry
    await log(
      {
        category: "memory",
        summary: "Sister wants hiking boots",
        tags: ["personal"],
      },
      ctx,
    );
  });

  afterAll(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("status returns total_entries: 14 with correct categories", () => {
    const s = status(ctx, config, ctx.sessionId);
    expect(s.total_entries).toBe(14);
    // 5 decisions + 1 thread decision = 6 decision entries
    expect(s.entries_by_category.decision).toBe(6);
    expect(s.entries_by_category["file change"]).toBe(4);
    expect(s.entries_by_category.observation).toBe(3);
    expect(s.entries_by_category.memory).toBe(1);
  });

  test("decisions preset returns exactly 6 decision entries", () => {
    const result = query({ preset: "decisions" }, ctx, config);
    expect(result.entries.length).toBe(6);
    for (const e of result.entries) {
      expect(e.category).toBe("decision");
    }
  });

  test("category: file change returns exactly 4 entries", () => {
    const result = query({ category: "file change" }, ctx, config);
    expect(result.entries.length).toBe(4);
  });

  test("threads preset returns thread with entry_count: 3", () => {
    const result = query({ preset: "threads" }, ctx, config);
    expect(result.total).toBe(1);
    expect(result.rendered).toContain("3 entries");
  });

  test("thread_id query returns the 3 thread entries", () => {
    const result = query({ thread_id: sharedThreadId }, ctx, config);
    expect(result.entries.length).toBe(3);
  });

  test("tags: personal returns exactly 1 entry", () => {
    const result = query({ tags: ["personal"] }, ctx, config);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.summary).toContain("hiking boots");
  });

  test("search: decision returns FTS-matched entries", () => {
    const result = query({ search: "decision" }, ctx, config);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  test("FTS is case-insensitive", () => {
    const result = query({ search: "HIKING BOOTS" }, ctx, config);
    expect(result.entries.length).toBe(1);
  });

  test("format: json returns parseable JSON", () => {
    const result = query({ format: "json" }, ctx, config);
    const parsed = JSON.parse(result.rendered);
    expect(Array.isArray(parsed)).toBe(true);
  });

  test("JSONL-only entry is synced via checkAndSyncIfStale", async () => {
    // Write an entry directly to JSONL (bypassing SQLite)
    const directEntry = {
      id: entryId(),
      timestamp: nowUtc(),
      category: "observation",
      summary: "Direct JSONL entry for sync test",
      thread_id: null,
      session_id: ctx.sessionId,
      agent: "test",
      device: "test",
      resources: [] as string[],
      tags: [] as string[],
      detail: {},
      annotations: {},
    };
    await appendEntry(directEntry, tmp);

    // Reset last_indexed_at so sync picks it up
    db.setLastIndexedAt("2000-01-01T00:00:00.000Z");

    await checkAndSyncIfStale(db, tmp);

    // Now it should be queryable
    const result = query({ search: "Direct JSONL entry" }, ctx, config);
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.summary).toBe("Direct JSONL entry for sync test");
  });

  test("JSONL files on disk contain all entries as valid JSON lines", async () => {
    const files = await listJournalFiles(tmp);
    let totalLines = 0;
    for (const file of files) {
      const rows = await readJournalFile(file);
      totalLines += rows.length;
    }
    // 14 from log() + 1 direct JSONL write = 15
    expect(totalLines).toBe(15);
  });
});
