import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { JoaConfig } from "./config.ts";
import { getDevice, loadConfig, resolveDbPath, resolveJournalsPath } from "./config.ts";
import type { LogContext, ReadContext } from "./context.ts";
import type { JoaDb } from "./db.ts";
import { openDatabase } from "./db.ts";
import { ValidationError } from "./errors.ts";
import { sessionId } from "./ids.ts";
import { checkAndSyncIfStale } from "./sync.ts";

const AGENT_RE = /^[a-zA-Z0-9_-]+$/;
const AGENT_MAX_LEN = 64;

/** Validates an agent name: 1-64 chars, alphanumeric plus hyphens and underscores. */
export function validateAgentName(agent: string): void {
  if (agent.length === 0 || agent.length > AGENT_MAX_LEN) {
    throw new ValidationError(
      `agent name must be 1-${AGENT_MAX_LEN} characters, got ${agent.length}`,
    );
  }
  if (!AGENT_RE.test(agent)) {
    throw new ValidationError(
      `agent name must contain only alphanumeric characters, hyphens, and underscores: "${agent}"`,
    );
  }
}

export interface BootstrapOptions {
  agent?: string;
}

export interface BootstrapResult {
  config: JoaConfig;
  db: JoaDb;
  readCtx: ReadContext;
  logCtx: LogContext;
  sid: string;
}

export async function bootstrap(opts?: BootstrapOptions): Promise<BootstrapResult> {
  const config = loadConfig();
  const dbPath = resolveDbPath(config);
  mkdirSync(dirname(dbPath), { recursive: true });
  mkdirSync(resolveJournalsPath(config), { recursive: true });
  const db = await openDatabase(dbPath);
  await checkAndSyncIfStale(db, resolveJournalsPath(config));
  const sid = sessionId();
  const agent = opts?.agent ?? config.defaults.agent ?? "cli";
  validateAgentName(agent);
  const readCtx: ReadContext = { db };
  const logCtx: LogContext = {
    db,
    journalsDir: resolveJournalsPath(config),
    sessionId: sid,
    agent,
    device: getDevice(config),
    defaultTags: config.defaults.tags,
  };
  return { config, db, readCtx, logCtx, sid };
}
