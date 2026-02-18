import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { StepRecorder } from "../cache/step-recorder.ts";
import { buildMcpServerConfig } from "./mcp-client.ts";
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
    const mcpConfig = buildMcpServerConfig(this.config);
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

      const model = new ChatAnthropic({ model: this.config.model });
      const systemPrompt = AgentFactory.buildSystemPrompt(testCase, baseUrl);
      const agent = createReactAgent({
        llm: model,
        tools: wrappedTools,
        prompt: systemPrompt,
      });

      const result = await agent.invoke({
        messages: [{ role: "user", content: `Execute the test case: "${testCase}"` }],
      });

      const lastMessage = extractLastMessage(result);
      const passed = lastMessage.includes("TEST_PASSED");

      return {
        passed,
        steps: recorder.getSteps(),
        message: lastMessage,
      };
    } finally {
      await client.close();
    }
  }
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
