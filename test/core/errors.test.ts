import { describe, expect, test } from "bun:test";
import {
  ConfigError,
  DatabaseError,
  InvalidThreadId,
  JoaError,
  JournalWriteError,
  ValidationError,
} from "../../src/core/errors.ts";

describe("errors", () => {
  test("instanceof checks work across the hierarchy", () => {
    const err = new InvalidThreadId("bad id");
    expect(err).toBeInstanceOf(InvalidThreadId);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toBeInstanceOf(JoaError);
    expect(err).toBeInstanceOf(Error);
  });

  test("cause is preserved and accessible", () => {
    const cause = new Error("underlying");
    const err = new JournalWriteError("write failed", { cause });
    expect(err.cause).toBe(cause);
  });

  test("name property is correct on each class", () => {
    expect(new JoaError("").name).toBe("JoaError");
    expect(new ValidationError("").name).toBe("ValidationError");
    expect(new InvalidThreadId("").name).toBe("InvalidThreadId");
    expect(new DatabaseError("").name).toBe("DatabaseError");
    expect(new JournalWriteError("").name).toBe("JournalWriteError");
    expect(new ConfigError("").name).toBe("ConfigError");
  });

  test("message is preserved", () => {
    const err = new DatabaseError("connection failed");
    expect(err.message).toBe("connection failed");
  });
});
