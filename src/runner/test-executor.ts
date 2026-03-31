import type { CacheManager } from "../cache/cache-manager.ts";
import type { AgentFactory } from "../agent/agent-factory.ts";
import type { Config } from "../config/types.ts";
import type { TestResult } from "./types.ts";
import type { ReplayResult } from "../cache/step-replayer.ts";
import type { CachedStep } from "../cache/types.ts";

/** Function that replays cached steps; injectable for testing */
type ReplayFn = (steps: CachedStep[]) => Promise<ReplayResult>;

/**
 * Executes a single test case following the cache-first-then-AI strategy:
 * 1. Try replaying from cache
 * 2. On cache miss/fail, invoke AI agent
 * 3. Save new steps on AI success, delete stale cache on AI failure
 */
export class TestExecutor {
  private readonly cacheManager: CacheManager;
  private readonly agentFactory: AgentFactory;
  private readonly config: Config;
  private readonly replayFn: ReplayFn | null;

  constructor(
    cacheManager: CacheManager,
    agentFactory: AgentFactory,
    config: Config,
    replayFn?: ReplayFn,
  ) {
    this.cacheManager = cacheManager;
    this.agentFactory = agentFactory;
    this.config = config;
    this.replayFn = replayFn ?? null;
  }

  /** Execute a single test case */
  async execute(testCase: string, baseUrl: string): Promise<TestResult> {
    const startTime = Date.now();

    // Phase 1: Try cache replay
    const cacheEntry = await this.cacheManager.load(testCase, baseUrl);
    if (cacheEntry && this.replayFn) {
      const replayResult = await this.replayFn(cacheEntry.steps);
      if (replayResult.success) {
        return buildResult(testCase, "passed", "cache", startTime);
      }
      // Cache stale — fall through to AI
    }

    // Phase 2: AI agent execution (with retries)
    return this.executeWithAgent(testCase, baseUrl, startTime);
  }

  private async executeWithAgent(
    testCase: string,
    baseUrl: string,
    startTime: number,
  ): Promise<TestResult> {
    let lastError = "";

    let recordingDir: string | undefined;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      const agentResult = await this.agentFactory.executeTest(testCase, baseUrl);
      recordingDir = agentResult.recordingDir;

      if (agentResult.outcome === "skipped") {
        return buildResult(testCase, "skipped", "ai", startTime, undefined, recordingDir);
      }

      if (agentResult.outcome === "passed") {
        await this.cacheManager.save(testCase, baseUrl, agentResult.steps);
        return buildResult(testCase, "passed", "ai", startTime, undefined, recordingDir);
      }

      lastError = agentResult.message;
    }

    // All attempts exhausted — delete stale cache and fail
    await this.cacheManager.delete(testCase, baseUrl);
    return buildResult(testCase, "failed", "ai", startTime, lastError, recordingDir);
  }
}

function buildResult(
  testCase: string,
  status: "passed" | "failed" | "skipped",
  source: "cache" | "ai",
  startTime: number,
  error?: string,
  recordingDir?: string,
): TestResult {
  return {
    testCase,
    status,
    source,
    durationMs: Date.now() - startTime,
    ...(error ? { error } : {}),
    ...(recordingDir ? { recordingDir } : {}),
  };
}
