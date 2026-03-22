# Configuration Reference

OpenCheck is configured via a YAML file (default: `tests.yaml`). Pass it to the CLI with `--config`:

```bash
opencheck --config tests.yaml
```

## Full Example

```yaml
baseUrl: "http://localhost:3000"
browser: "chromium"
headless: true
timeout: 60000
maxAttempts: 3
cacheDir: ".opencheck-cache"
recording: false
model: "claude-sonnet-4-5-20250929"
modelProvider: "anthropic"  # optional — auto-inferred for most models
tests:
  - case: "check login is working"
  - case: "verify dashboard loads after login"
    baseUrl: "http://localhost:3000/dashboard"
    timeout: 30000
  - case: "GET /api/health returns 200"
```

## Fields

### Top-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `baseUrl` | `string` (URL) | _(none)_ | Base URL for all tests. Optional but recommended. |
| `browser` | `"chromium" \| "firefox" \| "webkit"` | `"chromium"` | Browser engine to use. |
| `headless` | `boolean` | `true` | Run browser in headless mode. Set `false` for debugging. |
| `timeout` | `number` (ms) | `60000` | Per-test timeout in milliseconds. Must be positive. |
| `maxAttempts` | `number` (1-10) | `3` | Max AI retry attempts per test before marking as failed. |
| `cacheDir` | `string` | `".opencheck-cache"` | Directory for cached step recordings. |
| `recording` | `boolean` | `false` | Enable Playwright trace and video recording per test. Saves to `.opencheck-recordings/`. |
| `model` | `string` | `"claude-sonnet-4-5-20250929"` | LLM model identifier for the AI agent. |
| `modelProvider` | `string` | _(auto-inferred)_ | LangChain provider name. Required for Bedrock; auto-inferred for Anthropic, OpenAI, etc. See [Providers](../README.md#providers). |
| `tests` | `TestCase[]` | _(required)_ | Array of test cases. Must have at least one entry. |

### Test Case Fields

Each entry in the `tests` array supports:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `case` | `string` | _(required)_ | Natural language description of what to test. The AI auto-selects browser or API tools based on this. |
| `baseUrl` | `string` (URL) | _(inherits top-level)_ | Override the base URL for this specific test. |
| `timeout` | `number` (ms) | _(inherits top-level)_ | Override the timeout for this specific test. |

## Validation

OpenCheck validates your config using [Zod](https://zod.dev) schemas. If validation fails, you'll see a descriptive error:

```
Error: Config validation failed:
  - tests: At least one test case is required
```

Common validation errors:
- **Missing `tests` array** - You must define at least one test case
- **Empty `case` string** - Each test case needs a non-empty description
- **Invalid URL** - `baseUrl` must be a valid URL (e.g., `http://localhost:3000`)
- **Invalid browser** - Must be `chromium`, `firefox`, or `webkit`
- **`maxAttempts` out of range** - Must be between 1 and 10

## Minimal Config

The simplest valid config only needs the `tests` array:

```yaml
tests:
  - case: "check the homepage loads"
```

All other fields will use their defaults.
