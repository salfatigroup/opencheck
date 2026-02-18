import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { Config } from "../config/types.ts";

/** MCP server entry configuration */
interface McpServerEntry {
  transport: "stdio";
  command: string;
  args: string[];
}

/** MCP server configuration for MultiServerMCPClient */
export interface McpServerConfig {
  mcpServers: Record<string, McpServerEntry>;
}

/**
 * Build the MCP server configuration with both Playwright and curl servers.
 * The AI agent receives all tools and autonomously chooses which to use
 * based on the test case description.
 * @param config - The OpenCheck configuration
 */
export function buildMcpServerConfig(config: Config): McpServerConfig {
  const playwrightArgs = ["-y", "@playwright/mcp@latest"];

  if (config.headless) {
    playwrightArgs.push("--headless");
  }

  playwrightArgs.push(`--browser=${config.browser}`);

  return {
    mcpServers: {
      playwright: {
        transport: "stdio" as const,
        command: "npx",
        args: playwrightArgs,
      },
      curl: {
        transport: "stdio" as const,
        command: "npx",
        args: ["-y", "@mcp-get-community/server-curl"],
      },
    },
  };
}

/**
 * Create and initialize an MCP client with both browser and API tools.
 * @param config - The OpenCheck configuration
 * @returns Object with tools array and a cleanup function
 */
export async function createMcpClient(config: Config): Promise<{
  tools: DynamicStructuredTool[];
  cleanup: () => Promise<void>;
}> {
  const mcpConfig = buildMcpServerConfig(config);
  const client = new MultiServerMCPClient(mcpConfig);
  const tools = await client.getTools();

  return {
    tools,
    cleanup: async () => {
      await client.close();
    },
  };
}
