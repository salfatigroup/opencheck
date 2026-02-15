import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../../src/config/loader.ts";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencheck-loader-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads and parses a valid YAML config file", async () => {
    const configPath = join(tempDir, "tests.yaml");
    await writeFile(
      configPath,
      `baseUrl: "http://localhost:3000"
tests:
  - case: "check login is working"
  - case: "verify dashboard loads"
`
    );

    const config = await loadConfig(configPath);
    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.tests).toHaveLength(2);
    expect(config.tests[0]?.case).toBe("check login is working");
    expect(config.browser).toBe("chromium"); // default
  });

  it("applies default values when optional fields are omitted", async () => {
    const configPath = join(tempDir, "tests.yaml");
    await writeFile(
      configPath,
      `tests:
  - case: "basic test"
`
    );

    const config = await loadConfig(configPath);
    expect(config.browser).toBe("chromium");
    expect(config.headless).toBe(true);
    expect(config.timeout).toBe(60000);
    expect(config.maxAttempts).toBe(3);
    expect(config.cacheDir).toBe(".opencheck-cache");
  });

  it("throws ConfigLoadError for missing file", async () => {
    const missing = join(tempDir, "missing.yaml");
    await expect(loadConfig(missing)).rejects.toThrow("Config file not found");
  });

  it("throws ConfigLoadError for malformed YAML", async () => {
    const configPath = join(tempDir, "bad.yaml");
    await writeFile(configPath, `{{{invalid yaml`);
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("throws ConfigLoadError for schema validation failure", async () => {
    const configPath = join(tempDir, "invalid.yaml");
    await writeFile(configPath, `baseUrl: "http://localhost:3000"\n`);
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("throws ConfigLoadError for empty tests array", async () => {
    const configPath = join(tempDir, "empty-tests.yaml");
    await writeFile(configPath, `tests: []\n`);
    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it("passes through per-test overrides", async () => {
    const configPath = join(tempDir, "tests.yaml");
    await writeFile(
      configPath,
      `baseUrl: "http://localhost:3000"
tests:
  - case: "login test"
    baseUrl: "http://localhost:4000"
    timeout: 30000
`
    );

    const config = await loadConfig(configPath);
    expect(config.tests[0]?.baseUrl).toBe("http://localhost:4000");
    expect(config.tests[0]?.timeout).toBe(30000);
  });
});
