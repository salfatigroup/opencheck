import { describe, it, expect } from "vitest";
import { buildMcpServerConfig } from "../../../src/agent/mcp-client.ts";
import type { Config } from "../../../src/config/types.ts";

describe("buildMcpServerConfig", () => {
  const baseConfig: Config = {
    baseUrl: "http://localhost:3000",
    browser: "chromium",
    headless: true,
    sessionMode: "isolated",
    timeout: 60000,
    maxAttempts: 3,
    cacheDir: ".opencheck-cache",
    model: "claude-sonnet-4-5-20250929",
    recursionLimit: 500,
    recording: false,
    bailOnFailure: false,
    showTrace: true,
    secrets: [],
    tests: [{ case: "check login" }],
  };

  it("returns config with playwright server", () => {
    const config = buildMcpServerConfig(baseConfig);
    const playwrightServer = config.mcpServers["playwright"];
    expect(config).toHaveProperty("mcpServers");
    expect(config.mcpServers).toHaveProperty("playwright");
    expect(playwrightServer).toBeDefined();
    expect(playwrightServer?.transport).toBe("stdio");
    // Command is "node" when Playwright MCP CLI resolves locally, "npx" otherwise
    expect(["npx", "node"]).toContain(playwrightServer?.command);
  });

  it("includes headless flag when config.headless is true", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config.mcpServers["playwright"]?.args).toContain("--headless");
  });

  it("uses isolated sessions by default", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config.mcpServers["playwright"]?.args).toContain("--isolated");
  });

  it("omits headless flag when config.headless is false", () => {
    const config = buildMcpServerConfig({ ...baseConfig, headless: false });
    expect(config.mcpServers["playwright"]?.args).not.toContain("--headless");
  });

  it("includes browser flag from config", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config.mcpServers["playwright"]?.args.some((a) => a.includes("chromium"))).toBe(true);
  });

  it("uses the specified browser variant", () => {
    const config = buildMcpServerConfig({ ...baseConfig, browser: "firefox" });
    expect(config.mcpServers["playwright"]?.args).toContain("--browser=firefox");
  });

  it("passes user data dir for persistent sessions", () => {
    const config = buildMcpServerConfig(
      { ...baseConfig, sessionMode: "persistent" },
      { userDataDir: "/tmp/opencheck-profile" },
    );

    expect(config.mcpServers["playwright"]?.args).toContain("--user-data-dir=/tmp/opencheck-profile");
    expect(config.mcpServers["playwright"]?.args).not.toContain("--isolated");
  });

  it("returns only the playwright server", () => {
    const config = buildMcpServerConfig(baseConfig);
    const serverNames = Object.keys(config.mcpServers);
    expect(serverNames).toContain("playwright");
    expect(serverNames).toHaveLength(1);
  });

  it("includes recording flags when recording is enabled", () => {
    const config = buildMcpServerConfig({ ...baseConfig, recording: true });
    const args = config.mcpServers["playwright"]!.args;
    expect(args).toContain("--save-trace");
    expect(args.some((a) => a.startsWith("--save-video="))).toBe(true);
  });

  it("omits recording flags when recording is disabled", () => {
    const config = buildMcpServerConfig(baseConfig);
    const args = config.mcpServers["playwright"]!.args;
    expect(args).not.toContain("--save-trace");
    expect(args.some((a) => a.startsWith("--save-video="))).toBe(false);
  });

  it("includes output-dir when recording is enabled and outputDir is provided", () => {
    const config = buildMcpServerConfig({ ...baseConfig, recording: true }, "/tmp/recordings");
    const args = config.mcpServers["playwright"]!.args;
    expect(args).toContain("--output-dir");
    expect(args).toContain("/tmp/recordings");
  });

  it("includes only trace when recording is { trace: true, video: false }", () => {
    const config = buildMcpServerConfig({ ...baseConfig, recording: { trace: true, video: false } });
    const args = config.mcpServers["playwright"]!.args;
    expect(args).toContain("--save-trace");
    expect(args.some((a) => a.startsWith("--save-video="))).toBe(false);
  });

  it("includes only video when recording is { trace: false, video: true }", () => {
    const config = buildMcpServerConfig({ ...baseConfig, recording: { trace: false, video: true } });
    const args = config.mcpServers["playwright"]!.args;
    expect(args).not.toContain("--save-trace");
    expect(args.some((a) => a.startsWith("--save-video="))).toBe(true);
  });

  it("includes both trace and video when recording is { trace: true, video: true }", () => {
    const config = buildMcpServerConfig({ ...baseConfig, recording: { trace: true, video: true } });
    const args = config.mcpServers["playwright"]!.args;
    expect(args).toContain("--save-trace");
    expect(args.some((a) => a.startsWith("--save-video="))).toBe(true);
  });

  it("omits recording flags when recording is { trace: false, video: false }", () => {
    const config = buildMcpServerConfig({ ...baseConfig, recording: { trace: false, video: false } });
    const args = config.mcpServers["playwright"]!.args;
    expect(args).not.toContain("--save-trace");
    expect(args.some((a) => a.startsWith("--save-video="))).toBe(false);
  });

  it("does not include --no-show-trace when showTrace is false (not yet supported by @playwright/mcp)", () => {
    const config = buildMcpServerConfig({ ...baseConfig, showTrace: false });
    // --no-show-trace is not yet supported by @playwright/mcp, so config is accepted but flag is not emitted
    expect(config.mcpServers["playwright"]!.args).not.toContain("--no-show-trace");
  });

  it("omits --no-show-trace when showTrace is true (default)", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config.mcpServers["playwright"]!.args).not.toContain("--no-show-trace");
  });
});
