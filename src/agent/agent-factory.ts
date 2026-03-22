import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { join, resolve } from "node:path";
import { StepRecorder } from "../cache/step-recorder.ts";
import { buildMcpServerConfig } from "./mcp-client.ts";
import { createChatModel } from "./model-factory.ts";
import type { Config } from "../config/types.ts";
import type { AgentExecutionResult } from "./types.ts";

/**
 * Factory for creating and executing LangChain agents with MCP tools.
 * Creates a fresh agent + MCP server per test execution for isolation.
 */
export class AgentFactory {
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
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
      "- Use browser_navigate, browser_click, browser_type, browser_snapshot",
      "- Use browser_snapshot to understand page state before acting",
      "",
      "For API tests:",
      "- Use the curl tool to make HTTP requests",
      "- Check status codes, headers, and response body",
      "",
      "Instructions:",
      "1. Analyze the test case and decide which tools to use.",
      "2. Execute the actions needed to verify the test case.",
      "3. After completing the test, respond with EXACTLY one of:",
      '   - "TEST_PASSED: <brief explanation>"',
      '   - "TEST_FAILED: <brief explanation of what went wrong>"',
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
    const mcpConfig = buildMcpServerConfig(this.config, recordingDir);
    const client = new MultiServerMCPClient(mcpConfig);
    const recorder = new StepRecorder();

    try {
      const tools = await client.getTools();

      // Wrap tools with recorder to capture steps
      const wrappedTools = tools.map((tool) => {
        const originalInvoke = tool.invoke.bind(tool);
        const wrappedInvoke = async (input: Record<string, unknown>): Promise<string> => {
          const result = await originalInvoke(input);
          recorder.record(tool.name, input);
          return typeof result === "string" ? result : JSON.stringify(result);
        };
        return { ...tool, invoke: wrappedInvoke };
      });

      const model = await createChatModel(this.config);
      const systemPrompt = AgentFactory.buildSystemPrompt(testCase, baseUrl);
      const agent = createReactAgent({
        llm: model,
        tools: wrappedTools,
        prompt: systemPrompt,
      });

      const result = await agent.invoke(
        {
          messages: [{ role: "user", content: `Execute the test case: "${testCase}"` }],
        },
        { recursionLimit: this.config.recursionLimit },
      );

      const lastMessage = extractLastMessage(result);
      const passed = lastMessage.includes("TEST_PASSED");

      return {
        passed,
        steps: recorder.getSteps(),
        message: lastMessage,
        recordingDir,
      };
    } catch (error) {
      return {
        passed: false,
        steps: recorder.getSteps(),
        message: formatAgentError(error, testCase, this.config.recursionLimit),
      };
    } finally {
      await client.close();
    }
  }
}

/** Convert a test case description to a filesystem-safe directory name */
function sanitizeTestName(testCase: string): string {
  return testCase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

/** Extract the last AI message content from agent result */
function extractLastMessage(result: Record<string, unknown>): string {
  const messages = result["messages"] as Array<{ content: string }> | undefined;
  if (!messages || messages.length === 0) {
    return "No response from agent";
  }
  const last = messages[messages.length - 1];
  return last?.content ?? "No content in last message";
}

/** Convert an agent runtime error into a user-friendly failure message */
function formatAgentError(error: unknown, testCase: string, recursionLimit: number): string {
  const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorName === "GraphRecursionError" || errorMessage.includes("Recursion limit")) {
    return [
      `TEST_FAILED: Agent exceeded the recursion limit (${recursionLimit} steps) while executing this test.`,
      `  The test "${testCase}" required more steps than the configured limit allows.`,
      `  Suggestion: Increase 'recursionLimit' in your config (current: ${recursionLimit}), or simplify the test case into smaller, focused checks.`,
    ].join("\n");
  }

  if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
    return [
      `TEST_FAILED: The AI model returned a rate-limit error.`,
      `  Suggestion: Wait a moment and retry, or check your API key usage and billing.`,
    ].join("\n");
  }

  if (errorMessage.includes("401") || errorMessage.includes("authentication") || errorMessage.includes("API key")) {
    return [
      `TEST_FAILED: Authentication error when calling the AI model.`,
      `  Suggestion: Verify your API key is set correctly in your environment.`,
    ].join("\n");
  }

  if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND") || errorMessage.includes("network")) {
    return [
      `TEST_FAILED: Network error while running the agent.`,
      `  Error: ${errorMessage}`,
      `  Suggestion: Check your network connection and ensure the target URL is reachable.`,
    ].join("\n");
  }

  return [
    `TEST_FAILED: Unexpected error during agent execution (${errorName}).`,
    `  Error: ${errorMessage}`,
    `  Suggestion: This may be a transient issue. Check the error above and retry.`,
  ].join("\n");
}
