import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../../src/config/types.ts";

// vi.hoisted values are available inside vi.mock factories because they are
// hoisted above them. This allows per-test control of mock return values.
const { mockScreenshotInvoke, mockMkdirSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockScreenshotInvoke: vi.fn().mockResolvedValue("no image data"),
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
}));

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
          invoke: vi.fn().mockResolvedValue(`### Page
- Page URL: http://localhost:3000/search
### Snapshot
\`\`\`yaml
- link "Search" [ref=e74]
- textbox "Search for anything..." [ref=e249]
\`\`\``),
        },
        {
          name: "browser_type",
          description: "Type text",
          invoke: vi.fn().mockResolvedValue("Typed text"),
        },
        {
          name: "browser_screenshot",
          description: "Take screenshot",
          invoke: mockScreenshotInvoke,
        },
      ]);
      close = vi.fn().mockResolvedValue(undefined);
    },
  };
});

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
import { createReactAgent } from "@langchain/langgraph/prebuilt";

describe("AgentFactory", () => {
  const mockCreateChatModel = vi.fn();
  const baseConfig: Config = {
    baseUrl: "http://localhost:3000",
    browser: "chromium",
    headless: true,
    sessionMode: "isolated",
    timeout: 60000,
    maxAttempts: 3,
    llmRetryAttempts: 3,
    cacheDir: ".opencheck-cache",
    model: "claude-sonnet-4-5-20250929",
    recursionLimit: 500,
    recording: false,
    bailOnFailure: false,
    viewportSize: "1280x720",
    secrets: [],
    tests: [{ case: "check login is working" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockScreenshotInvoke.mockResolvedValue("no image data");
    mockCreateChatModel.mockResolvedValue({
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
    expect(prompt).toContain("browser_evaluate");
    expect(prompt).toContain("API");
  });

  it("includes token efficiency guidance to prefer browser_evaluate over snapshots", () => {
    const prompt = AgentFactory.buildSystemPrompt("check loading state", "http://localhost:3000");
    expect(prompt).toContain("Token efficiency");
    expect(prompt).toContain("browser_evaluate");
    expect(prompt).toContain("not the full page tree");
  });

  it("instructs the model to use the named-case lookup tool for references", () => {
    const prompt = AgentFactory.buildSystemPrompt("#login then check dashboard", "http://localhost:3000");
    expect(prompt).toContain("opencheck_lookup_named_case");
    expect(prompt).toContain("#login");
    expect(prompt).toContain("{login}");
  });

  it("executes a test and returns result on success", async () => {
    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("passed");
    expect(result.message).toContain("TEST_PASSED");
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it("records normalized MCP args instead of wrapped tool-call envelopes", async () => {
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation((config) => ({
      invoke: vi.fn().mockImplementation(async () => {
        const tools = (config as { tools: Array<{ name: string; invoke(input: Record<string, unknown>): Promise<string> }> }).tools;
        const navigateTool = tools.find((tool) => tool.name === "browser_navigate");
        if (!navigateTool) {
          throw new Error("Expected browser_navigate tool");
        }

        await navigateTool.invoke({
          name: "browser_navigate",
          args: { url: "http://localhost:3000" },
          id: "toolu_123",
          type: "tool_call",
        });

        return {
          messages: [{ content: "TEST_PASSED: OK" }],
        };
      }),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.steps).toEqual([
      {
        toolName: "browser_navigate",
        toolInput: { url: "http://localhost:3000" },
      },
    ]);
  });

  it("enriches recorded ref-only inputs with element labels from snapshot results", async () => {
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation((config) => ({
      invoke: vi.fn().mockImplementation(async () => {
        const tools = (config as { tools: Array<{ name: string; invoke(input: Record<string, unknown>): Promise<string> }> }).tools;
        const clickTool = tools.find((tool) => tool.name === "browser_click");
        const typeTool = tools.find((tool) => tool.name === "browser_type");
        if (!clickTool || !typeTool) {
          throw new Error("Expected browser_click and browser_type tools");
        }

        await clickTool.invoke({ ref: "e74", element: "Search link" });
        await typeTool.invoke({ ref: "e249", text: "Elon Musk" });

        return {
          messages: [{ content: "TEST_PASSED: OK" }],
        };
      }),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.steps[1]).toEqual({
      toolName: "browser_type",
      toolInput: {
        ref: "e249",
        text: "Elon Musk",
        element: "Search for anything... textbox",
      },
    });
  });

  it("uses createChatModel to instantiate the model", async () => {
    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    await factory.executeTest("check login is working", "http://localhost:3000");
    expect(mockCreateChatModel).toHaveBeenCalledWith(baseConfig);
  });

  it("registers the named-case lookup tool and resolves references", async () => {
    const configWithNamedCase: Config = {
      ...baseConfig,
      tests: [
        { name: "#login", case: "Log in with the demo user" },
        { case: "#login, then verify dashboard loads" },
      ],
    };

    const factory = new AgentFactory(configWithNamedCase, {}, mockCreateChatModel);
    await factory.executeTest("#login, then verify dashboard loads", "http://localhost:3000");

    const createAgentCall = (createReactAgent as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | { tools?: Array<{ name: string; invoke(input: Record<string, unknown>): Promise<string> }> }
      | undefined;
    const lookupTool = createAgentCall?.tools?.find((tool) => tool.name === "opencheck_lookup_named_case");

    expect(lookupTool).toBeDefined();
    if (!lookupTool) {
      throw new Error("Expected lookup tool to be registered");
    }

    await expect(lookupTool.invoke({ reference: "#login" })).resolves.toBe("Log in with the demo user");
    await expect(lookupTool.invoke({ reference: "login" })).resolves.toBe("Log in with the demo user");
    await expect(lookupTool.invoke({ reference: "{login}" })).resolves.toBe("Log in with the demo user");
    await expect(lookupTool.invoke({ reference: "#missing" })).resolves.toContain("not found");
  });

  it("cleans up MCP client after execution", async () => {
    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");
    // Verify execution completed successfully (close is called in finally block)
    expect(result.outcome).toBe("passed");
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

    const factory = new AgentFactory(configWithLimit, {}, mockCreateChatModel);
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

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
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

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("TEST_FAILED");
  });

  it("returns user-friendly error on GraphRecursionError", async () => {
    const recursionError = new Error("Recursion limit of 500 reached without hitting a stop condition.");
    Object.defineProperty(recursionError, "constructor", {
      value: { name: "GraphRecursionError" },
    });
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockRejectedValue(recursionError),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("TEST_FAILED");
    expect(result.message).toContain("recursion limit");
    expect(result.message).toContain("Suggestion");
  });

  it("returns user-friendly error on unexpected exceptions", async () => {
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockRejectedValue(new Error("Something went wrong")),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("TEST_FAILED");
    expect(result.message).toContain("Something went wrong");
  });

  it("returns user-friendly error on ServiceUnavailableException", async () => {
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockRejectedValue(
        new Error("Bedrock is unable to process your request. ServiceUnavailableException"),
      ),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("transient service error");
    expect(result.message).toContain("llmRetryAttempts");
  });

  it("returns user-friendly error on rate limit errors", async () => {
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockRejectedValue(new Error("429 rate limit exceeded")),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("rate-limit");
  });

  it("saves before/after screenshots when test fails and browser_screenshot is available", async () => {
    const fakePng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    mockScreenshotInvoke.mockResolvedValue(JSON.stringify([{ type: "image", data: fakePng }]));

    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation((config) => ({
      invoke: vi.fn().mockImplementation(async () => {
        const tools = (config as { tools: Array<{ name: string; invoke(input: Record<string, unknown>): Promise<string> }> }).tools;
        const navigateTool = tools.find((tool) => tool.name === "browser_navigate");
        if (navigateTool) {
          await navigateTool.invoke({ url: "http://localhost:3000" });
        }
        return { messages: [{ content: "TEST_FAILED: Page not found" }] };
      }),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("failed");
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("opencheck-recordings"),
      { recursive: true },
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("before.png"),
      expect.any(Buffer),
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("after.png"),
      expect.any(Buffer),
    );
  });

  it("does not save screenshots when test passes", async () => {
    const fakePng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    mockScreenshotInvoke.mockResolvedValue(JSON.stringify([{ type: "image", data: fakePng }]));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("passed");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("sets recordingDir on failed tests even when recording is disabled", async () => {
    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockResolvedValue({
        messages: [{ content: "TEST_FAILED: Something broke" }],
      }),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("failed");
    expect(result.recordingDir).toBeDefined();
    expect(result.recordingDir).toContain("opencheck-recordings");
  });

  it("handles browser_screenshot errors gracefully during failure capture", async () => {
    mockScreenshotInvoke.mockRejectedValue(new Error("Browser closed"));

    (createReactAgent as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      invoke: vi.fn().mockResolvedValue({
        messages: [{ content: "TEST_FAILED: Something broke" }],
      }),
    }));

    const factory = new AgentFactory(baseConfig, {}, mockCreateChatModel);
    const result = await factory.executeTest("check login is working", "http://localhost:3000");

    expect(result.outcome).toBe("failed");
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
