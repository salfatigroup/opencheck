import { initChatModel } from "langchain/chat_models/universal";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Config } from "../config/types.ts";

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
 * Creates a LangChain chat model from config using initChatModel.
 * Supports all LangChain providers: anthropic (default), bedrock, google-vertexai, openai, etc.
 * Provider is inferred from model name when possible; use modelProvider to override.
 *
 * When llmRetryAttempts > 0, wraps the model with .withRetry() to transparently retry
 * transient errors (e.g. Bedrock ServiceUnavailableException) with exponential backoff.
 *
 * Provider setup:
 *   - anthropic: ANTHROPIC_API_KEY env var (already in package.json)
 *   - bedrock: AWS credentials + install @langchain/aws
 *   - google-vertexai: GOOGLE_APPLICATION_CREDENTIALS + install @langchain/google-vertexai
 */
export async function createChatModel(config: Config): Promise<BaseChatModel> {
  const model = await initChatModel(config.model, {
    ...(config.modelProvider ? { modelProvider: config.modelProvider } : {}),
  });

  const retryAttempts = config.llmRetryAttempts ?? 3;
  if (retryAttempts === 0) {
    return model;
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
