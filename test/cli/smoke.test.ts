import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanupJoaHome, makeJoaHome, runJoa } from "./cli-helpers.ts";

/**
 * CLI smoke tests — every user-facing command is run end-to-end via child process.
 * A shared JOA_HOME is seeded with entries in beforeAll, then reused (read-mostly) across tests.
 */

let home: string;

beforeAll(async () => {
  home = makeJoaHome();
  // Seed 3 entries
  await runJoa(["log", "added auth middleware", "-c", "decision", "-t", "project:api"], { home });
  await runJoa(
    ["log", "fixed token expiry", "-c", "change", "-t", "project:api", "-t", "scope:security"],
    { home },
  );
  await runJoa(["log", "response times look good", "-c", "observation"], { home });
});

afterAll(() => {
  cleanupJoaHome(home);
});

describe("CLI smoke: metadata", () => {
  test("--version prints version matching package.json", async () => {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, "../../package.json"), "utf8"));
    const r = await runJoa(["--version"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toContain(pkg.version);
  });

  test("--help prints help text with all command names", async () => {
    const r = await runJoa(["--help"], { home });
    expect(r.exitCode).toBe(0);
    const out = r.stdout;
    expect(out).toContain("Usage");
    expect(out).toContain("log");
    expect(out).toContain("query");
    expect(out).toContain("status");
    expect(out).toContain("setup");
  });

  test("no args exits 1 with help text", async () => {
    const r = await runJoa([], { home });
    expect(r.exitCode).toBe(1);
    // Help goes to stderr when invoked without args
    const combined = r.stdout + r.stderr;
    expect(combined).toContain("Usage");
  });
});

describe("CLI smoke: log", () => {
  test("log with valid input exits 0 and prints entry ID", async () => {
    const r = await runJoa(["log", "smoke test entry", "-c", "test"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("e_");
  });
});

describe("CLI smoke: query", () => {
  test("query --preset catchup exits 0", async () => {
    const r = await runJoa(["query", "--preset", "catchup"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  test("query -c decision returns matching entries", async () => {
    const r = await runJoa(["query", "-c", "decision"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("auth middleware");
  });

  test("query -t project:api returns matching entries", async () => {
    const r = await runJoa(["query", "-t", "project:api"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
  });
});

describe("CLI smoke: aliases", () => {
  test("catchup exits 0", async () => {
    const r = await runJoa(["catchup"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  test("threads exits 0", async () => {
    const r = await runJoa(["threads"], { home });
    expect(r.exitCode).toBe(0);
  });

  test("timeline exits 0", async () => {
    const r = await runJoa(["timeline"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  test("decisions exits 0", async () => {
    const r = await runJoa(["decisions"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  test("changes via query --preset exits 0", async () => {
    const r = await runJoa(["query", "--preset", "changes"], { home });
    expect(r.exitCode).toBe(0);
  });
});

describe("CLI smoke: search", () => {
  test("search with quoted term exits 0", async () => {
    const r = await runJoa(["search", "auth"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("auth");
  });

  test("search with multiple args joins with space", async () => {
    const r = await runJoa(["search", "auth", "middleware"], { home });
    expect(r.exitCode).toBe(0);
  });
});

describe("CLI smoke: status", () => {
  test("status exits 0 and shows entry count", async () => {
    const r = await runJoa(["status"], { home });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Entries");
  });
});

describe("CLI smoke: rebuild", () => {
  test("rebuild exits 0", async () => {
    const r = await runJoa(["rebuild"], { home });
    expect(r.exitCode).toBe(0);
  });
});

describe("CLI smoke: export", () => {
  test("export exits 0 and outputs valid JSONL", async () => {
    const r = await runJoa(["export"], { home });
    expect(r.exitCode).toBe(0);
    const lines = r.stdout.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    // Every line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe("CLI smoke: config", () => {
  test("config get defaults.device exits 0", async () => {
    const r = await runJoa(["config", "get", "defaults.device"], { home });
    // Device defaults to hostname, which is a non-empty string
    expect(r.exitCode).toBe(0);
  });
});
