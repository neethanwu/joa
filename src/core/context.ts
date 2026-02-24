import type { JoaDb } from "./db.ts";

/** Read context — minimal, for query() and status(). */
export interface ReadContext {
  readonly db: JoaDb;
}

/** Write context — extends read, adds write-path metadata. */
export interface LogContext extends ReadContext {
  readonly journalsDir: string;
  readonly sessionId: string;
  readonly agent: string | null;
  readonly device: string | null;
  readonly defaultTags: readonly string[];
}
