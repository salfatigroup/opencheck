import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../../src/config/types.ts";
import { createChatModel, isTransientError, TransientLLMError } from "../../../src/agent/model-factory.ts";

const mockWithRetry = vi.fn().mockReturnValue({ _modelType: "retry-wrapped" });

const mockInitChatModel = vi.fn().mockResolvedValue({
  _modelType: "mock-chat-model",
  invoke: vi.fn(),
  withRetry: mockWithRetry,
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
    llmRetryAttempts: 3,
    cacheDir: ".opencheck-cache",
    model: "claude-sonnet-4-5-20250929",
    recursionLimit: 500,
    recording: false,
    bailOnFailure: false,
    viewportSize: "1280x720",
    secrets: [],
    tests: [{ case: "test" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockReturnValue({ _modelType: "retry-wrapped" });
    mockInitChatModel.mockResolvedValue({
      _modelType: "mock-chat-model",
      invoke: vi.fn(),
      withRetry: mockWithRetry,
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

  it("wraps model with .withRetry() when llmRetryAttempts > 0", async () => {
    const config: Config = { ...baseConfig, llmRetryAttempts: 5 };
    const result = await createChatModel(config);

    expect(mockWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ stopAfterAttempt: 5 }),
    );
    expect(result).toEqual({ _modelType: "retry-wrapped" });
  });

  it("wraps model with .withRetry() using default llmRetryAttempts of 3", async () => {
    await createChatModel(baseConfig);

    expect(mockWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ stopAfterAttempt: 3 }),
    );
  });

  it("does not wrap model with .withRetry() when llmRetryAttempts is 0", async () => {
    const config: Config = { ...baseConfig, llmRetryAttempts: 0 };
    const result = await createChatModel(config);

    expect(mockWithRetry).not.toHaveBeenCalled();
    expect(result).toHaveProperty("_modelType", "mock-chat-model");
  });

  it("provides onFailedAttempt that re-throws non-transient errors", async () => {
    await createChatModel(baseConfig);

    const callArgs = mockWithRetry.mock.calls[0]?.[0] as { onFailedAttempt: (error: unknown) => void };
    const onFailedAttempt = callArgs.onFailedAttempt;

    // Non-transient error should be re-thrown
    const authError = new Error("401 Unauthorized");
    expect(() => onFailedAttempt(authError)).toThrow("401 Unauthorized");

    // Transient error should not be thrown
    const serviceError = new Error("ServiceUnavailableException: Bedrock is unable to process your request");
    expect(() => onFailedAttempt(serviceError)).not.toThrow();
  });
});

describe("isTransientError", () => {
  const testCases = [
    // Transient errors (should return true)
    { description: "ServiceUnavailableException in message", error: new Error("ServiceUnavailableException: Bedrock is unable to process your request"), expected: true },
    { description: "ThrottlingException in message", error: new Error("ThrottlingException: Rate exceeded"), expected: true },
    { description: "429 in message", error: new Error("429 Too Many Requests"), expected: true },
    { description: "rate limit in message", error: new Error("rate limit exceeded"), expected: true },
    { description: "ModelStreamErrorException in message", error: new Error("ModelStreamErrorException"), expected: true },
    { description: "overloaded in message", error: new Error("Model is overloaded"), expected: true },
    { description: "ECONNRESET in message", error: new Error("read ECONNRESET"), expected: true },
    { description: "ETIMEDOUT in message", error: new Error("connect ETIMEDOUT"), expected: true },
    { description: "socket hang up in message", error: new Error("socket hang up"), expected: true },

    // Non-transient errors (should return false)
    { description: "401 authentication error", error: new Error("401 Unauthorized"), expected: false },
    { description: "generic error", error: new Error("Something went wrong"), expected: false },
    { description: "GraphRecursionError", error: new Error("Recursion limit of 500 reached"), expected: false },
    { description: "API key error", error: new Error("Invalid API key"), expected: false },
    { description: "validation error", error: new Error("ValidationException: invalid input"), expected: false },
  ];

  it.each(testCases)("returns $expected for $description", ({ error, expected }) => {
    expect(isTransientError(error)).toBe(expected);
  });

  it("returns true when error constructor name is ServiceUnavailableException", () => {
    const error = new Error("Bedrock is unable to process your request");
    Object.defineProperty(error, "constructor", {
      value: { name: "ServiceUnavailableException" },
    });
    expect(isTransientError(error)).toBe(true);
  });
});

describe("TransientLLMError", () => {
  it("is an instance of Error", () => {
    const error = new TransientLLMError("service unavailable");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TransientLLMError);
  });

  it("has name set to TransientLLMError", () => {
    const error = new TransientLLMError("service unavailable");
    expect(error.name).toBe("TransientLLMError");
  });

  it("preserves the original error as cause", () => {
    const original = new Error("ServiceUnavailableException: Bedrock is unable to process your request");
    const error = new TransientLLMError(original.message, { cause: original });
    expect(error.message).toBe(original.message);
    expect(error.cause).toBe(original);
  });
});
