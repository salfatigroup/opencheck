import type { TestStatus, TestSource } from "../runner/types.ts";
import type { Reporter, ReportData } from "./types.ts";
import type { SecretMasker } from "./secret-masker.ts";

/**
 * Console reporter that outputs test progress and summary to stdout.
 * Formats output for CI/CD readability with status prefixes and timing.
 * Optionally masks secret values in all output.
 */
export class ConsoleReporter implements Reporter {
  private readonly masker?: SecretMasker;

  constructor(masker?: SecretMasker) {
    this.masker = masker;
  }

  /** Apply secret masking if a masker is configured */
  private mask(text: string): string {
    return this.masker ? this.masker.mask(text) : text;
  }

  /** Called when a test case starts executing */
  onTestStart(testCase: string): void {
    console.log(this.mask(`  [RUNNING] ${testCase}`));
  }

  /** Called when a test case completes */
  onTestComplete(
    testCase: string,
    status: TestStatus,
    source: TestSource,
    durationMs: number,
    error?: string,
  ): void {
    const prefix = status === "skipped" ? "  [SKIP]" : status === "passed" ? "  [PASS]" : "  [FAIL]";
    const duration = formatDuration(durationMs);
    console.log(this.mask(`${prefix} ${testCase} (${source}, ${duration})`));

    if (status === "failed" && error) {
      for (const line of error.split("\n")) {
        console.log(this.mask(`         ${line}`));
      }
    }
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
    console.log(`  Skipped: ${data.skipped}`);
    console.log(`  Cached:  ${data.cached}`);
    console.log(`  Time:    ${formatDuration(data.totalDurationMs)}`);
    console.log("━".repeat(50));

    if (data.failed > 0) {
      console.log("");
      console.log("  Failed tests:");
      for (const result of data.results) {
        if (result.status === "failed") {
          console.log(this.mask(`    ✗ ${result.testCase}`));
          if (result.error) {
            for (const line of result.error.split("\n")) {
              console.log(this.mask(`      ${line}`));
            }
          }
        }
      }
      console.log("");
      console.log("  Troubleshooting tips:");
      console.log("    • If a test hit the recursion limit, increase 'recursionLimit' in your config or break the test into smaller checks.");
      console.log("    • If a test failed with a network error, verify the target URL is reachable from your CI environment.");
      console.log("    • If a test failed with an auth error, verify your API key is configured correctly.");
      console.log("    • Run with a single test case to isolate failures: opencheck -c <config-with-one-test.yaml>");
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
      console.log("    bunx playwright show-trace .opencheck-recordings/<test>/trace.zip");
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
