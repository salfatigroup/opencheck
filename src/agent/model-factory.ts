import { initChatModel } from "langchain/chat_models/universal";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Config } from "../config/types.ts";

/**
 * Creates a LangChain chat model from config using initChatModel.
 * Supports all LangChain providers: anthropic (default), bedrock, google-vertexai, openai, etc.
 * Provider is inferred from model name when possible; use modelProvider to override.
 *
 * Provider setup:
 *   - anthropic: ANTHROPIC_API_KEY env var (already in package.json)
 *   - bedrock: AWS credentials + install @langchain/aws
 *   - google-vertexai: GOOGLE_APPLICATION_CREDENTIALS + install @langchain/google-vertexai
 */
export async function createChatModel(config: Config): Promise<BaseChatModel> {
  return initChatModel(config.model, {
    ...(config.modelProvider ? { modelProvider: config.modelProvider } : {}),
  });
}
