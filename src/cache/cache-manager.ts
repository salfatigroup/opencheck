import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { CacheEntry, CachedStep } from "./types.ts";

/**
 * Manages file-based cache entries for test step recordings.
 * Each entry is a JSON file keyed by a deterministic hash of (testCase + baseUrl).
 */
export class CacheManager {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  /**
   * Generate a deterministic 16-char hex hash key.
   * @param testCase - The test case description
   * @param baseUrl - The base URL for the test
   */
  static hashKey(testCase: string, baseUrl: string): string {
    const input = `${testCase}|${baseUrl}`;
    return createHash("sha256").update(input).digest("hex").slice(0, 16);
  }

  /**
   * Save a cache entry for the given test case.
   * Creates the cache directory if it does not exist.
   */
  async save(testCase: string, baseUrl: string, steps: CachedStep[]): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });

    const hash = CacheManager.hashKey(testCase, baseUrl);
    const now = new Date().toISOString();

    const existing = await this.load(testCase, baseUrl);

    const entry: CacheEntry = {
      version: 1,
      testCase,
      baseUrl,
      steps,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const filePath = join(this.cacheDir, `${hash}.json`);
    await writeFile(filePath, JSON.stringify(entry, null, 2), "utf-8");
  }

  /**
   * Load a cache entry for the given test case.
   * @returns The cache entry, or null if not found or corrupt
   */
  async load(testCase: string, baseUrl: string): Promise<CacheEntry | null> {
    const hash = CacheManager.hashKey(testCase, baseUrl);
    const filePath = join(this.cacheDir, `${hash}.json`);

    try {
      const content = await readFile(filePath, "utf-8");
      return JSON.parse(content) as CacheEntry;
    } catch {
      return null;
    }
  }

  /**
   * Delete a cache entry for the given test case.
   * No-op if the entry does not exist.
   */
  async delete(testCase: string, baseUrl: string): Promise<void> {
    const hash = CacheManager.hashKey(testCase, baseUrl);
    const filePath = join(this.cacheDir, `${hash}.json`);

    try {
      await unlink(filePath);
    } catch {
      // No-op if file doesn't exist
    }
  }
}
