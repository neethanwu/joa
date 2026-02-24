// Error classes — exported so callers can catch by type
export {
  JoaError,
  ValidationError,
  InvalidThreadId,
  DatabaseError,
  JournalWriteError,
  ConfigError,
} from "./errors.ts";

// Data types
export type { Entry, EntryInput } from "./entry.ts";
export type { LogInput, LogOutput, LogContext, ReadContext } from "./log.ts";
export type { QueryInput, QueryOutput } from "./query.ts";
export type { StatusOutput } from "./status.ts";
export type { JoaConfig, PresetConfig, PresetName } from "./config.ts";
export type { ISOTimestamp } from "./time.ts";
export type { JoaDb, QueryParams, ThreadSummaryRow } from "./db.ts";

// Operations
export { log } from "./log.ts";
export { query } from "./query.ts";
export { status } from "./status.ts";

// Storage lifecycle
export { openDatabase } from "./db.ts";
export { checkAndSyncIfStale, rebuildIndex } from "./sync.ts";

// Config
export {
  loadConfig,
  defaultConfig,
  getDevice,
  resolveDbPath,
  resolveJournalsPath,
} from "./config.ts";

// IDs (needed by MCP session management in 1B)
export { sessionId, entryId, threadId } from "./ids.ts";
