import { initChatModel } from "langchain/chat_models/universal";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Config, FallbackModel } from "../config/types.ts";

/**
 * Custom error indicating a transient LLM provider failure (e.g. Bedrock 503).
 * Used for instanceof checks in error handling instead of string matching.
 */
export class TransientLLMError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransientLLMError";
  }
}

/**
 * Classify whether an error is transient and worth retrying.
 * Covers Bedrock service errors, throttling, and network transients.
 */
export function isTransientError(error: Error): boolean {
  const message = error.message ?? "";
  const name = error.constructor?.name ?? error.name ?? "";

  // Bedrock 503
  if (name === "ServiceUnavailableException" || message.includes("ServiceUnavailableException")) {
    return true;
  }
  // Bedrock/general throttling
  if (message.includes("ThrottlingException") || message.includes("429") || message.includes("rate limit")) {
    return true;
  }
  // Bedrock model overloaded
  if (message.includes("ModelStreamErrorException") || message.includes("overloaded")) {
    return true;
  }
  // Network transient
  if (message.includes("ECONNRESET") || message.includes("ETIMEDOUT") || message.includes("socket hang up")) {
    return true;
  }

  return false;
}

/**
 * Specification for a single chat model (primary or fallback).
 */
type ModelSpec = {
  model: string;
  modelProvider?: string;
  baseUrl?: string;
  apiKey?: string;
};

/**
 * Build the options bag for initChatModel from a ModelSpec.
 * OpenAI-style providers expect `configuration.baseURL` for the upstream HTTP endpoint;
 * other providers (Anthropic, Groq, etc.) accept `baseUrl` directly.
 */
export function buildInitOptions(spec: Omit<ModelSpec, "model">): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  if (spec.modelProvider) options.modelProvider = spec.modelProvider;
  if (spec.apiKey) options.apiKey = spec.apiKey;
  if (spec.baseUrl) {
    if (spec.modelProvider === "openai" || spec.modelProvider === "azure_openai") {
      options.configuration = { baseURL: spec.baseUrl };
    } else {
      options.baseUrl = spec.baseUrl;
    }
  }
  return options;
}

/**
 * Build a single model with optional retry wrapping. The retry's onFailedAttempt
 * re-throws non-transient errors so they bubble straight to the fallback chain
 * without burning extra attempts.
 */
async function buildSingleModel(spec: ModelSpec, retryAttempts: number): Promise<BaseChatModel> {
  const model = await initChatModel(spec.model, buildInitOptions(spec));
  if (retryAttempts === 0) {
    return model as unknown as BaseChatModel;
  }
  return model.withRetry({
    stopAfterAttempt: retryAttempts,
    onFailedAttempt: (error: unknown) => {
      if (!(error instanceof Error) || !isTransientError(error)) {
        throw error;
      }
    },
  }) as unknown as BaseChatModel;
}

/**
 * Creates a LangChain chat model from config using initChatModel.
 * Supports all LangChain providers: anthropic (default), bedrock, google-vertexai, openai, etc.
 * Provider is inferred from model name when possible; use modelProvider to override.
 *
 * When llmRetryAttempts > 0, wraps the model with .withRetry() to transparently retry
 * transient errors (e.g. Bedrock ServiceUnavailableException) with exponential backoff.
 *
 * When fallbackModels is non-empty, wraps the primary with .withFallbacks() so the agent
 * fails over to the next model when the primary's retries are exhausted (or it hits a
 * non-transient error like 429/401). Each fallback is independently retry-wrapped.
 *
 * Provider setup:
 *   - anthropic: ANTHROPIC_API_KEY env var (already in package.json)
 *   - bedrock: AWS credentials + install @langchain/aws
 *   - google-vertexai: GOOGLE_APPLICATION_CREDENTIALS + install @langchain/google-vertexai
 */
export async function createChatModel(config: Config): Promise<BaseChatModel> {
  const retryAttempts = config.llmRetryAttempts ?? 3;
  const primary = await buildSingleModel(
    { model: config.model, modelProvider: config.modelProvider },
    retryAttempts,
  );

  const fallbackSpecs: FallbackModel[] = config.fallbackModels ?? [];
  if (fallbackSpecs.length === 0) {
    return primary;
  }

  const fallbacks = await Promise.all(
    fallbackSpecs.map((spec) => buildSingleModel(spec, retryAttempts)),
  );

  return (primary as unknown as { withFallbacks: (opts: { fallbacks: BaseChatModel[] }) => BaseChatModel })
    .withFallbacks({ fallbacks });
}
