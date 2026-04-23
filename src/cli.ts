#!/usr/bin/env bun
import pkg from "../package.json" with { type: "json" };
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { loadConfig, ConfigLoadError } from "./config/loader.ts";
import { CacheManager } from "./cache/cache-manager.ts";
import { AgentFactory } from "./agent/agent-factory.ts";
import { createMcpClient } from "./agent/mcp-client.ts";
import { TestExecutor } from "./runner/test-executor.ts";
import { TestRunner } from "./runner/test-runner.ts";
import { ConsoleReporter } from "./output/reporter.ts";
import { SecretMasker } from "./output/secret-masker.ts";
import { StepReplayer } from "./cache/step-replayer.ts";
import { generateFailureSummary } from "./output/failure-summary.ts";
import { normalizeToolInput } from "./cache/tool-input.ts";
import {
  buildElementSearchCandidates,
  extractRefFromSnapshot,
  recoverRefFromLabels,
  snapshotToText,
  waitForAnyText,
} from "./runner/recovery.ts";
import type { McpRuntimeOptions } from "./agent/mcp-client.ts";

const program = new Command();

program
  .name("opencheck")
  .description("AI-powered end-to-end browser and API test automation")
  .version(pkg.version)
  .requiredOption("-c, --config <path>", "Path to tests.yaml config file")
  .action(async (options: { config: string }) => {
    let exitCode = 0;
    let persistentUserDataDir: string | null = null;
    let unexpectedError: unknown = null;

    try {
      const config = await loadConfig(options.config);
      const mcpRuntimeOptions: McpRuntimeOptions = {};
      if (config.sessionMode === "persistent") {
        persistentUserDataDir = await mkdtemp(join(tmpdir(), "opencheck-profile-"));
        mcpRuntimeOptions.userDataDir = persistentUserDataDir;
      }

      const masker = config.secrets.length > 0 ? new SecretMasker(config.secrets) : undefined;
      const reporter = new ConsoleReporter(masker);
      const cacheManager = new CacheManager(config.cacheDir);
      const agentFactory = new AgentFactory(config, mcpRuntimeOptions);

      const replayFn = async (steps: Parameters<StepReplayer["replay"]>[0]) => {
        const { tools, cleanup } = await createMcpClient(config, mcpRuntimeOptions);

        const executor = async (toolName: string, toolInput: Record<string, unknown>) => {
          const tool = tools.find((t) => t.name === toolName);
          if (!tool) throw new Error(`Tool not found: ${toolName}`);
          const normalizedInput = normalizeToolInput(toolInput);
          try {
            const result = await tool.invoke(normalizedInput);
            const textResult = typeof result === "string" ? result : JSON.stringify(result);
            if (toolName === "browser_navigate") {
              const waitTool = tools.find((t) => t.name === "browser_wait_for");
              if (waitTool) {
                await waitTool.invoke({ time: 2 });
              }
            }
            return textResult;
          } catch (error) {
            if (error instanceof Error && error.message.includes("Ref") && error.message.includes("not found")) {
              const snapshotTool = tools.find((t) => t.name === "browser_snapshot");
              const waitTool = tools.find((t) => t.name === "browser_wait_for");
              if (snapshotTool) {
                const failureSnapshot = await snapshotTool.invoke({});
                const failureText = typeof failureSnapshot === "string" ? failureSnapshot : JSON.stringify(failureSnapshot);
                const elementLabel =
                  typeof normalizedInput["element"] === "string" ? normalizedInput["element"] : null;
                const compactElementLabels = elementLabel ? buildElementSearchCandidates(elementLabel) : [];
                if (compactElementLabels.length > 0 && waitTool) {
                  try {
                    const recoveredFromFailureSnapshot = recoverRefFromLabels(
                      failureText,
                      compactElementLabels,
                      toolName,
                    );
                    const matchedCompactLabel = recoveredFromFailureSnapshot?.label ?? (
                      await waitForAnyText(waitTool, compactElementLabels, toolName)
                    );
                    const postWaitText = recoveredFromFailureSnapshot
                      ? failureText
                      : await snapshotToText(snapshotTool);
                    const recoveredRef =
                      recoveredFromFailureSnapshot?.ref ??
                      (matchedCompactLabel
                        ? extractRefFromSnapshot(postWaitText, matchedCompactLabel, toolName)
                        : null);
                    if (recoveredRef) {
                      const retriedInput = { ...normalizedInput, ref: recoveredRef };
                      const retriedResult = await tool.invoke(retriedInput);
                      const retriedText = typeof retriedResult === "string" ? retriedResult : JSON.stringify(retriedResult);
                      if (
                        toolName === "browser_click" &&
                        matchedCompactLabel === "Search" &&
                        waitTool &&
                        snapshotTool
                      ) {
                        await waitTool.invoke({ time: 10 });
                      }
                      return retriedText;
                    }
                  } catch {
                  }
                }
              }
            }
            throw error;
          }
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

      console.log(`\nOpenCheck v${pkg.version}`);
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

      exitCode = runResult.failed > 0 ? 1 : 0;
    } catch (error) {
      if (error instanceof ConfigLoadError) {
        console.error(`Error: ${error.message}`);
        exitCode = 1;
      } else {
        unexpectedError = error;
        exitCode = 1;
      }
    } finally {
      if (persistentUserDataDir) {
        await rm(persistentUserDataDir, { recursive: true, force: true });
      }
    }

    if (unexpectedError) {
      const errorName = unexpectedError instanceof Error ? unexpectedError.constructor.name : "UnknownError";
      const errorMessage = unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError);
      console.error("");
      console.error("━".repeat(50));
      console.error("  OpenCheck encountered an unexpected error");
      console.error("━".repeat(50));
      console.error(`  ${errorName}: ${errorMessage}`);
      console.error("");
      console.error("  This is likely a bug in OpenCheck or a misconfigured environment.");
      console.error("  Please check your config file and environment variables, then retry.");
      console.error("━".repeat(50));
    }

    process.exit(exitCode);
  });

program.parse();
