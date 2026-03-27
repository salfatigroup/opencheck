import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { expandEnvVars } from "../../../src/config/env.ts";

describe("expandEnvVars", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("expands a single env var in a string", () => {
    process.env.MY_URL = "http://example.com";
    expect(expandEnvVars("${MY_URL}")).toBe("http://example.com");
  });

  it("expands multiple env vars in one string", () => {
    process.env.HOST = "localhost";
    process.env.PORT = "3000";
    expect(expandEnvVars("http://${HOST}:${PORT}")).toBe("http://localhost:3000");
  });

  it("leaves unset env vars as-is", () => {
    delete process.env.MISSING_VAR;
    expect(expandEnvVars("${MISSING_VAR}")).toBe("${MISSING_VAR}");
  });

  it("handles mixed set and unset vars", () => {
    process.env.KNOWN = "value";
    delete process.env.UNKNOWN;
    expect(expandEnvVars("${KNOWN} and ${UNKNOWN}")).toBe("value and ${UNKNOWN}");
  });

  it("passes through non-string primitives unchanged", () => {
    expect(expandEnvVars(42)).toBe(42);
    expect(expandEnvVars(true)).toBe(true);
    expect(expandEnvVars(null)).toBe(null);
    expect(expandEnvVars(undefined)).toBe(undefined);
  });

  it("recursively expands strings in arrays", () => {
    process.env.VAL = "expanded";
    expect(expandEnvVars(["${VAL}", 123, true])).toEqual(["expanded", 123, true]);
  });

  it("recursively expands strings in objects", () => {
    process.env.BASE = "http://example.com";
    const input = { baseUrl: "${BASE}", timeout: 5000 };
    expect(expandEnvVars(input)).toEqual({ baseUrl: "http://example.com", timeout: 5000 });
  });

  it("recursively expands nested objects and arrays", () => {
    process.env.CASE_NAME = "login test";
    const input = {
      tests: [{ case: "${CASE_NAME}", timeout: 3000 }],
    };
    expect(expandEnvVars(input)).toEqual({
      tests: [{ case: "login test", timeout: 3000 }],
    });
  });

  it("does not expand $VAR without braces", () => {
    process.env.BARE = "value";
    expect(expandEnvVars("$BARE")).toBe("$BARE");
  });

  it("handles empty string env var values", () => {
    process.env.EMPTY = "";
    expect(expandEnvVars("prefix-${EMPTY}-suffix")).toBe("prefix--suffix");
  });

  it("handles env var names with underscores and digits", () => {
    process.env.MY_VAR_2 = "works";
    expect(expandEnvVars("${MY_VAR_2}")).toBe("works");
  });
});
