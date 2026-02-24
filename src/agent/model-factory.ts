import { ChatAnthropic } from "@langchain/anthropic";
import { ChatBedrockConverse } from "@langchain/aws";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Config } from "../config/types.ts";

/**
 * Creates the appropriate LangChain chat model based on the configured provider.
 * @param config - The OpenCheck configuration
 * @returns A LangChain chat model instance (ChatAnthropic or ChatBedrockConverse)
 */
export function createChatModel(config: Config): BaseChatModel {
  switch (config.provider) {
    case "bedrock":
      return new ChatBedrockConverse({
        model: config.model,
        region: config.region,
      });
    case "anthropic":
      return new ChatAnthropic({ model: config.model });
  }
}
