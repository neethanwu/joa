import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  type JoaConfig,
  type JoaDb,
  type LogContext,
  type ReadContext,
  checkAndSyncIfStale,
  getDevice,
  loadConfig,
  openDatabase,
  resolveDbPath,
  resolveJournalsPath,
  sessionId,
} from "../core/index.ts";

export interface BootstrapResult {
  config: JoaConfig;
  db: JoaDb;
  readCtx: ReadContext;
  logCtx: LogContext;
  sid: string;
}

export async function bootstrap(): Promise<BootstrapResult> {
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
    agent: config.defaults.agent ?? "cli",
    device: getDevice(config),
    defaultTags: config.defaults.tags,
  };
  return { config, db, readCtx, logCtx, sid };
}
