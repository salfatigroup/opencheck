import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { join, resolve } from "node:path";
import { z } from "zod";
import { StepRecorder } from "../cache/step-recorder.ts";
import {
  enrichToolInputWithSnapshot,
  extractSnapshotText,
  normalizeToolInput,
} from "../cache/tool-input.ts";
import { buildMcpServerConfig } from "./mcp-client.ts";
import { createChatModel, isTransientError, TransientLLMError } from "./model-factory.ts";
import {
  buildNamedCaseMap,
  extractLastMessage,
  formatAgentError,
  normalizeNamedCaseReference,
  sanitizeTestName,
} from "./utils.ts";
import type { Config } from "../config/types.ts";
import type { AgentExecutionResult } from "./types.ts";
import type { McpRuntimeOptions } from "./mcp-client.ts";

type CreateChatModelFn = typeof createChatModel;

/**
 * Factory for creating and executing LangChain agents with MCP tools.
 * Creates a fresh agent + MCP server per test execution for isolation.
 */
export class AgentFactory {
  private readonly config: Config;
  private readonly runtimeOptions: McpRuntimeOptions;
  private readonly namedCaseMap: Map<string, string>;
  private readonly createChatModelFn: CreateChatModelFn;

  constructor(
    config: Config,
    runtimeOptions: McpRuntimeOptions = {},
    createChatModelFn: CreateChatModelFn = createChatModel,
  ) {
    this.config = config;
    this.runtimeOptions = runtimeOptions;
    this.namedCaseMap = buildNamedCaseMap(config.tests);
    this.createChatModelFn = createChatModelFn;
  }

  /**
   * Build the system prompt for a test case.
   * Mentions both browser and API tools — the AI autonomously
   * chooses the right tools based on the test case description.
   */
  static buildSystemPrompt(testCase: string, baseUrl: string): string {
    return [
      "You are a QA automation agent. Your job is to execute the following test case",
      "and determine if it passes or fails.",
      "",
      `Test case: "${testCase}"`,
      `Base URL: "${baseUrl}"`,
      "",
      "You have access to both browser automation tools and HTTP/curl tools.",
      "Choose the appropriate tools based on the test case:",
      "",
      "For browser/UI tests:",
      "- Use browser_navigate, browser_click, browser_type, browser_snapshot, browser_evaluate",
      "- Use browser_snapshot to understand the overall page layout or discover unknown elements",
      "",
      "For API tests:",
      "- Use the curl tool to make HTTP requests",
      "- Check status codes, headers, and response body",
      "",
      "Named test case references:",
      '- If the current test case contains references like "#login" or "{login}",',
      '  call the "opencheck_lookup_named_case" tool before taking actions.',
      "- Use that tool to retrieve the referenced named case text.",
      "- Combine the referenced case intent with the current test case to guide execution.",
      "",
      "Token efficiency:",
      "- Prefer browser_evaluate (returns only the JS result, not the full page tree) over",
      "  browser_snapshot for checking elements, text, loading states, and polling.",
      "",
      "Instructions:",
      "1. Analyze the test case and decide which tools to use.",
      "2. Resolve any named test references with the lookup tool when needed.",
      "3. Execute the actions needed to verify the test case.",
      "4. After completing the test, respond with EXACTLY one of:",
      '   - "TEST_PASSED: <brief explanation>"',
      '   - "TEST_FAILED: <brief explanation of what went wrong>"',
      '   - "TEST_SKIPPED: <brief explanation of why the test was skipped>"',
      "",
      "Be methodical. If something doesn't work, try alternative approaches before declaring failure.",
    ].join("\n");
  }

  /**
   * Execute a single test case using the AI agent.
   * Creates an isolated MCP server, runs the agent, and cleans up.
   * @returns AgentExecutionResult with pass/fail, steps, and message
   */
  async executeTest(testCase: string, baseUrl: string): Promise<AgentExecutionResult> {
    const recordingDir = this.config.recording
      ? resolve(join(".opencheck-recordings", sanitizeTestName(testCase)))
      : undefined;
    const mcpConfig = buildMcpServerConfig(this.config, this.runtimeOptions, recordingDir);
    const client = new MultiServerMCPClient(mcpConfig);
    const recorder = new StepRecorder();

    try {
      const mcpTools = await client.getTools();
      let latestSnapshotText: string | null = null;

      // Wrap tools with recorder to capture steps
      const wrappedMcpTools = mcpTools.map((tool) => {
        const originalInvoke = tool.invoke.bind(tool);
        const wrappedInvoke = async (input: Record<string, unknown>): Promise<string> => {
          const result = await originalInvoke(input);
          const textResult = typeof result === "string" ? result : JSON.stringify(result);
          const snapshotText = extractSnapshotText(textResult);
          if (snapshotText) {
            latestSnapshotText = snapshotText;
          }
          recorder.record(
            tool.name,
            enrichToolInputWithSnapshot(normalizeToolInput(input), latestSnapshotText),
          );
          return textResult;
        };
        return { ...tool, invoke: wrappedInvoke };
      });
      const allTools = [...wrappedMcpTools, this.createNamedCaseLookupTool()];

      const model = await this.createChatModelFn(this.config);
      const systemPrompt = AgentFactory.buildSystemPrompt(testCase, baseUrl);
      const agent = createReactAgent({
        llm: model,
        tools: allTools,
        prompt: systemPrompt,
      });

      const result = await agent.invoke(
        {
          messages: [{ role: "user", content: `Execute the test case: "${testCase}"` }],
        },
        { recursionLimit: this.config.recursionLimit },
      );

      const lastMessage = extractLastMessage(result);
      const skipped = lastMessage.includes("TEST_SKIPPED");
      const passed = lastMessage.includes("TEST_PASSED");
      const outcome = skipped ? "skipped" as const : passed ? "passed" as const : "failed" as const;

      return {
        outcome,
        steps: recorder.getSteps(),
        message: lastMessage,
        recordingDir,
      };
    } catch (error) {
      const wrappedError =
        error instanceof Error && isTransientError(error)
          ? new TransientLLMError(error.message, { cause: error })
          : error;
      return {
        outcome: "failed",
        steps: recorder.getSteps(),
        message: formatAgentError(wrappedError, testCase, this.config.recursionLimit),
      };
    } finally {
      await client.close();
    }
  }

  private createNamedCaseLookupTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: "opencheck_lookup_named_case",
      description:
        "Look up a named OpenCheck test case by reference such as #login or login and return its case text.",
      schema: z.object({
        reference: z.string().min(1, "Reference cannot be empty"),
      }),
      func: async ({ reference }: { reference: string }) => {
        const normalizedReference = normalizeNamedCaseReference(reference);
        const caseText = this.namedCaseMap.get(normalizedReference);
        if (!caseText) {
          return `Named test case not found for reference "${reference}".`;
        }
        return caseText;
      },
    });
  }
}
