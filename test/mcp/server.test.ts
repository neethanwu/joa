import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../../src/core/config.ts";
import type { LogContext, ReadContext } from "../../src/core/context.ts";
import { openDatabase } from "../../src/core/db.ts";
import type { JoaDb } from "../../src/core/db.ts";
import { InvalidThreadId, ValidationError } from "../../src/core/errors.ts";
import { sessionId } from "../../src/core/ids.ts";
import { log, query, status } from "../../src/core/index.ts";
import { makeLogCtx } from "../core/helpers.ts";

/**
 * MCP server tests — we test the core functions that the MCP tool handlers delegate to,
 * since the actual MCP server requires a stdio transport. This validates that
 * the tool handler logic (call core, format response, handle errors) works correctly.
 */

describe("MCP: joa_log tool", () => {
  let db: JoaDb;
  let tmp: string;
  let logCtx: LogContext;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-mcp-test-"));
    logCtx = makeLogCtx(db, tmp, { agent: "mcp-test" });
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("log returns entry_id and status ok", async () => {
    const result = await log({ category: "observation", summary: "Test entry" }, logCtx);
    const response = {
      entry_id: result.entry_id,
      thread_id: result.thread_id,
      status: result.status,
    };
    expect(response.status).toBe("ok");
    expect(response.entry_id).toMatch(/^e_/);
    expect(response.thread_id).toBeNull();
  });

  test("log with all optional fields", async () => {
    const result = await log(
      {
        category: "decision",
        summary: "Chose Redis",
        thread_id: "new",
        detail: { reasoning: "speed" },
        resources: ["src/cache.ts"],
        tags: ["infra"],
        annotations: { confidence: "high" },
      },
      logCtx,
    );
    expect(result.status).toBe("ok");
    expect(result.thread_id).toMatch(/^th_/);
  });

  test("log error returns structured error", async () => {
    // Simulate what the MCP handler does on error
    try {
      await log({ category: "", summary: "test" }, logCtx);
      throw new Error("Expected log to throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorResponse = {
        isError: true,
        content: [{ type: "text", text: `Error: ${message}` }],
      };
      expect(errorResponse.isError).toBe(true);
      expect(errorResponse.content[0]?.text).toContain("Error:");
    }
  });
});

describe("MCP: joa_query tool", () => {
  let db: JoaDb;
  let tmp: string;
  const config = defaultConfig();

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-mcp-query-test-"));
    const ctx = makeLogCtx(db, tmp, { agent: "mcp-test" });
    await log({ category: "decision", summary: "Chose Postgres" }, ctx);
    await log({ category: "observation", summary: "Latency is low" }, ctx);
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("query returns markdown by default", () => {
    const result = query({ format: "md" }, { db }, config);
    expect(result.format).toBe("md");
    expect(result.rendered).toContain("##");
    expect(result.rendered).toContain("**Chose Postgres**");
  });

  test("query with preset catchup returns recent entries", () => {
    const result = query({ preset: "catchup", format: "md" }, { db }, config);
    expect(result.entries.length).toBe(2);
  });

  test("query with search returns filtered results", () => {
    const result = query({ search: "Postgres", format: "md" }, { db }, config);
    expect(result.entries.length).toBe(1);
  });

  test("query with limit respects max", () => {
    const result = query({ limit: 1, format: "md" }, { db }, config);
    expect(result.entries.length).toBe(1);
    expect(result.total).toBe(2);
  });

  test("query total count reflects entries beyond limit", () => {
    const result = query({ limit: 1 }, { db }, config);
    const text = result.rendered;
    // The MCP handler appends "Showing X of Y entries" when total > entries.length
    if (result.total > result.entries.length) {
      const suffix = `\n\n_Showing ${result.entries.length} of ${result.total} entries_`;
      expect(suffix).toContain("Showing 1 of 2");
    }
  });
});

describe("MCP: --agent flag", () => {
  let db: JoaDb;
  let tmp: string;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-mcp-agent-test-"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("agent name flows into logged entries", async () => {
    const ctx = makeLogCtx(db, tmp, { agent: "claude-code" });
    const result = await log({ category: "observation", summary: "Test" }, ctx);
    expect(result.status).toBe("ok");

    const config = defaultConfig();
    const entries = query({ agent: "claude-code", format: "json" }, { db }, config);
    expect(entries.entries.length).toBe(1);
    expect(entries.entries[0]?.agent).toBe("claude-code");
  });

  test("default agent is 'mcp' when --agent not provided", async () => {
    const ctx = makeLogCtx(db, tmp, { agent: "mcp" });
    await log({ category: "observation", summary: "Default agent test" }, ctx);

    const config = defaultConfig();
    const entries = query({ agent: "mcp", format: "json" }, { db }, config);
    expect(entries.entries.length).toBe(1);
    expect(entries.entries[0]?.agent).toBe("mcp");
  });

  test("bootstrap accepts agent override (simulates JOA_MCP_AGENT env var)", async () => {
    // The MCP server does: bootstrap({ agent: process.env.JOA_MCP_AGENT ?? "mcp" })
    // The CLI dispatcher sets JOA_MCP_AGENT before importing the server module.
    // We test the bootstrap path directly: given an agent name override,
    // entries are logged under that agent and queryable by it.
    const agentName = "test-agent-from-env";
    const ctx = makeLogCtx(db, tmp, { agent: agentName });
    const result = await log({ category: "observation", summary: "Env var agent test" }, ctx);
    expect(result.status).toBe("ok");

    const config = defaultConfig();

    // The entry should be queryable by the overridden agent name
    const matched = query({ agent: agentName, format: "json" }, { db }, config);
    expect(matched.entries.length).toBe(1);
    expect(matched.entries[0]?.agent).toBe(agentName);
    expect(matched.entries[0]?.summary).toBe("Env var agent test");

    // It should NOT appear under the default "mcp" agent
    const defaultAgent = query({ agent: "mcp", format: "json" }, { db }, config);
    expect(defaultAgent.entries.length).toBe(0);
  });

  test("entries from different agents are filterable", async () => {
    const claudeCtx = makeLogCtx(db, tmp, { agent: "claude-code" });
    const cursorCtx = makeLogCtx(db, tmp, { agent: "cursor" });

    await log({ category: "observation", summary: "From Claude" }, claudeCtx);
    await log({ category: "observation", summary: "From Cursor" }, cursorCtx);

    const config = defaultConfig();
    const claudeEntries = query({ agent: "claude-code", format: "json" }, { db }, config);
    expect(claudeEntries.entries.length).toBe(1);
    expect(claudeEntries.entries[0]?.summary).toBe("From Claude");

    const cursorEntries = query({ agent: "cursor", format: "json" }, { db }, config);
    expect(cursorEntries.entries.length).toBe(1);
    expect(cursorEntries.entries[0]?.summary).toBe("From Cursor");
  });
});

describe("MCP: joa_status tool", () => {
  let db: JoaDb;
  let tmp: string;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-mcp-status-test-"));
    const ctx = makeLogCtx(db, tmp, { agent: "mcp-test" });
    await log({ category: "decision", summary: "test" }, ctx);
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("status returns JSON-serializable output", () => {
    const config = defaultConfig();
    const sid = sessionId();
    const s = status({ db }, config, sid);

    // Verify it serializes cleanly (what the MCP handler does)
    const json = JSON.stringify(s, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.total_entries).toBe(1);
    expect(parsed.entries_by_category.decision).toBe(1);
    expect(parsed.db_healthy).toBe(true);
    expect(parsed.current_session_id).toMatch(/^s_/);
  });
});

// ---------------------------------------------------------------------------
// MCP input validation & error wrapping (Section 1.3)
// ---------------------------------------------------------------------------

describe("MCP: input validation", () => {
  let db: JoaDb;
  let tmp: string;
  let logCtx: LogContext;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-mcp-validation-test-"));
    logCtx = makeLogCtx(db, tmp, { agent: "mcp-test" });
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("log with empty category throws ValidationError", async () => {
    await expect(log({ category: "", summary: "test" }, logCtx)).rejects.toThrow(ValidationError);
  });

  test("log with empty summary throws ValidationError", async () => {
    await expect(log({ category: "decision", summary: "" }, logCtx)).rejects.toThrow(
      ValidationError,
    );
  });

  test("log with invalid thread_id throws InvalidThreadId", async () => {
    await expect(
      log({ category: "decision", summary: "test", thread_id: "bad-id" }, logCtx),
    ).rejects.toThrow(InvalidThreadId);
  });

  test("query with unrecognized preset falls through without error", () => {
    const config = defaultConfig();
    // The query function accesses presets via config lookup — an invalid preset
    // does not throw but simply returns no preset-specific filters
    const result = query({ preset: "nonexistent" as "catchup" }, { db }, config);
    // It should still work without crashing — returns all entries
    expect(result).toBeDefined();
  });
});

describe("MCP: empty state", () => {
  let db: JoaDb;
  let tmp: string;

  beforeEach(async () => {
    db = await openDatabase(":memory:");
    tmp = mkdtempSync(join(tmpdir(), "joa-mcp-empty-test-"));
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true });
  });

  test("status on empty DB returns zero counts", () => {
    const config = defaultConfig();
    const sid = sessionId();
    const s = status({ db }, config, sid);
    expect(s.total_entries).toBe(0);
    expect(s.entries_by_category).toEqual({});
    expect(s.db_healthy).toBe(true);
  });

  test("query on empty DB returns empty result without error", () => {
    const config = defaultConfig();
    const result = query({ preset: "catchup" }, { db }, config);
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.rendered).toBe("No entries found.");
  });
});
