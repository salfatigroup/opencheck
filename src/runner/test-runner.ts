import type { Config } from "../config/types.ts";
import type { Reporter } from "../output/types.ts";
import type { TestResult, RunResult } from "./types.ts";

/** Function signature for executing a single test case */
type ExecuteFn = (testCase: string, baseUrl: string) => Promise<TestResult>;

/**
 * Orchestrates the sequential execution of all test cases.
 * Delegates individual test execution to the provided execute function.
 */
export class TestRunner {
  private readonly config: Config;
  private readonly reporter: Reporter;
  private readonly executeFn: ExecuteFn;

  constructor(config: Config, reporter: Reporter, executeFn: ExecuteFn) {
    this.config = config;
    this.reporter = reporter;
    this.executeFn = executeFn;
  }

  /** Run all test cases sequentially and return aggregate results */
  async run(): Promise<RunResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    for (const test of this.config.tests) {
      const baseUrl = test.baseUrl ?? this.config.baseUrl ?? "";
      this.reporter.onTestStart(test.case);

      let result: TestResult;
      try {
        result = await this.executeFn(test.case, baseUrl);
      } catch (error) {
        const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
        const errorMessage = error instanceof Error ? error.message : String(error);
        result = {
          testCase: test.case,
          status: "failed",
          source: "ai",
          durationMs: Date.now() - startTime,
          error: `Unexpected error (${errorName}): ${errorMessage}`,
        };
      }
      results.push(result);

      this.reporter.onTestComplete(
        result.testCase,
        result.status,
        result.source,
        result.durationMs,
        result.error,
      );

      if (this.config.bailOnFailure && result.status === "failed") {
        break;
      }
    }

    const runResult = aggregateResults(results, Date.now() - startTime);
    this.reporter.onRunComplete(runResult);
    return runResult;
  }
}

function aggregateResults(results: TestResult[], totalDurationMs: number): RunResult {
  return {
    results,
    totalDurationMs,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    cached: results.filter((r) => r.source === "cache" && r.status === "passed").length,
  };
}
