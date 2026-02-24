import { describe, expect, test } from "bun:test";
import { ValidationError } from "../../src/core/errors.ts";
import { nowUtc, parseSince, todayDate } from "../../src/core/time.ts";

describe("parseSince", () => {
  test('"1d" returns timestamp 24 hours before now (within 2s tolerance)', () => {
    const result = parseSince("1d");
    const expected = Date.now() - 24 * 60 * 60 * 1000;
    const diff = Math.abs(new Date(result).getTime() - expected);
    expect(diff).toBeLessThan(2000);
  });

  test('"7d" returns 7 days before now', () => {
    const result = parseSince("7d");
    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const diff = Math.abs(new Date(result).getTime() - expected);
    expect(diff).toBeLessThan(2000);
  });

  test('"2w" returns 14 days before now', () => {
    const result = parseSince("2w");
    const expected = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const diff = Math.abs(new Date(result).getTime() - expected);
    expect(diff).toBeLessThan(2000);
  });

  test('"1m" returns 30 days before now', () => {
    const result = parseSince("1m");
    const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const diff = Math.abs(new Date(result).getTime() - expected);
    expect(diff).toBeLessThan(2000);
  });

  test('"2025-02-18" returns start of that UTC day', () => {
    expect(parseSince("2025-02-18") as string).toBe("2025-02-18T00:00:00.000Z");
  });

  test("ISO datetime passes through", () => {
    const ts = "2025-02-18T10:30:00.000Z";
    expect(parseSince(ts) as string).toBe(ts);
  });

  test("ISO datetime without milliseconds passes through", () => {
    const ts = "2025-02-18T10:30:00Z";
    expect(parseSince(ts) as string).toBe(ts);
  });

  test("arbitrary string throws ValidationError", () => {
    expect(() => parseSince("hello")).toThrow(ValidationError);
  });
});

describe("todayDate", () => {
  test("returns a string matching YYYY-MM-DD format", () => {
    expect(todayDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("nowUtc", () => {
  test("returns a valid ISO UTC string", () => {
    const ts = nowUtc();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
