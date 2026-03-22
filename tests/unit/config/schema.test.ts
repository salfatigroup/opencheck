import { describe, it, expect } from "vitest";
import { ConfigSchema, TestCaseSchema } from "../../../src/config/schema.ts";

describe("TestCaseSchema", () => {
  it("validates a minimal test case with only 'case' field", () => {
    const result = TestCaseSchema.safeParse({ case: "check login is working" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.case).toBe("check login is working");
    }
  });

  it("validates a test case with optional overrides", () => {
    const result = TestCaseSchema.safeParse({
      case: "check login",
      baseUrl: "http://localhost:3000",
      timeout: 30000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe("http://localhost:3000");
      expect(result.data.timeout).toBe(30000);
    }
  });

  it("rejects empty case description", () => {
    const result = TestCaseSchema.safeParse({ case: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid baseUrl", () => {
    const result = TestCaseSchema.safeParse({
      case: "test",
      baseUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative timeout", () => {
    const result = TestCaseSchema.safeParse({
      case: "test",
      timeout: -1000,
    });
    expect(result.success).toBe(false);
  });
});

describe("ConfigSchema", () => {
  it("validates a full valid config", () => {
    const result = ConfigSchema.safeParse({
      baseUrl: "http://localhost:3000",
      browser: "chromium",
      headless: true,
      timeout: 60000,
      maxAttempts: 3,
      cacheDir: ".opencheck-cache",
      model: "claude-sonnet-4-5-20250929",
      tests: [{ case: "check login is working" }],
    });
    expect(result.success).toBe(true);
  });

  it("applies default values for optional fields", () => {
    const result = ConfigSchema.safeParse({
      tests: [{ case: "check login" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.browser).toBe("chromium");
      expect(result.data.headless).toBe(true);
      expect(result.data.timeout).toBe(60000);
      expect(result.data.maxAttempts).toBe(3);
      expect(result.data.cacheDir).toBe(".opencheck-cache");
      expect(result.data.model).toBe("claude-sonnet-4-5-20250929");
      expect(result.data.recursionLimit).toBe(500);
    }
  });

  it("rejects config with empty tests array", () => {
    const result = ConfigSchema.safeParse({ tests: [] });
    expect(result.success).toBe(false);
  });

  it("rejects config without tests field", () => {
    const result = ConfigSchema.safeParse({ baseUrl: "http://localhost:3000" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid browser value", () => {
    const result = ConfigSchema.safeParse({
      browser: "opera",
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid baseUrl at top level", () => {
    const result = ConfigSchema.safeParse({
      baseUrl: "not-a-valid-url",
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects maxAttempts exceeding 10", () => {
    const result = ConfigSchema.safeParse({
      maxAttempts: 15,
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero maxAttempts", () => {
    const result = ConfigSchema.safeParse({
      maxAttempts: 0,
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid browser variants", () => {
    for (const browser of ["chromium", "firefox", "webkit"]) {
      const result = ConfigSchema.safeParse({
        browser,
        tests: [{ case: "test" }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts modelProvider as an optional string", () => {
    const result = ConfigSchema.safeParse({
      modelProvider: "bedrock",
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modelProvider).toBe("bedrock");
    }
  });

  it("defaults modelProvider to undefined when omitted", () => {
    const result = ConfigSchema.safeParse({
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modelProvider).toBeUndefined();
    }
  });

  it("accepts any string as modelProvider value", () => {
    for (const provider of ["anthropic", "google-vertexai", "openai", "custom-provider"]) {
      const result = ConfigSchema.safeParse({
        modelProvider: provider,
        tests: [{ case: "test" }],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelProvider).toBe(provider);
      }
    }
  });

  it("defaults recording to false when omitted", () => {
    const result = ConfigSchema.safeParse({
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recording).toBe(false);
    }
  });

  it("accepts recording set to true", () => {
    const result = ConfigSchema.safeParse({
      recording: true,
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recording).toBe(true);
    }
  });

  it("defaults recursionLimit to 500 when omitted", () => {
    const result = ConfigSchema.safeParse({
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recursionLimit).toBe(500);
    }
  });

  it("accepts a custom recursionLimit value", () => {
    const result = ConfigSchema.safeParse({
      recursionLimit: 1000,
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recursionLimit).toBe(1000);
    }
  });

  it("rejects zero recursionLimit", () => {
    const result = ConfigSchema.safeParse({
      recursionLimit: 0,
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative recursionLimit", () => {
    const result = ConfigSchema.safeParse({
      recursionLimit: -10,
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer recursionLimit", () => {
    const result = ConfigSchema.safeParse({
      recursionLimit: 100.5,
      tests: [{ case: "test" }],
    });
    expect(result.success).toBe(false);
  });
});
