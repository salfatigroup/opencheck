# Cache System

OpenCheck caches successful test steps so subsequent runs are fast and deterministic.

## Location

By default, cache files are stored in `.opencheck-cache/` in your project root. You can change this with the `cacheDir` config option:

```yaml
cacheDir: ".my-custom-cache"
```

## Cache Keys

Each test case gets a unique cache file based on a deterministic hash:

```
SHA-256(testCase.case + "|" + resolvedBaseUrl)
```

The hash is truncated to 16 hex characters. Example:

```
.opencheck-cache/
  a1b2c3d4e5f6g7h8.json
  f9e8d7c6b5a49382.json
```

This means:
- Changing the test case description invalidates the cache
- Changing the base URL invalidates the cache
- Two tests with the same description but different base URLs get separate caches

## Cache File Format

Each cache file is human-readable JSON:

```json
{
  "version": 1,
  "testCase": "check login is working",
  "baseUrl": "http://localhost:3000",
  "steps": [
    {
      "toolName": "browser_navigate",
      "toolInput": { "url": "http://localhost:3000" }
    },
    {
      "toolName": "browser_snapshot",
      "toolInput": {}
    },
    {
      "toolName": "browser_type",
      "toolInput": { "selector": "#username", "text": "admin" }
    },
    {
      "toolName": "browser_click",
      "toolInput": { "selector": "#login-btn" }
    }
  ],
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z"
}
```

## Clearing the Cache

To force all tests to re-run via AI, delete the cache directory:

```bash
rm -rf .opencheck-cache
```

To clear a single test's cache, find and delete its JSON file. The file names are hash-based, but the `testCase` field inside each file identifies which test it belongs to.

## .gitignore

Add the cache directory to your `.gitignore`:

```
.opencheck-cache/
```

Cache files are environment-specific (they contain steps tied to your exact UI state) and should not be shared across machines.

## Cache Lifecycle

| Event | Cache Action |
|-------|-------------|
| AI test passes (first run) | Steps saved to new cache file |
| Cached replay succeeds | No change (cache reused) |
| Cached replay fails, AI retries and succeeds | Cache updated with new steps |
| Cached replay fails, AI retries and fails | Stale cache deleted |
| AI test fails (no prior cache) | No cache file created |
