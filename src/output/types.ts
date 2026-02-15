import type { RunResult, TestStatus, TestSource } from "../runner/types.ts";

/** Data passed to the reporter for rendering */
export type ReportData = RunResult;

/** Interface for output reporting */
export interface Reporter {
  onTestStart(testCase: string): void;
  onTestComplete(testCase: string, status: TestStatus, source: TestSource, durationMs: number): void;
  onRunComplete(data: ReportData): void;
}
