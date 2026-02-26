import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * We cannot import the config writers directly from main.ts because it
 * immediately runs parseArgs and dispatches commands as a side effect.
 * Instead we replicate the writer logic here to test the config-writing
 * patterns in isolation. This tests the actual file I/O behavior.
 */

// Replicate writeJsonMcpServers from main.ts
function writeJsonMcpServers(
  configPath: string,
  serverEntry: Record<string, unknown>,
  rootKey = "mcpServers",
): void {
  const { dirname } = require("node:path");
  const { mkdirSync } = require("node:fs");

  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      // Malformed JSON — overwrite
    }
  }

  const merged = {
    ...existing,
    [rootKey]: {
      ...(existing[rootKey] as Record<string, unknown> | undefined),
      ...serverEntry,
    },
  };

  writeFileSync(configPath, JSON.stringify(merged, null, 2));
}

describe("writeJsonMcpServers", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "joa-config-writer-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  test("creates config file when none exists", () => {
    const configPath = join(tmp, "config.json");
    writeJsonMcpServers(configPath, {
      joa: { command: "joa", args: ["mcp", "--agent", "claude-code"] },
    });

    const result = JSON.parse(readFileSync(configPath, "utf8"));
    expect(result.mcpServers.joa.command).toBe("joa");
    expect(result.mcpServers.joa.args).toEqual(["mcp", "--agent", "claude-code"]);
  });

  test("merges into existing config without overwriting other keys", () => {
    const configPath = join(tmp, "existing.json");
    writeFileSync(configPath, JSON.stringify({ someOtherKey: "value", mcpServers: { other: {} } }));

    writeJsonMcpServers(configPath, {
      joa: { command: "joa", args: ["mcp"] },
    });

    const result = JSON.parse(readFileSync(configPath, "utf8"));
    expect(result.someOtherKey).toBe("value");
    expect(result.mcpServers.other).toEqual({});
    expect(result.mcpServers.joa.command).toBe("joa");
  });

  test("overwrites existing joa entry on re-run", () => {
    const configPath = join(tmp, "rerun.json");
    writeJsonMcpServers(configPath, {
      joa: { command: "old", args: ["old"] },
    });
    writeJsonMcpServers(configPath, {
      joa: { command: "joa", args: ["mcp", "--agent", "cursor"] },
    });

    const result = JSON.parse(readFileSync(configPath, "utf8"));
    expect(result.mcpServers.joa.command).toBe("joa");
    expect(result.mcpServers.joa.args).toEqual(["mcp", "--agent", "cursor"]);
  });

  test("handles malformed JSON by overwriting", () => {
    const configPath = join(tmp, "malformed.json");
    writeFileSync(configPath, "not valid json {{{");

    writeJsonMcpServers(configPath, {
      joa: { command: "joa", args: ["mcp"] },
    });

    const result = JSON.parse(readFileSync(configPath, "utf8"));
    expect(result.mcpServers.joa.command).toBe("joa");
  });

  test("creates nested directories if needed", () => {
    const configPath = join(tmp, "deep", "nested", "config.json");
    writeJsonMcpServers(configPath, { joa: { command: "joa" } });

    expect(existsSync(configPath)).toBe(true);
    const result = JSON.parse(readFileSync(configPath, "utf8"));
    expect(result.mcpServers.joa.command).toBe("joa");
  });

  test("uses custom root key", () => {
    const configPath = join(tmp, "custom-root.json");
    writeJsonMcpServers(
      configPath,
      { joa: { command: "joa", args: ["mcp", "--agent", "github-copilot"] } },
      "servers",
    );

    const result = JSON.parse(readFileSync(configPath, "utf8"));
    expect(result.servers.joa.command).toBe("joa");
    expect(result.mcpServers).toBeUndefined();
  });

  test("uses namespaced root key for Amp-style config", () => {
    const configPath = join(tmp, "amp.json");
    writeJsonMcpServers(
      configPath,
      { joa: { command: "joa", args: ["mcp", "--agent", "amp"] } },
      "amp.mcpServers",
    );

    const result = JSON.parse(readFileSync(configPath, "utf8"));
    // The namespaced key is stored as a literal key, not nested
    expect(result["amp.mcpServers"].joa.command).toBe("joa");
  });
});

describe("Codex TOML writer", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "joa-codex-writer-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  // Replicate Codex writer logic
  function writeCodexConfig(configPath: string, agentName: string): void {
    const { dirname } = require("node:path");
    const { mkdirSync } = require("node:fs");

    const dir = dirname(configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let existing = "";
    if (existsSync(configPath)) {
      try {
        existing = readFileSync(configPath, "utf8");
      } catch {
        // Unreadable — overwrite
      }
    }

    const cleaned = existing.replace(/\[mcp_servers\.joa\][^\[]*(?=\[|$)/s, "").trimEnd();
    const block = `\n\n[mcp_servers.joa]\ncommand = "joa"\nargs = ["mcp", "--agent", "${agentName}"]\n`;
    writeFileSync(configPath, cleaned + block);
  }

  test("creates TOML config from scratch", () => {
    const configPath = join(tmp, "config.toml");
    writeCodexConfig(configPath, "codex");

    const content = readFileSync(configPath, "utf8");
    expect(content).toContain("[mcp_servers.joa]");
    expect(content).toContain('command = "joa"');
    expect(content).toContain('args = ["mcp", "--agent", "codex"]');
  });

  test("preserves existing TOML content", () => {
    const configPath = join(tmp, "existing.toml");
    writeFileSync(configPath, '[model]\nprovider = "openai"\n');

    writeCodexConfig(configPath, "codex");

    const content = readFileSync(configPath, "utf8");
    expect(content).toContain('[model]\nprovider = "openai"');
    expect(content).toContain("[mcp_servers.joa]");
  });

  test("replaces existing joa block on re-run", () => {
    const configPath = join(tmp, "rerun.toml");
    writeFileSync(
      configPath,
      '[mcp_servers.joa]\ncommand = "old"\nargs = ["old"]\n\n[other]\nkey = "val"\n',
    );

    writeCodexConfig(configPath, "codex");

    const content = readFileSync(configPath, "utf8");
    // Old joa block should be replaced
    expect(content).not.toContain('command = "old"');
    expect(content).toContain('command = "joa"');
    // Other sections preserved
    expect(content).toContain('[other]\nkey = "val"');
  });
});

describe("OpenCode writer", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "joa-opencode-writer-test-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true });
  });

  function writeOpenCodeConfig(configPath: string, agentName: string): void {
    const { dirname } = require("node:path");
    const { mkdirSync } = require("node:fs");

    const dir = dirname(configPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    let existing: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        existing = JSON.parse(readFileSync(configPath, "utf8"));
      } catch {
        // Malformed — overwrite
      }
    }

    const mcp = (existing.mcp as Record<string, unknown> | undefined) ?? {};
    const merged = {
      ...existing,
      mcp: {
        ...mcp,
        joa: {
          type: "local",
          command: ["joa", "mcp", "--agent", agentName],
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(merged, null, 2));
  }

  test("creates OpenCode config with array command format", () => {
    const configPath = join(tmp, "opencode.json");
    writeOpenCodeConfig(configPath, "opencode");

    const result = JSON.parse(readFileSync(configPath, "utf8"));
    expect(result.mcp.joa.type).toBe("local");
    expect(result.mcp.joa.command).toEqual(["joa", "mcp", "--agent", "opencode"]);
  });

  test("preserves existing mcp entries", () => {
    const configPath = join(tmp, "existing.json");
    writeFileSync(
      configPath,
      JSON.stringify({ mcp: { other: { type: "local", command: ["other"] } } }),
    );

    writeOpenCodeConfig(configPath, "opencode");

    const result = JSON.parse(readFileSync(configPath, "utf8"));
    expect(result.mcp.other.command).toEqual(["other"]);
    expect(result.mcp.joa.command).toEqual(["joa", "mcp", "--agent", "opencode"]);
  });
});
