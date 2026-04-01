import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TestExecutor } from "../../../src/runner/test-executor.ts";
import { CacheManager } from "../../../src/cache/cache-manager.ts";
import type { AgentFactory } from "../../../src/agent/agent-factory.ts";
import type { Config } from "../../../src/config/types.ts";
import type { AgentExecutionResult } from "../../../src/agent/types.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("TestExecutor", () => {
  let tempDir: string;
  let config: Config;
  let cacheManager: CacheManager;
  let mockExecuteTest: ReturnType<typeof vi.fn<(tc: string, bu: string) => Promise<AgentExecutionResult>>>;
  let mockAgentFactory: { executeTest: typeof mockExecuteTest };
  let executor: TestExecutor;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencheck-executor-"));
    config = {
      baseUrl: "http://localhost:3000",
      browser: "chromium",
      headless: true,
      sessionMode: "isolated",
      timeout: 60000,
      maxAttempts: 3,
      cacheDir: tempDir,
      model: "claude-sonnet-4-5-20250929",
      recursionLimit: 500,
      recording: false,
      bailOnFailure: false,
    viewportSize: "1280x720",
      secrets: [],
      tests: [{ case: "check login" }],
    };
    cacheManager = new CacheManager(tempDir);
    mockExecuteTest = vi.fn();
    mockAgentFactory = { executeTest: mockExecuteTest };
    executor = new TestExecutor(
      cacheManager,
      mockAgentFactory as unknown as AgentFactory,
      config,
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns cache hit when cached steps replay successfully", async () => {
    const steps = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    ];
    await cacheManager.save("check login", "http://localhost:3000", steps);

    const executorWithReplay = new TestExecutor(
      cacheManager,
      mockAgentFactory as unknown as AgentFactory,
      config,
      vi.fn().mockResolvedValue({ success: true }),
    );

    const result = await executorWithReplay.execute("check login", "http://localhost:3000");

    expect(result.status).toBe("passed");
    expect(result.source).toBe("cache");
    expect(mockExecuteTest).not.toHaveBeenCalled();
  });

  it("falls back to AI when no cache exists", async () => {
    mockExecuteTest.mockResolvedValue({
      outcome: "passed",
      steps: [{ toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } }],
      message: "TEST_PASSED: Login works",
    });

    const result = await executor.execute("check login", "http://localhost:3000");

    expect(result.status).toBe("passed");
    expect(result.source).toBe("ai");
    expect(mockExecuteTest).toHaveBeenCalled();
  });

  it("saves cache on AI success", async () => {
    mockExecuteTest.mockResolvedValue({
      outcome: "passed",
      steps: [{ toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } }],
      message: "TEST_PASSED: Login works",
    });

    await executor.execute("check login", "http://localhost:3000");

    const cached = await cacheManager.load("check login", "http://localhost:3000");
    expect(cached).not.toBeNull();
    expect(cached?.steps).toHaveLength(1);
  });

  it("falls back to AI when cache replay fails", async () => {
    await cacheManager.save("check login", "http://localhost:3000", [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    ]);

    mockExecuteTest.mockResolvedValue({
      outcome: "passed",
      steps: [{ toolName: "browser_navigate", toolInput: { url: "http://localhost:3000/new" } }],
      message: "TEST_PASSED: Login works after change",
    });

    const executorWithFailReplay = new TestExecutor(
      cacheManager,
      mockAgentFactory as unknown as AgentFactory,
      config,
      vi.fn().mockResolvedValue({ success: false, failedStep: 0, error: "Element not found" }),
    );

    const result = await executorWithFailReplay.execute("check login", "http://localhost:3000");

    expect(result.status).toBe("passed");
    expect(result.source).toBe("ai");
  });

  it("updates cache when AI succeeds after stale cache", async () => {
    await cacheManager.save("check login", "http://localhost:3000", [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    ]);

    mockExecuteTest.mockResolvedValue({
      outcome: "passed",
      steps: [{ toolName: "browser_navigate", toolInput: { url: "http://localhost:3000/v2" } }],
      message: "TEST_PASSED: Updated",
    });

    const executorWithFailReplay = new TestExecutor(
      cacheManager,
      mockAgentFactory as unknown as AgentFactory,
      config,
      vi.fn().mockResolvedValue({ success: false, failedStep: 0, error: "Changed" }),
    );

    await executorWithFailReplay.execute("check login", "http://localhost:3000");

    const cached = await cacheManager.load("check login", "http://localhost:3000");
    expect(cached?.steps[0]?.toolInput).toEqual({ url: "http://localhost:3000/v2" });
  });

  it("deletes cache and fails when AI fails after stale cache", async () => {
    await cacheManager.save("check login", "http://localhost:3000", [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    ]);

    mockExecuteTest.mockResolvedValue({
      outcome: "failed",
      steps: [],
      message: "TEST_FAILED: Could not find login form",
    });

    const executorWithFailReplay = new TestExecutor(
      cacheManager,
      mockAgentFactory as unknown as AgentFactory,
      config,
      vi.fn().mockResolvedValue({ success: false, failedStep: 0, error: "Changed" }),
    );

    const result = await executorWithFailReplay.execute("check login", "http://localhost:3000");

    expect(result.status).toBe("failed");
    const cached = await cacheManager.load("check login", "http://localhost:3000");
    expect(cached).toBeNull();
  });

  it("returns failure after all AI attempts exhausted", async () => {
    mockExecuteTest.mockResolvedValue({
      outcome: "failed",
      steps: [],
      message: "TEST_FAILED: Cannot complete test",
    });

    const result = await executor.execute("check login", "http://localhost:3000");

    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
    expect(mockExecuteTest).toHaveBeenCalledTimes(config.maxAttempts);
  });
});
