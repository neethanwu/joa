import type { Entry } from "../../src/core/entry.ts";
import { entryId, sessionId } from "../../src/core/ids.ts";

export function makeEntry(overrides?: Partial<Entry>): Entry {
  return {
    id: entryId(),
    timestamp: new Date().toISOString(),
    category: "decision",
    summary: "Test summary",
    thread_id: null,
    session_id: sessionId(),
    agent: "test-agent",
    device: "test-device",
    resources: [],
    tags: [],
    detail: {},
    annotations: {},
    ...overrides,
  };
}
