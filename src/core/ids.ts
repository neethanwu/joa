import { monotonicFactory } from "ulidx";

const mono = monotonicFactory();

/** Generate a new entry ID (e_<ulid>). */
export function entryId(): string {
  return `e_${mono()}`;
}

/** Generate a new thread ID (th_<ulid>). */
export function threadId(): string {
  return `th_${mono()}`;
}

/** Generate a new session ID (s_<ulid>). Call once at process start; pass through LogContext. */
export function sessionId(): string {
  return `s_${mono()}`;
}

/** Check if a string is a valid entry ID. */
export function isEntryId(id: string): boolean {
  return id.startsWith("e_") && id.length === 28;
}

/** Check if a string is a valid thread ID. */
export function isThreadId(id: string): boolean {
  return id.startsWith("th_") && id.length === 29;
}

/** Check if a string is a valid session ID. */
export function isSessionId(id: string): boolean {
  return id.startsWith("s_") && id.length === 28;
}
