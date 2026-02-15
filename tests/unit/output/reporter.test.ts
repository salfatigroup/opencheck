import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConsoleReporter } from "../../../src/output/reporter.ts";
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
        { testCase: "test1", status: "passed", source: "cache", durationMs: 100 },
        { testCase: "test2", status: "passed", source: "ai", durationMs: 200 },
        { testCase: "test3", status: "failed", source: "ai", durationMs: 300, error: "err" },
      ],
      totalDurationMs: 600,
      passed: 2,
      failed: 1,
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
      cached: 0,
    };

    reporter.onRunComplete(data);

    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(allOutput).toContain("1.5");  // 1500ms = 1.5s
  });
});
