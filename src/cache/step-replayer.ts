import type { CachedStep } from "./types.ts";

/** Function signature for executing a tool by name with given input */
export type ToolExecutor = (toolName: string, toolInput: Record<string, unknown>) => Promise<string>;

/** Result of replaying cached steps */
export interface ReplayResult {
  success: boolean;
  failedStep?: number;
  error?: string;
}

/**
 * Replays a sequence of cached MCP tool steps.
 * Executes each step in order; stops on first failure.
 */
export class StepReplayer {
  private readonly executor: ToolExecutor;

  constructor(executor: ToolExecutor) {
    this.executor = executor;
  }

  /**
   * Replay all cached steps in sequence.
   * @param steps - The cached steps to replay
   * @returns Result indicating success or failure with details
   */
  async replay(steps: CachedStep[]): Promise<ReplayResult> {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;

      try {
        await this.executor(step.toolName, step.toolInput);
      } catch (error) {
        return {
          success: false,
          failedStep: i,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { success: true };
  }
}
