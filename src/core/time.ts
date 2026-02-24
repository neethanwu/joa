/** Branded type for validated ISO 8601 UTC timestamps. */
export type ISOTimestamp = string & { readonly __brand: "ISOTimestamp" };

const RELATIVE_RE = /^(\d+)([dwm])$/;

/**
 * Parses a time string into an ISO 8601 UTC timestamp.
 * Accepts: relative ("1d", "7d", "2w", "1m") or ISO date/datetime strings.
 */
export function parseSince(since: string): ISOTimestamp {
  const match = since.match(RELATIVE_RE);
  if (match) {
    const amount = Number.parseInt(match[1] ?? "0", 10);
    const unit = match[2] ?? "d";
    const now = Date.now();
    let ms: number;
    switch (unit) {
      case "d":
        ms = amount * 24 * 60 * 60 * 1000;
        break;
      case "w":
        ms = amount * 7 * 24 * 60 * 60 * 1000;
        break;
      case "m":
        ms = amount * 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        ms = 0;
    }
    return new Date(now - ms).toISOString() as ISOTimestamp;
  }

  // ISO date "YYYY-MM-DD" → start of that UTC day
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return `${since}T00:00:00.000Z` as ISOTimestamp;
  }

  // ISO datetime — pass through
  return since as ISOTimestamp;
}

/** Returns today's date as "YYYY-MM-DD" using local system time. */
export function todayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns the current UTC timestamp as ISOTimestamp. */
export function nowUtc(): ISOTimestamp {
  return new Date().toISOString() as ISOTimestamp;
}
