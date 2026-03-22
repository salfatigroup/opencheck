import type { TestStatus, TestSource } from "../runner/types.ts";
import type { Reporter, ReportData } from "./types.ts";

/**
 * Console reporter that outputs test progress and summary to stdout.
 * Formats output for CI/CD readability with status prefixes and timing.
 */
export class ConsoleReporter implements Reporter {
  /** Called when a test case starts executing */
  onTestStart(testCase: string): void {
    console.log(`  [RUNNING] ${testCase}`);
  }

  /** Called when a test case completes */
  onTestComplete(
    testCase: string,
    status: TestStatus,
    source: TestSource,
    durationMs: number,
  ): void {
    const prefix = status === "passed" ? "  [PASS]" : "  [FAIL]";
    const duration = formatDuration(durationMs);
    console.log(`${prefix} ${testCase} (${source}, ${duration})`);
  }

  /** Called after all tests complete; prints summary table */
  onRunComplete(data: ReportData): void {
    console.log("");
    console.log("━".repeat(50));
    console.log("  Test Results Summary");
    console.log("━".repeat(50));
    console.log(`  Total:   ${data.results.length}`);
    console.log(`  Passed:  ${data.passed}`);
    console.log(`  Failed:  ${data.failed}`);
    console.log(`  Cached:  ${data.cached}`);
    console.log(`  Time:    ${formatDuration(data.totalDurationMs)}`);
    console.log("━".repeat(50));

    if (data.failed > 0) {
      console.log("");
      console.log("  Failed tests:");
      for (const result of data.results) {
        if (result.status === "failed") {
          console.log(`    - ${result.testCase}`);
          if (result.error) {
            console.log(`      ${result.error}`);
          }
        }
      }
    }

    const recorded = data.results.filter((r) => r.recordingDir);
    if (recorded.length > 0) {
      console.log("");
      console.log("━".repeat(50));
      console.log("  Recordings");
      console.log("━".repeat(50));
      for (const result of recorded) {
        const icon = result.status === "passed" ? "✓" : "✗";
        console.log(`  ${icon} ${result.testCase}`);
        console.log(`    Trace: ${result.recordingDir}/trace.zip`);
        console.log(`    Video: ${result.recordingDir}/video.webm`);
      }
      console.log("");
      console.log("  View traces:");
      console.log("    npx playwright show-trace .opencheck-recordings/<test>/trace.zip");
      console.log("    or upload to: https://trace.playwright.dev");
    }
  }
}

/** Format milliseconds as a human-readable duration string */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}
