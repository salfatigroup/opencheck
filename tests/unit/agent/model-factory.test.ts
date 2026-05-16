import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../../src/config/types.ts";
import { buildInitOptions, createChatModel, isTransientError, TransientLLMError } from "../../../src/agent/model-factory.ts";

const mockWithFallbacks = vi.fn();
const mockWithRetry = vi.fn();

const buildMockModel = (label: string) => ({
  _modelType: label,
  invoke: vi.fn(),
  withRetry: mockWithRetry,
  withFallbacks: mockWithFallbacks,
});

const mockInitChatModel = vi.fn();

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
    fallbackModels: [],
    recursionLimit: 500,
    recording: false,
    bailOnFailure: false,
    viewportSize: "1280x720",
    secrets: [],
    tests: [{ case: "test" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRetry.mockImplementation(() => buildMockModel("retry-wrapped"));
    mockWithFallbacks.mockImplementation(() => buildMockModel("fallback-wrapped"));
    mockInitChatModel.mockImplementation(async () => buildMockModel("mock-chat-model"));
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
    expect(result).toHaveProperty("_modelType", "retry-wrapped");
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

  describe("fallbackModels", () => {
    it("does not wrap with .withFallbacks() when fallbackModels is empty", async () => {
      await createChatModel(baseConfig);
      expect(mockWithFallbacks).not.toHaveBeenCalled();
    });

    it("wraps the primary with .withFallbacks() when fallbackModels has entries", async () => {
      const config: Config = {
        ...baseConfig,
        fallbackModels: [
          { model: "anthropic/claude-sonnet-4.5", modelProvider: "openai" },
        ],
      };
      const result = await createChatModel(config);

      expect(mockWithFallbacks).toHaveBeenCalledTimes(1);
      const callArg = mockWithFallbacks.mock.calls[0]?.[0] as { fallbacks: unknown[] };
      expect(callArg.fallbacks).toHaveLength(1);
      expect(result).toHaveProperty("_modelType", "fallback-wrapped");
    });

    it("builds each fallback with initChatModel and the configured provider", async () => {
      const config: Config = {
        ...baseConfig,
        fallbackModels: [
          { model: "anthropic/claude-sonnet-4.5", modelProvider: "openai" },
          { model: "google/gemini-1.5-flash", modelProvider: "openai" },
        ],
      };
      await createChatModel(config);

      // 1 primary + 2 fallbacks = 3 initChatModel calls
      expect(mockInitChatModel).toHaveBeenCalledTimes(3);
      expect(mockInitChatModel).toHaveBeenNthCalledWith(
        2,
        "anthropic/claude-sonnet-4.5",
        expect.objectContaining({ modelProvider: "openai" }),
      );
      expect(mockInitChatModel).toHaveBeenNthCalledWith(
        3,
        "google/gemini-1.5-flash",
        expect.objectContaining({ modelProvider: "openai" }),
      );
    });

    it("retries each fallback independently when llmRetryAttempts > 0", async () => {
      const config: Config = {
        ...baseConfig,
        llmRetryAttempts: 2,
        fallbackModels: [
          { model: "fallback-a", modelProvider: "openai" },
          { model: "fallback-b", modelProvider: "openai" },
        ],
      };
      await createChatModel(config);

      // primary + 2 fallbacks each retry-wrapped
      expect(mockWithRetry).toHaveBeenCalledTimes(3);
      for (const call of mockWithRetry.mock.calls) {
        expect(call[0]).toMatchObject({ stopAfterAttempt: 2 });
      }
    });

    it("does not retry-wrap fallbacks when llmRetryAttempts is 0", async () => {
      const config: Config = {
        ...baseConfig,
        llmRetryAttempts: 0,
        fallbackModels: [{ model: "fallback-a", modelProvider: "openai" }],
      };
      await createChatModel(config);

      expect(mockWithRetry).not.toHaveBeenCalled();
      // Still wraps with fallbacks though
      expect(mockWithFallbacks).toHaveBeenCalledTimes(1);
    });

    it("passes apiKey through to initChatModel for fallbacks", async () => {
      const config: Config = {
        ...baseConfig,
        fallbackModels: [
          {
            model: "anthropic/claude-sonnet-4.5",
            modelProvider: "openai",
            apiKey: "sk-or-test-key",
          },
        ],
      };
      await createChatModel(config);

      expect(mockInitChatModel).toHaveBeenNthCalledWith(
        2,
        "anthropic/claude-sonnet-4.5",
        expect.objectContaining({ apiKey: "sk-or-test-key" }),
      );
    });

    it("maps baseUrl to configuration.baseURL for openai-compatible fallbacks (e.g. OpenRouter)", async () => {
      const config: Config = {
        ...baseConfig,
        fallbackModels: [
          {
            model: "anthropic/claude-sonnet-4.5",
            modelProvider: "openai",
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: "sk-or-test-key",
          },
        ],
      };
      await createChatModel(config);

      expect(mockInitChatModel).toHaveBeenNthCalledWith(
        2,
        "anthropic/claude-sonnet-4.5",
        expect.objectContaining({
          modelProvider: "openai",
          apiKey: "sk-or-test-key",
          configuration: { baseURL: "https://openrouter.ai/api/v1" },
        }),
      );
    });

    it("passes baseUrl directly for non-openai fallbacks", async () => {
      const config: Config = {
        ...baseConfig,
        fallbackModels: [
          {
            model: "claude-sonnet-4-5-20250929",
            modelProvider: "anthropic",
            baseUrl: "https://api.anthropic.com",
          },
        ],
      };
      await createChatModel(config);

      const callArgs = mockInitChatModel.mock.calls[1]?.[1] as Record<string, unknown>;
      expect(callArgs).toMatchObject({
        modelProvider: "anthropic",
        baseUrl: "https://api.anthropic.com",
      });
      expect(callArgs).not.toHaveProperty("configuration");
    });
  });
});

describe("buildInitOptions", () => {
  it("returns an empty object when no fields are set", () => {
    expect(buildInitOptions({})).toEqual({});
  });

  it("includes modelProvider when set", () => {
    expect(buildInitOptions({ modelProvider: "anthropic" })).toEqual({
      modelProvider: "anthropic",
    });
  });

  it("includes apiKey when set", () => {
    expect(buildInitOptions({ apiKey: "sk-test" })).toEqual({ apiKey: "sk-test" });
  });

  it("maps baseUrl to configuration.baseURL for openai provider", () => {
    expect(
      buildInitOptions({ modelProvider: "openai", baseUrl: "https://openrouter.ai/api/v1" }),
    ).toEqual({
      modelProvider: "openai",
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
    });
  });

  it("maps baseUrl to configuration.baseURL for azure_openai provider", () => {
    expect(
      buildInitOptions({ modelProvider: "azure_openai", baseUrl: "https://x.openai.azure.com" }),
    ).toEqual({
      modelProvider: "azure_openai",
      configuration: { baseURL: "https://x.openai.azure.com" },
    });
  });

  it("passes baseUrl directly for non-openai providers", () => {
    expect(
      buildInitOptions({ modelProvider: "groq", baseUrl: "https://api.groq.com" }),
    ).toEqual({
      modelProvider: "groq",
      baseUrl: "https://api.groq.com",
    });
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
