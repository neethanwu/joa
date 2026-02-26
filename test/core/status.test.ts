import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/core/config.ts";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import { sessionId } from "../../src/core/ids.ts";
import { status } from "../../src/core/status.ts";
import { makeEntry } from "./helpers.ts";

describe("status", () => {
  let db: JoaDb;
  const config = defaultConfig();
  const sid = sessionId();

  beforeEach(async () => {
    db = await openDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  test("returns correct total_entries after writing test entries", () => {
    db.writeEntry(makeEntry());
    db.writeEntry(makeEntry());
    db.writeEntry(makeEntry({ category: "error" }));

    const s = status({ db }, config, sid);
    expect(s.total_entries).toBe(3);
  });

  test("entries_by_category is accurate", () => {
    db.writeEntry(makeEntry({ category: "decision" }));
    db.writeEntry(makeEntry({ category: "decision" }));
    db.writeEntry(makeEntry({ category: "error" }));

    const s = status({ db }, config, sid);
    expect(s.entries_by_category.decision).toBe(2);
    expect(s.entries_by_category.error).toBe(1);
  });

  test("oldest_entry and newest_entry are correct", () => {
    db.writeEntry(makeEntry({ timestamp: "2025-01-01T00:00:00.000Z" }));
    db.writeEntry(makeEntry({ timestamp: "2025-02-18T00:00:00.000Z" }));

    const s = status({ db }, config, sid);
    expect(s.oldest_entry).toBe("2025-01-01T00:00:00.000Z");
    expect(s.newest_entry).toBe("2025-02-18T00:00:00.000Z");
  });

  test("db_healthy is true for valid database", () => {
    const s = status({ db }, config, sid);
    expect(s.db_healthy).toBe(true);
  });

  test("empty journal returns null timestamps and zero count", () => {
    const s = status({ db }, config, sid);
    expect(s.total_entries).toBe(0);
    expect(s.oldest_entry).toBeNull();
    expect(s.newest_entry).toBeNull();
  });

  test("current_session_id reflects the passed sessionId", () => {
    const s = status({ db }, config, sid);
    expect(s.current_session_id).toBe(sid);
  });
});
