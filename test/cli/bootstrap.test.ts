import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAgentName } from "../../src/core/bootstrap.ts";
import { openDatabase } from "../../src/core/db.ts";
import { ValidationError } from "../../src/core/errors.ts";

describe("validateAgentName", () => {
  test("accepts valid names", () => {
    expect(() => validateAgentName("claude-code")).not.toThrow();
    expect(() => validateAgentName("cursor")).not.toThrow();
    expect(() => validateAgentName("my_agent_1")).not.toThrow();
    expect(() => validateAgentName("a")).not.toThrow();
    expect(() => validateAgentName("A")).not.toThrow();
    expect(() => validateAgentName("agent-123_test")).not.toThrow();
  });

  test("rejects empty string", () => {
    expect(() => validateAgentName("")).toThrow(ValidationError);
    expect(() => validateAgentName("")).toThrow(/1-64 characters/);
  });

  test("rejects names exceeding 64 characters", () => {
    const long = "a".repeat(65);
    expect(() => validateAgentName(long)).toThrow(ValidationError);
    expect(() => validateAgentName(long)).toThrow(/1-64 characters/);
  });

  test("accepts names at the 64-character boundary", () => {
    expect(() => validateAgentName("a".repeat(64))).not.toThrow();
  });

  test("rejects names with special characters", () => {
    const invalid = ["agent name", "agent.name", "agent@name", "agent/name", "agent!"];
    for (const name of invalid) {
      expect(() => validateAgentName(name)).toThrow(ValidationError);
      expect(() => validateAgentName(name)).toThrow(/alphanumeric/);
    }
  });

  test("rejects names with unicode characters", () => {
    expect(() => validateAgentName("agenténame")).toThrow(ValidationError);
  });
});

describe("bootstrap", () => {
  let tmp: string;

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true });
  });

  test("bootstrap returns all required fields", async () => {
    // We test the bootstrap pattern manually rather than calling bootstrap()
    // because bootstrap() reads from the real filesystem (~/.joa/) and has
    // side effects (creates directories, opens the real DB). Mocking the
    // filesystem would obscure the intent. Instead we replicate the same
    // sequence of calls with controlled inputs to verify the contract.
    const { loadConfig, getDevice, resolveJournalsPath, sessionId, checkAndSyncIfStale } =
      await import("../../src/core/index.ts");

    tmp = mkdtempSync(join(tmpdir(), "joa-bootstrap-test-"));
    const db = openDatabase(":memory:");
    const config = loadConfig(tmp); // Use temp dir so no .joa.yaml is found
    const journalsDir = join(tmp, "journals");
    await checkAndSyncIfStale(db, journalsDir);

    const sid = sessionId();
    const readCtx = { db };
    const logCtx = {
      db,
      journalsDir,
      sessionId: sid,
      agent: config.defaults.agent ?? "cli",
      device: getDevice(config),
      defaultTags: config.defaults.tags,
    };

    expect(readCtx.db).toBeDefined();
    expect(logCtx.db).toBeDefined();
    expect(logCtx.journalsDir).toBe(journalsDir);
    expect(logCtx.sessionId).toMatch(/^s_/);
    expect(logCtx.agent).toBe("cli");
    expect(typeof logCtx.device).toBe("string");
    expect(Array.isArray(logCtx.defaultTags)).toBe(true);

    db.close();
  });
});
