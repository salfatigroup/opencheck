import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadConfig, interpolateEnvVars } from "../../../src/config/loader.ts";
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
    expect(config.sessionMode).toBe("isolated");
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
    expect(config.sessionMode).toBe("isolated");
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

  it("loads sessionMode and optional test names when provided", async () => {
    const configPath = join(tempDir, "tests.yaml");
    await writeFile(
      configPath,
      `sessionMode: "persistent"
tests:
  - case: "login test"
    name: "#login"
`
    );

    const config = await loadConfig(configPath);
    expect(config.sessionMode).toBe("persistent");
    expect(config.tests[0]?.name).toBe("#login");
  });

  it("interpolates ${VAR} placeholders from environment variables", async () => {
    process.env["OPENCHECK_TEST_URL"] = "http://staging.example.com";
    const configPath = join(tempDir, "tests.yaml");
    await writeFile(
      configPath,
      `baseUrl: "\${OPENCHECK_TEST_URL}"
tests:
  - case: "test against staging"
`
    );

    const config = await loadConfig(configPath);
    expect(config.baseUrl).toBe("http://staging.example.com");
    delete process.env["OPENCHECK_TEST_URL"];
  });

  it("throws ConfigLoadError when config references unset env vars", async () => {
    delete process.env["OPENCHECK_NONEXISTENT_VAR"];
    const configPath = join(tempDir, "tests.yaml");
    await writeFile(
      configPath,
      `tests:
  - case: "hello \${OPENCHECK_NONEXISTENT_VAR}world"
`
    );

    await expect(loadConfig(configPath)).rejects.toThrow("Unset environment variable");
    await expect(loadConfig(configPath)).rejects.toThrow("OPENCHECK_NONEXISTENT_VAR");
  });
});

describe("interpolateEnvVars", () => {
  it("replaces ${VAR} syntax", () => {
    process.env["MY_VAR"] = "hello";
    expect(interpolateEnvVars("${MY_VAR} world")).toBe("hello world");
    delete process.env["MY_VAR"];
  });

  it("replaces $VAR syntax", () => {
    process.env["MY_VAR"] = "hello";
    expect(interpolateEnvVars("$MY_VAR world")).toBe("hello world");
    delete process.env["MY_VAR"];
  });

  it("throws ConfigLoadError for unset variables", () => {
    delete process.env["UNSET_VAR"];
    expect(() => interpolateEnvVars("${UNSET_VAR}")).toThrow("Unset environment variable");
    expect(() => interpolateEnvVars("${UNSET_VAR}")).toThrow("UNSET_VAR");
  });

  it("throws ConfigLoadError listing all unset variables", () => {
    delete process.env["MISSING_A"];
    delete process.env["MISSING_B"];
    expect(() => interpolateEnvVars("${MISSING_A} and ${MISSING_B}")).toThrow("MISSING_A, MISSING_B");
  });

  it("leaves text without variables unchanged", () => {
    expect(interpolateEnvVars("no variables here")).toBe("no variables here");
  });

  it("handles multiple variables in one string", () => {
    process.env["VAR_A"] = "foo";
    process.env["VAR_B"] = "bar";
    expect(interpolateEnvVars("${VAR_A}-${VAR_B}")).toBe("foo-bar");
    delete process.env["VAR_A"];
    delete process.env["VAR_B"];
  });
});
