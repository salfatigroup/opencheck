import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { Config } from "../config/types.ts";
import { resolveRecording } from "../config/types.ts";

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

/** Runtime MCP options derived by OpenCheck */
export interface McpRuntimeOptions {
  userDataDir?: string;
  supportedFlags?: ReadonlySet<string>;
}

// Flag surface of @playwright/mcp >=0.0.69 (post --save-trace/--save-video removal).
const MODERN_PLAYWRIGHT_MCP_FLAGS: ReadonlySet<string> = new Set([
  "--browser",
  "--headless",
  "--isolated",
  "--output-dir",
  "--save-session",
  "--user-data-dir",
  "--viewport-size",
]);

const flagCache = new Map<string, ReadonlySet<string>>();

/**
 * Build the MCP server configuration with both Playwright and curl servers.
 * The AI agent receives all tools and autonomously chooses which to use
 * based on the test case description.
 * @param config - The OpenCheck configuration
 * @param outputDir - Optional per-test output directory for recordings
 */
export function buildMcpServerConfig(
  config: Config,
  outputDir?: string,
): McpServerConfig;
export function buildMcpServerConfig(
  config: Config,
  runtimeOptions?: McpRuntimeOptions,
): McpServerConfig;
export function buildMcpServerConfig(
  config: Config,
  runtimeOptions: McpRuntimeOptions,
  outputDir?: string,
): McpServerConfig;
export function buildMcpServerConfig(
  config: Config,
  runtimeOptionsOrOutputDir: McpRuntimeOptions | string = {},
  outputDir?: string,
): McpServerConfig {
  const runtimeOptions =
    typeof runtimeOptionsOrOutputDir === "string" ? {} : runtimeOptionsOrOutputDir;
  const resolvedOutputDir =
    typeof runtimeOptionsOrOutputDir === "string" ? runtimeOptionsOrOutputDir : outputDir;
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

  if (config.sessionMode === "isolated") {
    playwrightArgs.push("--isolated");
  } else if (runtimeOptions.userDataDir) {
    playwrightArgs.push(`--user-data-dir=${runtimeOptions.userDataDir}`);
  }

  playwrightArgs.push(`--browser=${config.browser}`);
  playwrightArgs.push(`--viewport-size=${config.viewportSize}`);

  const rec = resolveRecording(config.recording);
  if (rec.trace || rec.video) {
    const supportedFlags = runtimeOptions.supportedFlags
      ?? getPlaywrightMcpFlags(playwrightCliPath);
    let wroteRecordingFlag = false;

    if (rec.trace) {
      if (supportedFlags.has("--save-trace")) {
        playwrightArgs.push("--save-trace");
        wroteRecordingFlag = true;
      } else if (supportedFlags.has("--save-session")) {
        console.warn(
          "[opencheck] @playwright/mcp >=0.0.69 removed --save-trace; falling back to --save-session.",
        );
        playwrightArgs.push("--save-session");
        wroteRecordingFlag = true;
      } else {
        console.warn(
          "[opencheck] Installed @playwright/mcp supports no known trace/session flag; skipping trace recording.",
        );
      }
    }

    if (rec.video) {
      if (supportedFlags.has("--save-video")) {
        playwrightArgs.push("--save-video=1280x720");
        wroteRecordingFlag = true;
      } else {
        console.warn(
          "[opencheck] @playwright/mcp >=0.0.69 removed --save-video; "
            + "video is now a runtime tool (browser_start_video). Skipping CLI flag.",
        );
      }
    }

    if (resolvedOutputDir && wroteRecordingFlag && supportedFlags.has("--output-dir")) {
      playwrightArgs.push("--output-dir", resolvedOutputDir);
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

/** Probe `<cli> --help` once per process; fall back to modern flag set when unavailable. */
export function getPlaywrightMcpFlags(cliPath: string | null): ReadonlySet<string> {
  if (!cliPath) return MODERN_PLAYWRIGHT_MCP_FLAGS;

  const cached = flagCache.get(cliPath);
  if (cached) return cached;

  const probed = probePlaywrightMcpFlags(cliPath);
  flagCache.set(cliPath, probed);
  return probed;
}

function probePlaywrightMcpFlags(cliPath: string): ReadonlySet<string> {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync("node", [cliPath, "--help"], {
    encoding: "utf8",
    timeout: 5000,
  });

  const text = (result?.stdout ?? "") + (result?.stderr ?? "");
  if (!text) return MODERN_PLAYWRIGHT_MCP_FLAGS;

  const flags = new Set<string>();
  for (const line of text.split("\n")) {
    for (const token of line.split(/[\s,=]+/)) {
      const match = token.match(/^(--[a-z][a-z0-9-]*)/);
      if (match?.[1]) flags.add(match[1]);
    }
  }
  return flags.size > 0 ? flags : MODERN_PLAYWRIGHT_MCP_FLAGS;
}

/** Resolve the Playwright MCP CLI path from npx cache or node_modules */
function resolvePlaywrightMcp(): string | null {
  const { existsSync } = require("node:fs");
  const { join } = require("node:path");

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
export async function createMcpClient(
  config: Config,
  runtimeOptions: McpRuntimeOptions = {},
): Promise<{
  tools: DynamicStructuredTool[];
  cleanup: () => Promise<void>;
}> {
  const mcpConfig = buildMcpServerConfig(config, runtimeOptions);
  const client = new MultiServerMCPClient(mcpConfig);
  const tools = await client.getTools();

  return {
    tools,
    cleanup: async () => {
      await client.close();
    },
  };
}
