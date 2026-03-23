import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../../src/config/types.ts";
import type { TestResult } from "../../../src/runner/types.ts";

const mockInvoke = vi.fn();

vi.mock("../../../src/agent/model-factory.ts", () => ({
  createChatModel: vi.fn().mockResolvedValue({
    invoke: (...args: unknown[]) => mockInvoke(...args),
  }),
}));

const { generateFailureSummary } = await import("../../../src/output/failure-summary.ts");

describe("generateFailureSummary", () => {
  const config: Config = {
    baseUrl: "http://localhost:3000",
    browser: "chromium",
    headless: true,
    sessionMode: "isolated",
    timeout: 60000,
    maxAttempts: 3,
    cacheDir: ".opencheck-cache",
    model: "claude-sonnet-4-5-20250929",
    recursionLimit: 500,
    recording: false,
    tests: [{ case: "test" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({
      content: "login failed: button not found on page",
    });
  });

  it("returns null for empty results", async () => {
    const result = await generateFailureSummary([], config);
    expect(result).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("calls the LLM with failed test details", async () => {
    const failed: TestResult[] = [
      { testCase: "check login", status: "failed", source: "ai", durationMs: 100, error: "TEST_FAILED: button not found" },
    ];

    await generateFailureSummary(failed, config);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const messages = mockInvoke.mock.calls[0]![0] as Array<{ role: string; content: string }>;
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.content).toContain("check login");
    expect(messages[1]!.content).toContain("button not found");
  });

  it("returns the LLM response content trimmed", async () => {
    mockInvoke.mockResolvedValue({ content: "  summary text  " });

    const failed: TestResult[] = [
      { testCase: "test1", status: "failed", source: "ai", durationMs: 100, error: "TEST_FAILED: err" },
    ];

    const result = await generateFailureSummary(failed, config);
    expect(result).toBe("summary text");
  });

  it("returns null when LLM call throws", async () => {
    mockInvoke.mockRejectedValue(new Error("API key missing"));

    const failed: TestResult[] = [
      { testCase: "test1", status: "failed", source: "ai", durationMs: 100, error: "err" },
    ];

    const result = await generateFailureSummary(failed, config);
    expect(result).toBeNull();
  });

  it("handles missing error field gracefully", async () => {
    const failed: TestResult[] = [
      { testCase: "test1", status: "failed", source: "ai", durationMs: 100 },
    ];

    await generateFailureSummary(failed, config);

    const messages = mockInvoke.mock.calls[0]![0] as Array<{ role: string; content: string }>;
    expect(messages[1]!.content).toContain("No error details");
  });
});
