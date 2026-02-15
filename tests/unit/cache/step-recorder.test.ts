import { describe, it, expect } from "vitest";
import { StepRecorder } from "../../../src/cache/step-recorder.ts";
import type { CachedStep } from "../../../src/cache/types.ts";

describe("StepRecorder", () => {
  it("starts with empty steps", () => {
    const recorder = new StepRecorder();
    expect(recorder.getSteps()).toEqual([]);
  });

  it("records a single tool call", () => {
    const recorder = new StepRecorder();
    recorder.record("browser_navigate", { url: "http://localhost:3000" });

    const steps = recorder.getSteps();
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({
      toolName: "browser_navigate",
      toolInput: { url: "http://localhost:3000" },
    });
  });

  it("records multiple tool calls in order", () => {
    const recorder = new StepRecorder();
    recorder.record("browser_navigate", { url: "http://localhost:3000" });
    recorder.record("browser_click", { selector: "#login-btn" });
    recorder.record("browser_type", { selector: "#username", text: "admin" });

    const steps = recorder.getSteps();
    expect(steps).toHaveLength(3);
    expect(steps[0]?.toolName).toBe("browser_navigate");
    expect(steps[1]?.toolName).toBe("browser_click");
    expect(steps[2]?.toolName).toBe("browser_type");
  });

  it("returns a copy of steps, not the internal reference", () => {
    const recorder = new StepRecorder();
    recorder.record("browser_navigate", { url: "http://localhost:3000" });

    const steps1 = recorder.getSteps();
    const steps2 = recorder.getSteps();
    expect(steps1).toEqual(steps2);
    expect(steps1).not.toBe(steps2);
  });

  it("clears recorded steps", () => {
    const recorder = new StepRecorder();
    recorder.record("browser_navigate", { url: "http://localhost:3000" });
    recorder.clear();
    expect(recorder.getSteps()).toEqual([]);
  });

  it("wraps a tool function to auto-record calls", async () => {
    const recorder = new StepRecorder();
    const mockTool = async (_input: Record<string, unknown>): Promise<string> =>
      "navigation complete";

    const wrappedTool = recorder.wrapTool("browser_navigate", mockTool);
    const result = await wrappedTool({ url: "http://localhost:3000" });

    expect(result).toBe("navigation complete");
    expect(recorder.getSteps()).toHaveLength(1);
    expect(recorder.getSteps()[0]?.toolName).toBe("browser_navigate");
  });
});
