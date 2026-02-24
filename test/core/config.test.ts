import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultConfig,
  getDevice,
  loadConfig,
  resolveDbPath,
  resolveJournalsPath,
} from "../../src/core/config.ts";
import { ConfigError } from "../../src/core/errors.ts";

describe("config", () => {
  test("defaultConfig() returns valid config with all required keys", () => {
    const config = defaultConfig();
    expect(config.defaults).toBeDefined();
    expect(config.defaults.tags).toEqual([]);
    expect(config.db.path).toBe("~/.joa/journal.db");
    expect(config.journals.path).toBe("~/.joa/journals");
    expect(config.mcp.http_port).toBe(7070);
    expect(config.search.vector_enabled).toBe(false);
    expect(config.presets.catchup).toBeDefined();
    expect(config.presets.threads).toBeDefined();
  });

  test("loadConfig() with no files returns defaults (no throw)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "joa-config-test-"));
    const config = loadConfig(tmp);
    expect(config.defaults.tags).toEqual([]);
    rmSync(tmp, { recursive: true });
  });

  test("getDevice() returns a non-empty string", () => {
    const config = defaultConfig();
    const device = getDevice(config);
    expect(device.length).toBeGreaterThan(0);
  });

  test("resolveDbPath() expands ~ correctly", () => {
    const config = defaultConfig();
    const resolved = resolveDbPath(config);
    expect(resolved).not.toContain("~");
    expect(resolved).toContain(".joa/journal.db");
  });

  test("resolveJournalsPath() expands ~ correctly", () => {
    const config = defaultConfig();
    const resolved = resolveJournalsPath(config);
    expect(resolved).not.toContain("~");
    expect(resolved).toContain(".joa/journals");
  });

  describe("directory-level config", () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), "joa-dir-config-"));
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true });
    });

    test("tags are additive (appended to defaults, not replaced)", () => {
      writeFileSync(join(tmp, ".joa.yaml"), 'defaults:\n  tags: ["project:my-app"]\n');
      const config = loadConfig(tmp);
      expect(config.defaults.tags).toContain("project:my-app");
    });

    test("malformed YAML throws ConfigError", () => {
      writeFileSync(join(tmp, ".joa.yaml"), "{{invalid yaml");
      expect(() => loadConfig(tmp)).toThrow(ConfigError);
    });
  });
});
