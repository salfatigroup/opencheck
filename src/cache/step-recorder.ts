import type { CachedStep } from "./types.ts";

/** Callback signature for a tool function that can be wrapped */
type ToolFunction = (input: Record<string, unknown>) => Promise<string>;

/**
 * Records MCP tool calls as CachedStep entries.
 * Used during AI agent execution to capture the sequence of actions
 * that led to a successful test, enabling later cache replay.
 */
export class StepRecorder {
  private steps: CachedStep[] = [];

  /** Record a tool invocation manually */
  record(toolName: string, toolInput: Record<string, unknown>): void {
    this.steps.push({ toolName, toolInput });
  }

  /** Get a copy of all recorded steps */
  getSteps(): CachedStep[] {
    return [...this.steps];
  }

  /** Clear all recorded steps */
  clear(): void {
    this.steps = [];
  }

  /**
   * Wrap a tool function to automatically record calls.
   * The original function is called as-is; a recording is made before returning.
   */
  wrapTool(toolName: string, fn: ToolFunction): ToolFunction {
    return async (input: Record<string, unknown>): Promise<string> => {
      const result = await fn(input);
      this.record(toolName, input);
      return result;
    };
  }
}
