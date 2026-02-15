import { describe, it, expect, vi } from "vitest";
import { StepReplayer, type ToolExecutor } from "../../../src/cache/step-replayer.ts";
import type { CachedStep } from "../../../src/cache/types.ts";

describe("StepReplayer", () => {
  it("replays all steps successfully", async () => {
    const executor: ToolExecutor = vi.fn().mockResolvedValue("ok");

    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
      { toolName: "browser_click", toolInput: { selector: "#login" } },
    ];

    const replayer = new StepReplayer(executor);
    const result = await replayer.replay(steps);

    expect(result.success).toBe(true);
    expect(result.failedStep).toBeUndefined();
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenCalledWith("browser_navigate", { url: "http://localhost:3000" });
    expect(executor).toHaveBeenCalledWith("browser_click", { selector: "#login" });
  });

  it("reports failure when a step throws", async () => {
    const executor: ToolExecutor = vi
      .fn()
      .mockResolvedValueOnce("ok")
      .mockRejectedValueOnce(new Error("Element not found"));

    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
      { toolName: "browser_click", toolInput: { selector: "#missing" } },
    ];

    const replayer = new StepReplayer(executor);
    const result = await replayer.replay(steps);

    expect(result.success).toBe(false);
    expect(result.failedStep).toBe(1);
    expect(result.error).toContain("Element not found");
  });

  it("handles empty steps list", async () => {
    const executor: ToolExecutor = vi.fn();
    const replayer = new StepReplayer(executor);
    const result = await replayer.replay([]);

    expect(result.success).toBe(true);
    expect(executor).not.toHaveBeenCalled();
  });

  it("stops execution after first failure", async () => {
    const executor: ToolExecutor = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"));

    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
      { toolName: "browser_click", toolInput: { selector: "#btn" } },
    ];

    const replayer = new StepReplayer(executor);
    await replayer.replay(steps);

    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("returns error message from the failed step", async () => {
    const executor: ToolExecutor = vi
      .fn()
      .mockRejectedValueOnce(new Error("Timeout waiting for selector"));

    const steps: CachedStep[] = [
      { toolName: "browser_click", toolInput: { selector: "#missing" } },
    ];

    const replayer = new StepReplayer(executor);
    const result = await replayer.replay(steps);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Timeout waiting for selector");
  });
});
