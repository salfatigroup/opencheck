/** Public API for programmatic usage of OpenCheck */

export { loadConfig, ConfigLoadError } from "./config/loader.ts";
export { ConfigSchema, TestCaseSchema } from "./config/schema.ts";
export type { Config, TestCase } from "./config/types.ts";

export { CacheManager } from "./cache/cache-manager.ts";
export { StepRecorder } from "./cache/step-recorder.ts";
export { StepReplayer } from "./cache/step-replayer.ts";
export type { CacheEntry, CachedStep } from "./cache/types.ts";

export { AgentFactory } from "./agent/agent-factory.ts";
export { buildMcpServerConfig, createMcpClient } from "./agent/mcp-client.ts";
export { createChatModel } from "./agent/model-factory.ts";
export type { McpServerConfig } from "./agent/mcp-client.ts";
export type { AgentExecutionResult } from "./agent/types.ts";

export { TestRunner } from "./runner/test-runner.ts";
export { TestExecutor } from "./runner/test-executor.ts";
export type { TestResult, RunResult, TestStatus, TestSource } from "./runner/types.ts";

export { ConsoleReporter } from "./output/reporter.ts";
export type { Reporter, ReportData } from "./output/types.ts";
