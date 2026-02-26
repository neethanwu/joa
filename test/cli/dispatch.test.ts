import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupJoaHome, makeJoaHome, runJoa } from "./cli-helpers.ts";

/**
 * CLI error dispatch tests — verifies that different error types map to
 * correct exit codes and stderr messages.
 *
 * Two error surfaces:
 * 1. Errors thrown to the top-level catch block (exit 1/2/3/4)
 * 2. Direct process.exit(1) in command handlers (missing args, invalid input)
 */

describe("CLI dispatch: catch block errors", () => {
  let home: string;

  beforeEach(() => {
    home = makeJoaHome();
  });

  afterEach(() => {
    cleanupJoaHome(home);
  });

  test("ValidationError (empty summary) → exit 1", async () => {
    // joa log with empty string as summary — validateEntryInput throws ValidationError
    const r = await runJoa(["log", "   ", "-c", "decision"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("summary");
  });

  test("InvalidThreadId → exit 1", async () => {
    const r = await runJoa(["log", "test", "--thread", "bad-id"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("thread");
  });

  test("corrupt DB → exit 1 with error message", async () => {
    // Write garbage to the DB file so SQLite can't open it.
    // bun:sqlite throws a generic Error (not DatabaseError), so it falls
    // through to the generic handler with exit code 1.
    const dbPath = join(home, ".joa", "journal.db");
    writeFileSync(dbPath, "this is not a sqlite database");
    const r = await runJoa(["query"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("not a database");
  });

  test("JournalWriteError (read-only dir) → exit 3 with permissions hint", async () => {
    // Make journals dir read-only so appendEntry fails
    const journalsDir = join(home, ".joa", "journals");
    chmodSync(journalsDir, 0o444);
    const r = await runJoa(["log", "test entry", "-c", "observation"], { home });
    // Restore permissions for cleanup
    chmodSync(journalsDir, 0o755);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("Write error");
    expect(r.stderr).toContain("disk space");
  });

  test("ConfigError (malformed YAML) → exit 4 with config hint", async () => {
    // Write invalid YAML to config file
    const configPath = join(home, ".joa", "config.yaml");
    writeFileSync(configPath, "defaults:\n  device: [unclosed bracket");
    const r = await runJoa(["status"], { home });
    expect(r.exitCode).toBe(4);
    expect(r.stderr).toContain("Config error");
    expect(r.stderr).toContain("config");
  });
});

describe("CLI dispatch: direct exit paths", () => {
  let home: string;

  beforeEach(() => {
    home = makeJoaHome();
  });

  afterEach(() => {
    cleanupJoaHome(home);
  });

  test("log with no summary → exit 1 with usage", async () => {
    const r = await runJoa(["log"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Usage");
  });

  test("query with invalid preset → exit 1", async () => {
    const r = await runJoa(["query", "--preset", "bogus"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("preset");
  });

  test("import with no file → exit 1 with usage", async () => {
    const r = await runJoa(["import"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Usage");
  });

  test("config get with no key → exit 1 with usage", async () => {
    const r = await runJoa(["config", "get"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Usage");
  });

  test("config get with unknown key → exit 1", async () => {
    const r = await runJoa(["config", "get", "nonexistent.key"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Unknown config key");
  });

  test("unknown command → exit 1", async () => {
    const r = await runJoa(["foobar"], { home });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("Unknown command");
  });
});
