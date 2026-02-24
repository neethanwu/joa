import { existsSync, readFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import yaml from "js-yaml";
import { ConfigError } from "./errors.ts";

export type PresetName = "catchup" | "threads" | "timeline" | "decisions" | "changes";

export interface PresetConfig {
  key_categories?: string[];
  summarize_others?: boolean;
  default_limit?: number;
  thread_limit?: number;
  include_stats?: boolean;
  categories?: string[];
}

export interface JoaConfig {
  defaults: {
    device: string | null;
    agent: string | null;
    tags: string[];
  };
  db: { path: string };
  journals: { path: string };
  mcp: { http_port: number };
  search: { vector_enabled: boolean };
  logging: { categories: Record<string, { suggested_detail: string[] }> };
  presets: Partial<Record<PresetName, PresetConfig>>;
}

/** Returns the hardcoded default configuration. */
export function defaultConfig(): JoaConfig {
  return {
    defaults: {
      device: null,
      agent: null,
      tags: [],
    },
    db: { path: "~/.joa/journal.db" },
    journals: { path: "~/.joa/journals" },
    mcp: { http_port: 7070 },
    search: { vector_enabled: false },
    logging: {
      categories: {
        "file change": {
          suggested_detail: ["path", "language", "diff_summary", "lines_changed", "reason"],
        },
        decision: { suggested_detail: ["decision", "reasoning", "alternatives", "confidence"] },
        error: { suggested_detail: ["error", "resolution", "stack_trace"] },
        command: { suggested_detail: ["command", "exit_code", "duration_ms"] },
        test: { suggested_detail: ["passed", "failed", "skipped", "duration_ms"] },
        conversation: { suggested_detail: ["context", "people", "topics"] },
        memory: { suggested_detail: ["context", "related_to"] },
      },
    },
    presets: {
      catchup: {
        key_categories: ["decision", "error", "milestone", "plan"],
        summarize_others: true,
        default_limit: 50,
      },
      threads: { thread_limit: 20, include_stats: true },
      timeline: { default_limit: 50 },
      decisions: { categories: ["decision"], default_limit: 50 },
      changes: { categories: ["file change"], default_limit: 50 },
    },
  };
}

function expandTilde(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

function loadYamlFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf8");
    const parsed = yaml.load(content);
    if (parsed === null || parsed === undefined) return null;
    if (typeof parsed !== "object") {
      throw new ConfigError(`Failed to parse config: ${filePath}`);
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    throw new ConfigError(`Failed to parse config: ${filePath}`, { cause: e });
  }
}

function mergeConfig(
  base: JoaConfig,
  overlay: Record<string, unknown>,
  additiveTags: boolean,
): JoaConfig {
  const result = structuredClone(base);
  const defaults = overlay.defaults as Record<string, unknown> | undefined;
  if (defaults) {
    if (defaults.device !== undefined) result.defaults.device = defaults.device as string | null;
    if (defaults.agent !== undefined) result.defaults.agent = defaults.agent as string | null;
    if (Array.isArray(defaults.tags)) {
      if (additiveTags) {
        result.defaults.tags = [...result.defaults.tags, ...(defaults.tags as string[])];
      } else {
        result.defaults.tags = defaults.tags as string[];
      }
    }
  }
  const db = overlay.db as Record<string, unknown> | undefined;
  if (db?.path) result.db.path = db.path as string;
  const journals = overlay.journals as Record<string, unknown> | undefined;
  if (journals?.path) result.journals.path = journals.path as string;
  const mcp = overlay.mcp as Record<string, unknown> | undefined;
  if (mcp?.http_port !== undefined) result.mcp.http_port = mcp.http_port as number;
  const search = overlay.search as Record<string, unknown> | undefined;
  if (search?.vector_enabled !== undefined)
    result.search.vector_enabled = search.vector_enabled as boolean;
  const presets = overlay.presets as Record<string, unknown> | undefined;
  if (presets) {
    for (const [key, value] of Object.entries(presets)) {
      if (value && typeof value === "object") {
        result.presets[key as PresetName] = {
          ...result.presets[key as PresetName],
          ...value,
        } as PresetConfig;
      }
    }
  }
  return result;
}

/**
 * Loads and merges configuration.
 * 1. Start with defaultConfig()
 * 2. Merge global ~/.joa/config.yaml
 * 3. Walk CWD upward to homedir, load nearest .joa.yaml (tags are additive)
 */
export function loadConfig(cwd?: string): JoaConfig {
  let config = defaultConfig();

  // Global config
  const globalPath = join(homedir(), ".joa", "config.yaml");
  const globalOverlay = loadYamlFile(globalPath);
  if (globalOverlay) {
    config = mergeConfig(config, globalOverlay, false);
  }

  // Directory config — walk upward from cwd, stop at homedir
  const home = homedir();
  const startDir = resolve(cwd ?? process.cwd());
  let dir = startDir;
  while (true) {
    const candidate = join(dir, ".joa.yaml");
    const dirOverlay = loadYamlFile(candidate);
    if (dirOverlay) {
      config = mergeConfig(config, dirOverlay, true);
      break; // only nearest
    }
    const parent = dirname(dir);
    if (parent === dir || dir === home) break;
    dir = parent;
  }

  return config;
}

/** Returns the device name from config, falling back to hostname. */
export function getDevice(config: JoaConfig): string {
  return config.defaults.device ?? hostname();
}

/** Resolves the database path, expanding ~ to the home directory. */
export function resolveDbPath(config: JoaConfig): string {
  return expandTilde(config.db.path);
}

/** Resolves the journals directory path, expanding ~ to the home directory. */
export function resolveJournalsPath(config: JoaConfig): string {
  return expandTilde(config.journals.path);
}
