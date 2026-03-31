import type { CachedStep } from "../cache/types.ts";

/** Outcome of an AI agent test execution */
export type AgentOutcome = "passed" | "failed" | "skipped";

/** Result of an AI agent test execution */
export interface AgentExecutionResult {
  /** @deprecated Use `outcome` instead */
  passed: boolean;
  outcome: AgentOutcome;
  steps: CachedStep[];
  message: string;
  recordingDir?: string;
}

/** Interface for MCP client lifecycle management */
export interface McpClientInterface {
  connect(): Promise<McpToolSet>;
  disconnect(): Promise<void>;
}

/** A tool that can be invoked by the agent */
export interface McpTool {
  name: string;
  description: string;
  invoke(input: Record<string, unknown>): Promise<string>;
}

/** Collection of tools returned from MCP client */
export interface McpToolSet {
  tools: McpTool[];
}
