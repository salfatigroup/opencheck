import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CacheManager } from "../../src/cache/cache-manager.ts";
import type { CachedStep } from "../../src/cache/types.ts";

describe("Cache Roundtrip (integration)", () => {
  let tempDir: string;
  let cache: CacheManager;

  const loginSteps: CachedStep[] = [
    { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    { toolName: "browser_type", toolInput: { selector: "#user", text: "admin" } },
    { toolName: "browser_click", toolInput: { selector: "#login-btn" } },
  ];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencheck-cache-int-"));
    cache = new CacheManager(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("saves and loads a cache entry with full fidelity", async () => {
    await cache.save("check login", "http://localhost:3000", loginSteps);
    const entry = await cache.load("check login", "http://localhost:3000");

    expect(entry).not.toBeNull();
    expect(entry?.version).toBe(1);
    expect(entry?.testCase).toBe("check login");
    expect(entry?.baseUrl).toBe("http://localhost:3000");
    expect(entry?.steps).toEqual(loginSteps);
    expect(entry?.createdAt).toBeTruthy();
    expect(entry?.updatedAt).toBeTruthy();
  });

  it("saves then deletes a cache entry", async () => {
    await cache.save("check login", "http://localhost:3000", loginSteps);
    await cache.delete("check login", "http://localhost:3000");

    const entry = await cache.load("check login", "http://localhost:3000");
    expect(entry).toBeNull();
  });

  it("isolates cache entries by test case name", async () => {
    const logoutSteps: CachedStep[] = [
      { toolName: "browser_click", toolInput: { selector: "#logout" } },
    ];

    await cache.save("check login", "http://localhost:3000", loginSteps);
    await cache.save("check logout", "http://localhost:3000", logoutSteps);

    const loginEntry = await cache.load("check login", "http://localhost:3000");
    const logoutEntry = await cache.load("check logout", "http://localhost:3000");

    expect(loginEntry?.steps).toEqual(loginSteps);
    expect(logoutEntry?.steps).toEqual(logoutSteps);
  });

  it("isolates cache entries by baseUrl", async () => {
    const altSteps: CachedStep[] = [
      { toolName: "browser_navigate", toolInput: { url: "http://localhost:4000" } },
    ];

    await cache.save("check login", "http://localhost:3000", loginSteps);
    await cache.save("check login", "http://localhost:4000", altSteps);

    const entry3000 = await cache.load("check login", "http://localhost:3000");
    const entry4000 = await cache.load("check login", "http://localhost:4000");

    expect(entry3000?.steps).toEqual(loginSteps);
    expect(entry4000?.steps).toEqual(altSteps);
  });
});
