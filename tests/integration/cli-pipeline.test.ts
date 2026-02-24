import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CacheManager } from "../../src/cache/cache-manager.ts";
import { TestExecutor } from "../../src/runner/test-executor.ts";
import { TestRunner } from "../../src/runner/test-runner.ts";
import { ConsoleReporter } from "../../src/output/reporter.ts";
import type { AgentFactory } from "../../src/agent/agent-factory.ts";
import type { Config } from "../../src/config/types.ts";
import type { AgentExecutionResult } from "../../src/agent/types.ts";

describe("CLI Pipeline (integration)", () => {
  let tempDir: string;
  let config: Config;
  let cacheManager: CacheManager;
  let reporter: ConsoleReporter;
  let mockExecuteTest: ReturnType<typeof vi.fn<(tc: string, bu: string) => Promise<AgentExecutionResult>>>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencheck-pipeline-"));
    config = {
      baseUrl: "http://localhost:3000",
      browser: "chromium",
      headless: true,
      timeout: 60000,
      maxAttempts: 2,
      cacheDir: tempDir,
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      tests: [
        { case: "check login" },
        { case: "check dashboard" },
      ],
    };
    cacheManager = new CacheManager(tempDir);
    reporter = new ConsoleReporter();
    mockExecuteTest = vi.fn();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("runs full pipeline: AI pass → cache saved → exit 0", async () => {
    mockExecuteTest.mockResolvedValue({
      passed: true,
      steps: [{ toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } }],
      message: "TEST_PASSED: works",
    });

    const agentFactory = { executeTest: mockExecuteTest } as unknown as AgentFactory;
    const executor = new TestExecutor(cacheManager, agentFactory, config);
    const executeFn = (tc: string, bu: string) => executor.execute(tc, bu);
    const runner = new TestRunner(config, reporter, executeFn);

    const result = await runner.run();

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);

    // Verify cache was persisted for both tests
    const cached1 = await cacheManager.load("check login", "http://localhost:3000");
    const cached2 = await cacheManager.load("check dashboard", "http://localhost:3000");
    expect(cached1).not.toBeNull();
    expect(cached2).not.toBeNull();
  });

  it("uses cached steps on second run without invoking AI", async () => {
    // Pre-populate cache
    await cacheManager.save("check login", "http://localhost:3000", [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    ]);
    await cacheManager.save("check dashboard", "http://localhost:3000", [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000/dash" } },
    ]);

    const agentFactory = { executeTest: mockExecuteTest } as unknown as AgentFactory;
    const mockReplay = vi.fn().mockResolvedValue({ success: true });
    const executor = new TestExecutor(cacheManager, agentFactory, config, mockReplay);
    const executeFn = (tc: string, bu: string) => executor.execute(tc, bu);
    const runner = new TestRunner(config, reporter, executeFn);

    const result = await runner.run();

    expect(result.passed).toBe(2);
    expect(result.cached).toBe(2);
    expect(mockExecuteTest).not.toHaveBeenCalled();
  });

  it("handles mixed results: some pass, some fail", async () => {
    mockExecuteTest
      .mockResolvedValueOnce({
        passed: true,
        steps: [{ toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } }],
        message: "TEST_PASSED: login ok",
      })
      // First attempt for dashboard fails
      .mockResolvedValueOnce({
        passed: false,
        steps: [],
        message: "TEST_FAILED: dashboard broken",
      })
      // Second attempt also fails (maxAttempts=2)
      .mockResolvedValueOnce({
        passed: false,
        steps: [],
        message: "TEST_FAILED: still broken",
      });

    const agentFactory = { executeTest: mockExecuteTest } as unknown as AgentFactory;
    const executor = new TestExecutor(cacheManager, agentFactory, config);
    const executeFn = (tc: string, bu: string) => executor.execute(tc, bu);
    const runner = new TestRunner(config, reporter, executeFn);

    const result = await runner.run();

    expect(result.passed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]?.status).toBe("passed");
    expect(result.results[1]?.status).toBe("failed");
  });

  it("invokes all reporter hooks during execution", async () => {
    const spyStart = vi.spyOn(reporter, "onTestStart");
    const spyComplete = vi.spyOn(reporter, "onTestComplete");
    const spyRunComplete = vi.spyOn(reporter, "onRunComplete");

    mockExecuteTest.mockResolvedValue({
      passed: true,
      steps: [],
      message: "TEST_PASSED: ok",
    });

    const agentFactory = { executeTest: mockExecuteTest } as unknown as AgentFactory;
    const executor = new TestExecutor(cacheManager, agentFactory, config);
    const executeFn = (tc: string, bu: string) => executor.execute(tc, bu);
    const runner = new TestRunner(config, reporter, executeFn);

    await runner.run();

    expect(spyStart).toHaveBeenCalledTimes(2);
    expect(spyStart).toHaveBeenCalledWith("check login");
    expect(spyStart).toHaveBeenCalledWith("check dashboard");
    expect(spyComplete).toHaveBeenCalledTimes(2);
    expect(spyRunComplete).toHaveBeenCalledTimes(1);
  });
});
