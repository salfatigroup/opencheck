import type { CacheManager } from "../cache/cache-manager.ts";
import type { AgentFactory } from "../agent/agent-factory.ts";
import type { Config, TestCase } from "../config/types.ts";
import type { TestResult } from "./types.ts";
import type { ReplayResult } from "../cache/step-replayer.ts";
import type { CachedStep } from "../cache/types.ts";

type ReplayFn = (steps: CachedStep[]) => Promise<ReplayResult>;

class TestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Test exceeded timeout of ${timeoutMs}ms`);
    this.name = "TestTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TestTimeoutError(timeoutMs)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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

  async execute(testCase: string, baseUrl: string): Promise<TestResult> {
    const startTime = Date.now();
    const testConfig = this.config.tests.find((t) => t.case === testCase);
    const timeoutMs = testConfig?.timeout ?? this.config.timeout;

    try {
      return await withTimeout(
        this.executeInner(testCase, baseUrl, startTime),
        timeoutMs,
      );
    } catch (error) {
      if (error instanceof TestTimeoutError) {
        await this.cacheManager.delete(testCase, baseUrl);
        return buildResult(
          testCase,
          "failed",
          "ai",
          startTime,
          `TEST_FAILED: ${error.message}. The test was killed after ${timeoutMs}ms.`,
        );
      }
      throw error;
    }
  }

  private async executeInner(
    testCase: string,
    baseUrl: string,
    startTime: number,
  ): Promise<TestResult> {
    const cacheEntry = await this.cacheManager.load(testCase, baseUrl);

    if (cacheEntry && this.replayFn) {
      const replayResult = await this.replayFn(cacheEntry.steps);
      if (replayResult.success) {
        return buildResult(testCase, "passed", "cache", startTime);
      }
    }

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

      if (agentResult.passed) {
        await this.cacheManager.save(testCase, baseUrl, agentResult.steps);
        return buildResult(testCase, "passed", "ai", startTime, undefined, recordingDir);
      }

      lastError = agentResult.message;
    }

    await this.cacheManager.delete(testCase, baseUrl);
    return buildResult(testCase, "failed", "ai", startTime, lastError, recordingDir);
  }
}

function buildResult(
  testCase: string,
  status: "passed" | "failed",
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
