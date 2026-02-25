import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { JoaConfig } from "./config.ts";
import { getDevice, loadConfig, resolveDbPath, resolveJournalsPath } from "./config.ts";
import type { LogContext, ReadContext } from "./context.ts";
import type { JoaDb } from "./db.ts";
import { openDatabase } from "./db.ts";
import { sessionId } from "./ids.ts";
import { checkAndSyncIfStale } from "./sync.ts";

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
  const db = openDatabase(dbPath);
  await checkAndSyncIfStale(db, resolveJournalsPath(config));
  const sid = sessionId();
  const readCtx: ReadContext = { db };
  const logCtx: LogContext = {
    db,
    journalsDir: resolveJournalsPath(config),
    sessionId: sid,
    agent: opts?.agent ?? config.defaults.agent ?? "cli",
    device: getDevice(config),
    defaultTags: config.defaults.tags,
  };
  return { config, db, readCtx, logCtx, sid };
}
