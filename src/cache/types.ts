/** A single recorded step from an MCP tool invocation */
export interface CachedStep {
  toolName: string;
  toolInput: Record<string, unknown>;
}

/** A complete cache entry for a test case */
export interface CacheEntry {
  version: 1;
  testCase: string;
  baseUrl: string;
  steps: CachedStep[];
  createdAt: string;
  updatedAt: string;
}
