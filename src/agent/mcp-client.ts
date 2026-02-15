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
  mcpServers: { playwright: McpServerEntry };
}

/**
 * Build the MCP server configuration for Playwright.
 * Single source of truth for MCP config — used by both AgentFactory and createMcpClient.
 * @param config - The OpenCheck configuration
 */
export function buildMcpServerConfig(config: Config): McpServerConfig {
  const args = ["-y", "@playwright/mcp@latest"];

  if (config.headless) {
    args.push("--headless");
  }

  args.push(`--browser=${config.browser}`);

  return {
    mcpServers: {
      playwright: {
        transport: "stdio" as const,
        command: "npx",
        args,
      },
    },
  };
}

/**
 * Create and initialize an MCP client with Playwright tools.
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
