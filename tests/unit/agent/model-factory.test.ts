import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../../src/config/types.ts";
import { createChatModel } from "../../../src/agent/model-factory.ts";

const mockInitChatModel = vi.fn().mockResolvedValue({
  _modelType: "mock-chat-model",
  invoke: vi.fn(),
});

vi.mock("langchain/chat_models/universal", () => ({
  initChatModel: (...args: unknown[]) => mockInitChatModel(...args),
}));

describe("createChatModel", () => {
  const baseConfig: Config = {
    baseUrl: "http://localhost:3000",
    browser: "chromium",
    headless: true,
    sessionMode: "isolated",
    timeout: 60000,
    maxAttempts: 3,
    cacheDir: ".opencheck-cache",
    model: "claude-sonnet-4-5-20250929",
    recursionLimit: 500,
    tests: [{ case: "test" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInitChatModel.mockResolvedValue({
      _modelType: "mock-chat-model",
      invoke: vi.fn(),
    });
  });

  it("calls initChatModel with the configured model name", async () => {
    await createChatModel(baseConfig);
    expect(mockInitChatModel).toHaveBeenCalledWith(
      "claude-sonnet-4-5-20250929",
      expect.any(Object),
    );
  });

  it("does not pass modelProvider when it is undefined", async () => {
    await createChatModel(baseConfig);
    const callArgs = mockInitChatModel.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("modelProvider");
  });

  it("passes modelProvider when configured for bedrock", async () => {
    const config: Config = { ...baseConfig, modelProvider: "bedrock" };
    await createChatModel(config);
    expect(mockInitChatModel).toHaveBeenCalledWith(
      "claude-sonnet-4-5-20250929",
      expect.objectContaining({ modelProvider: "bedrock" }),
    );
  });

  it("passes modelProvider when configured for google-vertexai", async () => {
    const config: Config = { ...baseConfig, modelProvider: "google-vertexai" };
    await createChatModel(config);
    expect(mockInitChatModel).toHaveBeenCalledWith(
      "claude-sonnet-4-5-20250929",
      expect.objectContaining({ modelProvider: "google-vertexai" }),
    );
  });

  it("returns the model instance from initChatModel", async () => {
    const mockModel = { _modelType: "returned-model", invoke: vi.fn() };
    mockInitChatModel.mockResolvedValueOnce(mockModel);

    const result = await createChatModel(baseConfig);
    expect(result).toBe(mockModel);
  });

  it("uses the model name from config, not a hardcoded value", async () => {
    const config: Config = {
      ...baseConfig,
      model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      modelProvider: "bedrock",
    };
    await createChatModel(config);
    expect(mockInitChatModel).toHaveBeenCalledWith(
      "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      expect.objectContaining({ modelProvider: "bedrock" }),
    );
  });
});
