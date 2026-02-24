/** Base error for all joa errors. */
export class JoaError extends Error {
  override name = "JoaError";
}

/** Thrown when input validation fails. */
export class ValidationError extends JoaError {
  override name = "ValidationError";
}

/** Thrown when a thread_id is malformed. */
export class InvalidThreadId extends ValidationError {
  override name = "InvalidThreadId";
}

/** Thrown when a database operation fails. */
export class DatabaseError extends JoaError {
  override name = "DatabaseError";
}

/** Thrown when a JSONL journal write fails. */
export class JournalWriteError extends JoaError {
  override name = "JournalWriteError";
}

/** Thrown when config loading or parsing fails. */
export class ConfigError extends JoaError {
  override name = "ConfigError";
}
