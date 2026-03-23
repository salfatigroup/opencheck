#!/usr/bin/env bun
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
import { StepReplayer } from "./cache/step-replayer.ts";
import { normalizeToolInput } from "./cache/tool-input.ts";
import type { McpRuntimeOptions } from "./agent/mcp-client.ts";

const program = new Command();

program
  .name("opencheck")
  .description("AI-powered end-to-end browser and API test automation")
  .version("0.1.0")
  .requiredOption("-c, --config <path>", "Path to tests.yaml config file")
  .action(async (options: { config: string }) => {
    let exitCode = 0;
    let persistentUserDataDir: string | null = null;

    try {
      const config = await loadConfig(options.config);
      const mcpRuntimeOptions: McpRuntimeOptions = {};
      if (config.sessionMode === "persistent") {
        persistentUserDataDir = await mkdtemp(join(tmpdir(), "opencheck-profile-"));
        mcpRuntimeOptions.userDataDir = persistentUserDataDir;
      }

      const reporter = new ConsoleReporter();
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

      console.log(`\nOpenCheck v0.1.0`);
      console.log(`Running ${config.tests.length} test(s)...\n`);

      const runResult = await runner.run();
      exitCode = runResult.failed > 0 ? 1 : 0;
    } catch (error) {
      if (error instanceof ConfigLoadError) {
        console.error(`Error: ${error.message}`);
        exitCode = 1;
      } else {
        throw error;
      }
    } finally {
      if (persistentUserDataDir) {
        await rm(persistentUserDataDir, { recursive: true, force: true });
      }
    }

    process.exit(exitCode);
  });

program.parse();

function extractRefFromSnapshot(
  snapshotText: string,
  label: string,
  toolName: string,
): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const roleMatches = Array.from(
    snapshotText.matchAll(
      new RegExp(`-\\s+([a-z]+)\\s+"${escapedLabel}"[^\\n]*\\[ref=(e\\d+)\\]`, "gi"),
    ),
  );

  const preferredRoles = preferredRolesForTool(toolName);
  for (const preferredRole of preferredRoles) {
    const match = roleMatches.find((entry) => entry[1]?.toLowerCase() === preferredRole);
    if (match?.[2]) return match[2];
  }

  return roleMatches[0]?.[2] ?? null;
}

function buildElementSearchCandidates(label: string): string[] {
  const candidates = new Set<string>();
  const trimmed = label.trim();

  const cleaned = trimmed
    .replace(/\s+in\s+sidebar$/i, "")
    .replace(/\s+(button|link|textbox)$/i, "")
    .trim();

  candidates.add(trimmed);
  if (cleaned) candidates.add(cleaned);

  const withoutRoles = trimmed
    .replace(/\s+(button|link|textbox)\b/gi, "")
    .replace(/\s+in\s+sidebar$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutRoles) candidates.add(withoutRoles);

  if (/search/i.test(trimmed)) {
    candidates.add("Search");
  }
  if (/search for anything/i.test(trimmed)) {
    candidates.add("Search for anything");
  }

  return [...candidates].filter(Boolean);
}

function preferredRolesForTool(toolName: string): string[] {
  switch (toolName) {
    case "browser_type":
      return ["textbox", "combobox"];
    case "browser_click":
      return ["button", "link"];
    default:
      return [];
  }
}

async function waitForAnyText(
  waitTool: { invoke(input: Record<string, unknown>): Promise<unknown> },
  labels: string[],
  toolName: string,
): Promise<string | null> {
  const textWaitCandidates = filterTextWaitCandidates(labels, toolName);
  if (textWaitCandidates.length === 0) return null;

  for (const label of textWaitCandidates) {
    try {
      await waitTool.invoke({ text: label });
      return label;
    } catch {
      // Try the next candidate label.
    }
  }
  return null;
}

function recoverRefFromLabels(
  snapshotText: string,
  labels: string[],
  toolName: string,
): { label: string; ref: string } | null {
  for (const label of labels) {
    const ref = extractRefFromSnapshot(snapshotText, label, toolName);
    if (ref) {
      return { label, ref };
    }
  }
  return null;
}

async function snapshotToText(
  snapshotTool: { invoke(input: Record<string, unknown>): Promise<unknown> },
): Promise<string> {
  const snapshot = await snapshotTool.invoke({});
  return typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);
}

function filterTextWaitCandidates(labels: string[], toolName: string): string[] {
  if (toolName === "browser_type") {
    return labels.filter((label) => /textbox|combobox/i.test(label));
  }
  return labels;
}
