#!/usr/bin/env bun
import { Command } from "commander";
import { loadConfig, ConfigLoadError } from "./config/loader.ts";
import { CacheManager } from "./cache/cache-manager.ts";
import { AgentFactory } from "./agent/agent-factory.ts";
import { TestExecutor } from "./runner/test-executor.ts";
import { TestRunner } from "./runner/test-runner.ts";
import { ConsoleReporter } from "./output/reporter.ts";
import { StepReplayer } from "./cache/step-replayer.ts";
import { generateFailureSummary } from "./output/failure-summary.ts";

const program = new Command();

program
  .name("opencheck")
  .description("AI-powered end-to-end browser and API test automation")
  .version("0.1.0")
  .requiredOption("-c, --config <path>", "Path to tests.yaml config file")
  .action(async (options: { config: string }) => {
    try {
      const config = await loadConfig(options.config);
      const reporter = new ConsoleReporter();
      const cacheManager = new CacheManager(config.cacheDir);
      const agentFactory = new AgentFactory(config);

      const replayFn = async (steps: Parameters<StepReplayer["replay"]>[0]) => {
        const { createMcpClient } = await import("./agent/mcp-client.ts");
        const { tools, cleanup } = await createMcpClient(config);

        const executor = async (toolName: string, toolInput: Record<string, unknown>) => {
          const tool = tools.find((t) => t.name === toolName);
          if (!tool) throw new Error(`Tool not found: ${toolName}`);
          const result = await tool.invoke(toolInput);
          return typeof result === "string" ? result : JSON.stringify(result);
        };

        try {
          const replayer = new StepReplayer(executor);
          return await replayer.replay(steps);
        } finally {
          await cleanup();
        }
      };

      const testExecutor = new TestExecutor(cacheManager, agentFactory, config, replayFn);
      const executeFn = (testCase: string, baseUrl: string) =>
        testExecutor.execute(testCase, baseUrl);

      const runner = new TestRunner(config, reporter, executeFn);

      console.log(`\nOpenCheck v0.1.0`);
      console.log(`Running ${config.tests.length} test(s)...\n`);

      const runResult = await runner.run();

      if (runResult.failed > 0) {
        const failed = runResult.results.filter((r) => r.status === "failed");
        const summary = await generateFailureSummary(failed, config);
        if (summary) {
          console.log("");
          console.log("━".repeat(50));
          console.log("  Failure Analysis");
          console.log("━".repeat(50));
          console.log(`  ${summary.split("\n").join("\n  ")}`);
          console.log("━".repeat(50));
        }
      }

      process.exit(runResult.failed > 0 ? 1 : 0);
    } catch (error) {
      if (error instanceof ConfigLoadError) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
      throw error;
    }
  });

program.parse();
