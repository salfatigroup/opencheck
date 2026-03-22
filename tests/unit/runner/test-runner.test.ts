import { describe, it, expect, vi, beforeEach } from "vitest";
import { TestRunner } from "../../../src/runner/test-runner.ts";
import type { Config } from "../../../src/config/types.ts";
import type { TestResult } from "../../../src/runner/types.ts";
import type { Reporter } from "../../../src/output/types.ts";

type ExecuteFn = (testCase: string, baseUrl: string) => Promise<TestResult>;

describe("TestRunner", () => {
  let config: Config;
  let mockReporter: Reporter;
  let mockExecute: ReturnType<typeof vi.fn<ExecuteFn>>;

  beforeEach(() => {
    config = {
      baseUrl: "http://localhost:3000",
      browser: "chromium",
      headless: true,
      timeout: 60000,
      maxAttempts: 3,
      cacheDir: ".opencheck-cache",
      model: "claude-sonnet-4-5-20250929",
      recursionLimit: 500,
      tests: [
        { case: "check login" },
        { case: "check dashboard" },
      ],
    };

    mockReporter = {
      onTestStart: vi.fn(),
      onTestComplete: vi.fn(),
      onRunComplete: vi.fn(),
    };

    mockExecute = vi.fn<ExecuteFn>();
  });

  it("runs all tests and returns results", async () => {
    mockExecute
      .mockResolvedValueOnce({
        testCase: "check login",
        status: "passed",
        source: "cache",
        durationMs: 100,
      })
      .mockResolvedValueOnce({
        testCase: "check dashboard",
        status: "passed",
        source: "ai",
        durationMs: 200,
      });

    const runner = new TestRunner(config, mockReporter, mockExecute);
    const runResult = await runner.run();

    expect(runResult.results).toHaveLength(2);
    expect(runResult.passed).toBe(2);
    expect(runResult.failed).toBe(0);
    expect(runResult.cached).toBe(1);
  });

  it("reports failures correctly", async () => {
    mockExecute
      .mockResolvedValueOnce({
        testCase: "check login",
        status: "passed",
        source: "ai",
        durationMs: 100,
      })
      .mockResolvedValueOnce({
        testCase: "check dashboard",
        status: "failed",
        source: "ai",
        durationMs: 200,
        error: "Dashboard not found",
      });

    const runner = new TestRunner(config, mockReporter, mockExecute);
    const runResult = await runner.run();

    expect(runResult.passed).toBe(1);
    expect(runResult.failed).toBe(1);
  });

  it("handles empty test list", async () => {
    const runner = new TestRunner(
      { ...config, tests: [] as unknown as Config["tests"] },
      mockReporter,
      mockExecute,
    );
    const runResult = await runner.run();

    expect(runResult.results).toHaveLength(0);
    expect(runResult.passed).toBe(0);
    expect(runResult.failed).toBe(0);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("calls reporter hooks during execution", async () => {
    mockExecute.mockResolvedValue({
      testCase: "check login",
      status: "passed",
      source: "ai",
      durationMs: 100,
    });

    const singleTestConfig = { ...config, tests: [{ case: "check login" }] };
    const runner = new TestRunner(singleTestConfig, mockReporter, mockExecute);
    await runner.run();

    expect(mockReporter.onTestStart).toHaveBeenCalledWith("check login");
    expect(mockReporter.onTestComplete).toHaveBeenCalled();
    expect(mockReporter.onRunComplete).toHaveBeenCalled();
  });

  it("resolves per-test baseUrl with fallback to config baseUrl", async () => {
    const configWithOverride: Config = {
      ...config,
      tests: [
        { case: "test with override", baseUrl: "http://localhost:4000" },
        { case: "test without override" },
      ],
    };

    mockExecute.mockResolvedValue({
      testCase: "",
      status: "passed",
      source: "ai",
      durationMs: 50,
    });

    const runner = new TestRunner(configWithOverride, mockReporter, mockExecute);
    await runner.run();

    expect(mockExecute).toHaveBeenCalledWith(
      "test with override",
      "http://localhost:4000",
    );
    expect(mockExecute).toHaveBeenCalledWith(
      "test without override",
      "http://localhost:3000",
    );
  });

  it("calculates total duration", async () => {
    mockExecute.mockResolvedValue({
      testCase: "check login",
      status: "passed",
      source: "ai",
      durationMs: 100,
    });

    const runner = new TestRunner(
      { ...config, tests: [{ case: "check login" }] },
      mockReporter,
      mockExecute,
    );
    const runResult = await runner.run();

    expect(runResult.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("catches thrown errors and marks test as failed instead of crashing", async () => {
    mockExecute
      .mockRejectedValueOnce(new Error("MCP server crashed"))
      .mockResolvedValueOnce({
        testCase: "check dashboard",
        status: "passed",
        source: "ai",
        durationMs: 200,
      });

    const runner = new TestRunner(config, mockReporter, mockExecute);
    const runResult = await runner.run();

    expect(runResult.results).toHaveLength(2);
    expect(runResult.failed).toBe(1);
    expect(runResult.passed).toBe(1);
    expect(runResult.results[0]?.status).toBe("failed");
    expect(runResult.results[0]?.error).toContain("MCP server crashed");
    expect(runResult.results[1]?.status).toBe("passed");
  });

  it("continues running subsequent tests after one throws an error", async () => {
    mockExecute
      .mockRejectedValueOnce(new Error("Crash"))
      .mockResolvedValueOnce({
        testCase: "check dashboard",
        status: "passed",
        source: "ai",
        durationMs: 100,
      });

    const runner = new TestRunner(config, mockReporter, mockExecute);
    await runner.run();

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockReporter.onTestComplete).toHaveBeenCalledTimes(2);
  });
});
