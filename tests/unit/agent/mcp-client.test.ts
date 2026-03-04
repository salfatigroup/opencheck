import { describe, it, expect } from "vitest";
import { buildMcpServerConfig } from "../../../src/agent/mcp-client.ts";
import type { Config } from "../../../src/config/types.ts";

describe("buildMcpServerConfig", () => {
  const baseConfig: Config = {
    baseUrl: "http://localhost:3000",
    browser: "chromium",
    headless: true,
    timeout: 60000,
    maxAttempts: 3,
    cacheDir: ".opencheck-cache",
    model: "claude-sonnet-4-5-20250929",
    recursionLimit: 500,
    tests: [{ case: "check login" }],
  };

  it("returns config with playwright server", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config).toHaveProperty("mcpServers");
    expect(config.mcpServers).toHaveProperty("playwright");
    expect(config.mcpServers["playwright"]!.transport).toBe("stdio");
    expect(config.mcpServers["playwright"]!.command).toBe("npx");
  });

  it("includes headless flag when config.headless is true", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config.mcpServers["playwright"]!.args).toContain("--headless");
  });

  it("omits headless flag when config.headless is false", () => {
    const config = buildMcpServerConfig({ ...baseConfig, headless: false });
    expect(config.mcpServers["playwright"]!.args).not.toContain("--headless");
  });

  it("includes browser flag from config", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config.mcpServers["playwright"]!.args.some((a) => a.includes("chromium"))).toBe(true);
  });

  it("uses the specified browser variant", () => {
    const config = buildMcpServerConfig({ ...baseConfig, browser: "firefox" });
    expect(config.mcpServers["playwright"]!.args).toContain("--browser=firefox");
  });

  it("includes curl server for API testing", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config.mcpServers).toHaveProperty("curl");
    expect(config.mcpServers["curl"]!.transport).toBe("stdio");
    expect(config.mcpServers["curl"]!.command).toBe("npx");
  });

  it("curl server uses correct package", () => {
    const config = buildMcpServerConfig(baseConfig);
    expect(config.mcpServers["curl"]!.args).toContain("@mcp-get-community/server-curl");
  });

  it("includes both playwright and curl servers simultaneously", () => {
    const config = buildMcpServerConfig(baseConfig);
    const serverNames = Object.keys(config.mcpServers);
    expect(serverNames).toContain("playwright");
    expect(serverNames).toContain("curl");
    expect(serverNames).toHaveLength(2);
  });
});
