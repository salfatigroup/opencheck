import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentFactory } from "../../../src/agent/agent-factory.ts";
import type { Config } from "../../../src/config/types.ts";

const { mockGetTools, mockClose, mockCreateChatModel, mockAgentInvoke } = vi.hoisted(() => ({
  mockGetTools: vi.fn(),
  mockClose: vi.fn(),
  mockCreateChatModel: vi.fn(),
  mockAgentInvoke: vi.fn(),
}));

vi.mock("@langchain/mcp-adapters", () => ({
  MultiServerMCPClient: class MockMCPClient {
    getTools = mockGetTools;
    close = mockClose;
  },
}));

vi.mock("../../../src/agent/model-factory.ts", () => ({
  createChatModel: mockCreateChatModel,
}));

vi.mock("@langchain/langgraph/prebuilt", () => ({
  createReactAgent: vi.fn().mockImplementation(() => ({
    invoke: mockAgentInvoke,
  })),
}));

describe("AgentFactory", () => {
  const baseConfig: Config = {
    baseUrl: "http://localhost:3000",
    browser: "chromium",
    headless: true,
    timeout: 60000,
    maxAttempts: 3,
    cacheDir: ".opencheck-cache",
    model: "claude-sonnet-4-5-20250929",
    tests: [{ case: "check login is working" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTools.mockResolvedValue([
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
    mockClose.mockResolvedValue(undefined);
    mockCreateChatModel.mockResolvedValue({
      bindTools() { return this; },
    });
    mockAgentInvoke.mockResolvedValue({
      messages: [
        { content: "TEST_PASSED: Login form is visible and working" },
      ],
    });
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
    expect(mockCreateChatModel).toHaveBeenCalledWith(baseConfig);
  });

  it("cleans up MCP client after execution", async () => {
    const factory = new AgentFactory(baseConfig);
    await factory.executeTest("check login is working", "http://localhost:3000");
    expect(mockClose).toHaveBeenCalled();
  });

  it("detects TEST_FAILED in agent response", async () => {
    mockAgentInvoke.mockResolvedValueOnce({
      messages: [
        { content: "TEST_FAILED: Login button not found" },
      ],
    });

    const factory = new AgentFactory(baseConfig);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.passed).toBe(false);
    expect(result.message).toContain("TEST_FAILED");
  });
});
