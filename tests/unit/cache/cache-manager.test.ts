import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CacheManager } from "../../../src/cache/cache-manager.ts";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CachedStep } from "../../../src/cache/types.ts";

describe("CacheManager", () => {
  let tempDir: string;
  let cacheManager: CacheManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencheck-cache-"));
    cacheManager = new CacheManager(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates a deterministic hash for a test case and baseUrl", () => {
    const hash1 = CacheManager.hashKey("check login", "http://localhost:3000");
    const hash2 = CacheManager.hashKey("check login", "http://localhost:3000");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it("generates different hashes for different inputs", () => {
    const hash1 = CacheManager.hashKey("check login", "http://localhost:3000");
    const hash2 = CacheManager.hashKey("check logout", "http://localhost:3000");
    expect(hash1).not.toBe(hash2);
  });

  it("saves a cache entry to disk", async () => {
    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
      { toolName: "browser_click", toolInput: { selector: "#login" } },
    ];

    await cacheManager.save("check login", "http://localhost:3000", steps);

    const files = await readdir(tempDir);
    expect(files.length).toBeGreaterThan(0);
  });

  it("loads a previously saved cache entry", async () => {
    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    ];

    await cacheManager.save("check login", "http://localhost:3000", steps);
    const entry = await cacheManager.load("check login", "http://localhost:3000");

    expect(entry).not.toBeNull();
    expect(entry?.steps).toEqual(steps);
    expect(entry?.testCase).toBe("check login");
    expect(entry?.baseUrl).toBe("http://localhost:3000");
    expect(entry?.version).toBe(1);
  });

  it("returns null for a missing cache entry", async () => {
    const entry = await cacheManager.load("nonexistent", "http://localhost:3000");
    expect(entry).toBeNull();
  });

  it("deletes a cache entry", async () => {
    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    ];

    await cacheManager.save("check login", "http://localhost:3000", steps);
    await cacheManager.delete("check login", "http://localhost:3000");

    const entry = await cacheManager.load("check login", "http://localhost:3000");
    expect(entry).toBeNull();
  });

  it("delete is a no-op for missing entries", async () => {
    await expect(
      cacheManager.delete("nonexistent", "http://localhost:3000")
    ).resolves.toBeUndefined();
  });

  it("saves cache entry as valid JSON", async () => {
    const steps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    ];

    await cacheManager.save("check login", "http://localhost:3000", steps);

    const hash = CacheManager.hashKey("check login", "http://localhost:3000");
    const filePath = join(tempDir, `${hash}.json`);
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed).toHaveProperty("version", 1);
    expect(parsed).toHaveProperty("testCase", "check login");
    expect(parsed).toHaveProperty("steps");
    expect(parsed).toHaveProperty("createdAt");
    expect(parsed).toHaveProperty("updatedAt");
  });
});
