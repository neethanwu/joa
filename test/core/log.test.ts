import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import { InvalidThreadId, JournalWriteError } from "../../src/core/errors.ts";
import { isEntryId, isThreadId, sessionId } from "../../src/core/ids.ts";
import { listJournalFiles, readJournalFile } from "../../src/core/journal.ts";
import { log } from "../../src/core/log.ts";
import type { LogContext } from "../../src/core/log.ts";

function makeCtx(db: JoaDb, journalsDir: string): LogContext {
  return {
    db,
    journalsDir,
    sessionId: sessionId(),
    agent: "test-agent",
    device: "test-device",
    defaultTags: ["default-tag"],
  };
}

describe("log", () => {
  let db: JoaDb;
  let tmp: string;
  let ctx: LogContext;

  beforeEach(() => {
    db = openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-log-test-"));
    ctx = makeCtx(db, tmp);
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("basic log returns { entry_id, thread_id: null, status: ok }", async () => {
    const result = await log({ category: "decision", summary: "Chose Postgres" }, ctx);
    expect(result.status).toBe("ok");
    expect(isEntryId(result.entry_id)).toBe(true);
    expect(result.thread_id).toBeNull();
    expect(result.warning).toBeUndefined();
  });

  test('thread_id: "new" generates and returns a th_ prefixed ID', async () => {
    const result = await log({ category: "decision", summary: "test", thread_id: "new" }, ctx);
    expect(result.thread_id).not.toBeNull();
    expect(isThreadId(result.thread_id!)).toBe(true);
  });

  test("thread_id: existing ID uses it unchanged", async () => {
    const first = await log({ category: "decision", summary: "first", thread_id: "new" }, ctx);
    const result = await log(
      { category: "decision", summary: "second", thread_id: first.thread_id! },
      ctx,
    );
    expect(result.thread_id).toBe(first.thread_id);
  });

  test("thread_id: null and omitted both return null", async () => {
    const r1 = await log({ category: "decision", summary: "test", thread_id: null }, ctx);
    const r2 = await log({ category: "decision", summary: "test" }, ctx);
    expect(r1.thread_id).toBeNull();
    expect(r2.thread_id).toBeNull();
  });

  test("invalid thread_id throws InvalidThreadId before any I/O", async () => {
    await expect(
      log({ category: "decision", summary: "test", thread_id: "invalid" }, ctx),
    ).rejects.toThrow(InvalidThreadId);
    // No entries should exist
    expect(db.countEntries({})).toBe(0);
  });

  test("category is normalized in the stored entry", async () => {
    await log({ category: "  Decision  ", summary: "test" }, ctx);
    const rows = db.queryEntries({});
    expect(rows[0]?.category).toBe("decision");
  });

  test("default tags from context are merged and deduped with caller tags", async () => {
    await log({ category: "decision", summary: "test", tags: ["custom", "default-tag"] }, ctx);
    const rows = db.queryEntries({});
    const tags = JSON.parse(rows[0]!.tags) as string[];
    expect(tags).toContain("custom");
    expect(tags).toContain("default-tag");
    // Should be deduped
    expect(tags.filter((t) => t === "default-tag").length).toBe(1);
  });

  test("summary is trimmed", async () => {
    await log({ category: "decision", summary: "  trimmed  " }, ctx);
    const rows = db.queryEntries({});
    expect(rows[0]?.summary).toBe("trimmed");
  });

  test("JSONL file is created and contains the correct entry", async () => {
    const result = await log({ category: "decision", summary: "test" }, ctx);
    const files = await listJournalFiles(tmp);
    expect(files.length).toBe(1);
    const rows = await readJournalFile(files[0]!);
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(result.entry_id);
  });

  test("SQLite failure after JSONL success returns warning", async () => {
    // Create a context with a db that throws on writeEntry
    const failDb: JoaDb = {
      ...db,
      writeEntry() {
        throw new Error("SQLite failed");
      },
    };
    const failCtx = makeCtx(failDb, tmp);
    const result = await log({ category: "decision", summary: "test" }, failCtx);
    expect(result.status).toBe("ok");
    expect(result.warning).toBe("index_sync_failed");
    // Entry should still be in JSONL
    const files = await listJournalFiles(tmp);
    const rows = await readJournalFile(files[0]!);
    expect(rows.length).toBe(1);
  });

  test("JSONL failure throws JournalWriteError", async () => {
    const badCtx = makeCtx(db, "/nonexistent/readonly/path");
    await expect(log({ category: "decision", summary: "test" }, badCtx)).rejects.toThrow(
      JournalWriteError,
    );
  });
});
