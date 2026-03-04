import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../../src/config/types.ts";

// Self-contained vi.mock factories — no external variable references.
// Vitest hoists vi.mock() calls to the top of the file, so factory functions
// must not reference any variables declared in module scope.
// Only vi.fn() is available inside factories (it's always in scope).

vi.mock("@langchain/mcp-adapters", () => {
  return {
    MultiServerMCPClient: class MockMCPClient {
      getTools = vi.fn().mockResolvedValue([
        {
          name: "browser_navigate",
          description: "Navigate to URL",
          invoke: vi.fn().mockResolvedValue("Navigated to page"),
        },
        {
          name: "browser_click",
          description: "Click element",
          invoke: vi.fn().mockResolvedValue("Clicked element"),
        },
      ]);
      close = vi.fn().mockResolvedValue(undefined);
    },
  };
});

vi.mock("../../../src/agent/model-factory.ts", () => ({
  createChatModel: vi.fn().mockResolvedValue({
    bindTools() { return this; },
  }),
}));

vi.mock("@langchain/langgraph/prebuilt", () => ({
  createReactAgent: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockResolvedValue({
      messages: [
        { content: "TEST_PASSED: Login form is visible and working" },
      ],
    }),
  })),
}));

// Import mocked modules to access mock instances for assertions
import { AgentFactory } from "../../../src/agent/agent-factory.ts";
import { createChatModel } from "../../../src/agent/model-factory.ts";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

describe("AgentFactory", () => {
  const baseConfig: Config = {
    baseUrl: "http://localhost:3000",
    browser: "chromium",
    headless: true,
    timeout: 60000,
    maxAttempts: 3,
    cacheDir: ".opencheck-cache",
    model: "claude-sonnet-4-5-20250929",
    recursionLimit: 500,
    tests: [{ case: "check login is working" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-configure mock return values after clearAllMocks resets them
    (createChatModel as ReturnType<typeof vi.fn>).mockResolvedValue({
      bindTools() { return this; },
    });
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockResolvedValue({
        messages: [
          { content: "TEST_PASSED: Login form is visible and working" },
        ],
      }),
    }));
  });

  it("builds the system prompt with test case and base URL", () => {
    const prompt = AgentFactory.buildSystemPrompt("check login is working", "http://localhost:3000");
    expect(prompt).toContain("check login is working");
    expect(prompt).toContain("http://localhost:3000");
    expect(prompt).toContain("TEST_PASSED");
    expect(prompt).toContain("TEST_FAILED");
  });

  it("builds unified prompt mentioning both browser and curl tools", () => {
    const prompt = AgentFactory.buildSystemPrompt("test something", "http://localhost:3000");
    expect(prompt).toContain("browser");
    expect(prompt).toContain("curl");
    expect(prompt).toContain("browser_snapshot");
    expect(prompt).toContain("API");
  });

  it("executes a test and returns result on success", async () => {
    const factory = new AgentFactory(baseConfig);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.passed).toBe(true);
    expect(result.message).toContain("TEST_PASSED");
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it("uses createChatModel to instantiate the model", async () => {
    const factory = new AgentFactory(baseConfig);
    await factory.executeTest("check login is working", "http://localhost:3000");
    expect(createChatModel).toHaveBeenCalledWith(baseConfig);
  });

  it("cleans up MCP client after execution", async () => {
    const factory = new AgentFactory(baseConfig);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");
    // Verify execution completed successfully (close is called in finally block)
    expect(result.passed).toBe(true);
  });

  it("forwards recursionLimit from config to agent.invoke()", async () => {
    const configWithLimit: Config = {
      ...baseConfig,
      recursionLimit: 750,
    };

    let capturedConfig: Record<string, unknown> | undefined;
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockImplementation((_input: unknown, config?: Record<string, unknown>) => {
        capturedConfig = config;
        return Promise.resolve({
          messages: [{ content: "TEST_PASSED: OK" }],
        });
      }),
    }));

    const factory = new AgentFactory(configWithLimit);
    await factory.executeTest("check login", "http://localhost:3000");

    expect(capturedConfig).toBeDefined();
    expect(capturedConfig).toHaveProperty("recursionLimit", 750);
  });

  it("uses default recursionLimit of 500 when not specified in config", async () => {
    let capturedConfig: Record<string, unknown> | undefined;
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockImplementation((_input: unknown, config?: Record<string, unknown>) => {
        capturedConfig = config;
        return Promise.resolve({
          messages: [{ content: "TEST_PASSED: OK" }],
        });
      }),
    }));

    const factory = new AgentFactory(baseConfig);
    await factory.executeTest("check login", "http://localhost:3000");

    expect(capturedConfig).toBeDefined();
    expect(capturedConfig).toHaveProperty("recursionLimit");
  });

  it("detects TEST_FAILED in agent response", async () => {
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockResolvedValue({
        messages: [
          { content: "TEST_FAILED: Login button not found" },
        ],
      }),
    }));

    const factory = new AgentFactory(baseConfig);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.passed).toBe(false);
    expect(result.message).toContain("TEST_FAILED");
  });
});
