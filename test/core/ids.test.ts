import { describe, expect, test } from "bun:test";
import {
  entryId,
  isEntryId,
  isSessionId,
  isThreadId,
  sessionId,
  threadId,
} from "../../src/core/ids.ts";

describe("ids", () => {
  test("entryId() starts with e_ and has correct length", () => {
    const id = entryId();
    expect(id.startsWith("e_")).toBe(true);
    expect(id.length).toBe(28);
  });

  test("threadId() starts with th_ and has correct length", () => {
    const id = threadId();
    expect(id.startsWith("th_")).toBe(true);
    expect(id.length).toBe(29);
  });

  test("sessionId() starts with s_ and has correct length", () => {
    const id = sessionId();
    expect(id.startsWith("s_")).toBe(true);
    expect(id.length).toBe(28);
  });

  test("rapid successive calls produce lexicographically sorted IDs", () => {
    const ids = Array.from({ length: 100 }, () => entryId());
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  test("isEntryId correctly identifies entry IDs", () => {
    expect(isEntryId(entryId())).toBe(true);
    expect(isEntryId("e_01JMKA")).toBe(false);
    expect(isEntryId("th_01JMKA0001000000000000000")).toBe(false);
  });

  test("isThreadId correctly identifies thread IDs", () => {
    expect(isThreadId(threadId())).toBe(true);
    expect(isThreadId("e_01JMKA0001000000000000000")).toBe(false);
  });

  test("isSessionId correctly identifies session IDs", () => {
    expect(isSessionId(sessionId())).toBe(true);
    expect(isSessionId("th_01JMKA0001000000000000000")).toBe(false);
  });

  test("sessionId() returns a different value on each call", () => {
    const a = sessionId();
    const b = sessionId();
    expect(a).not.toBe(b);
  });
});
