import type { RunResult, TestStatus, TestSource } from "../runner/types.ts";

/** Data passed to the reporter for rendering */
export type ReportData = RunResult;

/** Interface for output reporting */
export interface Reporter {
  onTestStart(displayName: string): void;
  onTestComplete(displayName: string, status: TestStatus, source: TestSource, durationMs: number, message?: string, error?: string): void;
  onRunComplete(data: ReportData): void;
}
