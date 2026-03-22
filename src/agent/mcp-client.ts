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
 * @param outputDir - Optional per-test output directory for recordings
 */
export function buildMcpServerConfig(config: Config, outputDir?: string): McpServerConfig {
  const playwrightCliPath = resolvePlaywrightMcp();
  const playwrightArgs: string[] = [];

  if (playwrightCliPath) {
    playwrightArgs.push(playwrightCliPath);
  } else {
    playwrightArgs.push("-y", "@playwright/mcp@latest");
  }

  if (config.headless) {
    playwrightArgs.push("--headless");
  }

  playwrightArgs.push(`--browser=${config.browser}`);

  if (config.recording) {
    playwrightArgs.push("--save-trace");
    playwrightArgs.push("--save-video=1280x720");
    if (outputDir) {
      playwrightArgs.push("--output-dir", outputDir);
    }
  }

  const command = playwrightCliPath ? "node" : "npx";

  return {
    mcpServers: {
      playwright: {
        transport: "stdio" as const,
        command,
        args: playwrightArgs,
      },
    },
  };
}

/** Resolve the Playwright MCP CLI path from npx cache or node_modules */
function resolvePlaywrightMcp(): string | null {
  const { existsSync } = require("node:fs");
  const { join } = require("node:path");
  const { execSync } = require("node:child_process");

  // Check npx cache
  const npxCachePath = join(
    process.env.HOME ?? "",
    ".npm/_npx/9833c18b2d85bc59/node_modules/@playwright/mcp/cli.js",
  );
  if (existsSync(npxCachePath)) return npxCachePath;

  // Check local node_modules
  const localPath = join(process.cwd(), "node_modules/@playwright/mcp/cli.js");
  if (existsSync(localPath)) return localPath;

  return null;
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
