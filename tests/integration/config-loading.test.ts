import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { loadConfig, ConfigLoadError } from "../../src/config/loader.ts";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

describe("Config Loading (integration)", () => {
  it("loads a valid config file with all fields", async () => {
    const config = await loadConfig(join(FIXTURES, "valid-config.yaml"));

    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.browser).toBe("chromium");
    expect(config.headless).toBe(true);
    expect(config.sessionMode).toBe("persistent");
    expect(config.timeout).toBe(60000);
    expect(config.maxAttempts).toBe(3);
    expect(config.tests).toHaveLength(3);
    expect(config.tests[0]?.case).toBe("check login is working");
  });

  it("loads a minimal config and applies all defaults", async () => {
    const config = await loadConfig(join(FIXTURES, "minimal-config.yaml"));

    expect(config.browser).toBe("chromium");
    expect(config.headless).toBe(true);
    expect(config.sessionMode).toBe("isolated");
    expect(config.timeout).toBe(60000);
    expect(config.maxAttempts).toBe(3);
    expect(config.cacheDir).toBe(".opencheck-cache");
    expect(config.model).toBe("claude-sonnet-4-5-20250929");
    expect(config.tests).toHaveLength(1);
    expect(config.tests[0]?.case).toBe("basic smoke test");
  });

  it("rejects an invalid config file with schema errors", async () => {
    await expect(
      loadConfig(join(FIXTURES, "invalid-config.yaml"))
    ).rejects.toThrow(ConfigLoadError);
  });

  it("rejects a malformed YAML file", async () => {
    await expect(
      loadConfig(join(FIXTURES, "malformed.yaml"))
    ).rejects.toThrow();
  });

  it("rejects a missing file with descriptive error", async () => {
    const missingPath = join(FIXTURES, "nonexistent.yaml");
    await expect(loadConfig(missingPath)).rejects.toThrow("Config file not found");
  });
});
