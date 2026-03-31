import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsoleReporter } from "../../../src/output/reporter.ts";
import { SecretMasker } from "../../../src/output/secret-masker.ts";
import type { ReportData } from "../../../src/output/types.ts";

describe("ConsoleReporter", () => {
  let reporter: ConsoleReporter;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    reporter = new ConsoleReporter();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("logs test start with RUNNING prefix", () => {
    reporter.onTestStart("check login");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[RUNNING]"),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("check login"),
    );
  });

  it("logs test completion with PASS for passed tests", () => {
    reporter.onTestComplete("check login", "passed", "cache", 150);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("PASS"),
    );
  });

  it("logs test completion with FAIL for failed tests", () => {
    reporter.onTestComplete("check login", "failed", "ai", 300);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("FAIL"),
    );
  });

  it("includes source in completion message", () => {
    reporter.onTestComplete("check login", "passed", "cache", 100);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("cache"),
    );
  });

  it("prints summary with pass/fail/cached counts", () => {
    const data: ReportData = {
      results: [
        { testCase: "test1", displayName: "test1", status: "passed", source: "cache", durationMs: 100 },
        { testCase: "test2", displayName: "test2", status: "passed", source: "ai", durationMs: 200 },
        { testCase: "test3", displayName: "test3", status: "failed", source: "ai", durationMs: 300, error: "err" },
      ],
      totalDurationMs: 600,
      passed: 2,
      failed: 1,
      skipped: 0,
      cached: 1,
    };

    reporter.onRunComplete(data);

    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allOutput).toContain("2");  // passed count
    expect(allOutput).toContain("1");  // failed count
  });

  it("includes total duration in summary", () => {
    const data: ReportData = {
      results: [],
      totalDurationMs: 1500,
      passed: 0,
      failed: 0,
      skipped: 0,
      cached: 0,
    };

    reporter.onRunComplete(data);

    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allOutput).toContain("1.5");  // 1500ms = 1.5s
  });

  it("displays error details inline when a test fails", () => {
    reporter.onTestComplete("check login", "failed", "ai", 300, "TEST_FAILED: Login button not found");
    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allOutput).toContain("FAIL");
    expect(allOutput).toContain("Login button not found");
  });

  it("displays multi-line error details inline", () => {
    const multiLineError = "TEST_FAILED: Agent exceeded the recursion limit.\n  Suggestion: Increase recursionLimit.";
    reporter.onTestComplete("check login", "failed", "ai", 300, multiLineError);
    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allOutput).toContain("recursion limit");
    expect(allOutput).toContain("Suggestion");
  });

  it("does not display error details for passing tests", () => {
    const callsBefore = consoleSpy.mock.calls.length;
    reporter.onTestComplete("check login", "passed", "cache", 150);
    const newCalls = consoleSpy.mock.calls.slice(callsBefore);
    expect(newCalls).toHaveLength(1);
    expect(String(newCalls[0])).toContain("PASS");
  });

  it("shows troubleshooting tips when tests fail", () => {
    const data: ReportData = {
      results: [
        { testCase: "test1", displayName: "test1", status: "failed", source: "ai", durationMs: 300, error: "some error" },
      ],
      totalDurationMs: 300,
      passed: 0,
      failed: 1,
      skipped: 0,
      cached: 0,
    };

    reporter.onRunComplete(data);

    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allOutput).toContain("Troubleshooting tips");
    expect(allOutput).toContain("recursionLimit");
  });

  it("shows error details in summary for failed tests", () => {
    const data: ReportData = {
      results: [
        { testCase: "test1", displayName: "test1", status: "failed", source: "ai", durationMs: 300, error: "TEST_FAILED: Element not found\n  Suggestion: Check selectors." },
      ],
      totalDurationMs: 300,
      passed: 0,
      failed: 1,
      skipped: 0,
      cached: 0,
    };

    reporter.onRunComplete(data);

    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allOutput).toContain("Element not found");
    expect(allOutput).toContain("Check selectors");
  });
});

describe("ConsoleReporter with SecretMasker", () => {
  let maskedReporter: ConsoleReporter;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const masker = new SecretMasker(["s3cret-password"]);
    maskedReporter = new ConsoleReporter(masker);
  });

  it("masks secrets in onTestStart output", () => {
    maskedReporter.onTestStart("login with s3cret-password");
    const calls = consoleSpy.mock.calls;
    const lastCall = String(calls[calls.length - 1]?.[0]);
    expect(lastCall).not.toContain("s3cret-password");
    expect(lastCall).toContain("***");
    expect(lastCall).toContain("[RUNNING]");
  });

  it("masks secrets in onTestComplete output", () => {
    maskedReporter.onTestComplete("enter s3cret-password", "passed", "ai", 100);
    const calls = consoleSpy.mock.calls;
    const lastCall = String(calls[calls.length - 1]?.[0]);
    expect(lastCall).not.toContain("s3cret-password");
    expect(lastCall).toContain("***");
  });

  it("masks secrets in error messages", () => {
    maskedReporter.onTestComplete(
      "test",
      "failed",
      "ai",
      100,
      "Failed: entered s3cret-password but got rejected",
    );
    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allOutput).not.toContain("s3cret-password");
    expect(allOutput).toContain("***");
  });
});
