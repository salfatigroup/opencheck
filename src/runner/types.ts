/** Status of a completed test */
export type TestStatus = "passed" | "failed";

/** Source of the test result */
export type TestSource = "cache" | "ai";

/** Result of executing a single test case */
export interface TestResult {
  testCase: string;
  status: TestStatus;
  source: TestSource;
  durationMs: number;
  error?: string;
  recordingDir?: string;
}

/** Overall run result from the test runner */
export interface RunResult {
  results: TestResult[];
  totalDurationMs: number;
  passed: number;
  failed: number;
  cached: number;
}
