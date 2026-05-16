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
sessionMode: "isolated"
timeout: 60000
maxAttempts: 3
cacheDir: ".opencheck-cache"
recording: true
model: "claude-sonnet-4-5-20250929"
modelProvider: "anthropic"  # optional — auto-inferred for most models
tests:
  - case: "check login is working"
    name: "#login"
  - case: "#login, then verify dashboard loads after login"
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
| `sessionMode` | `"isolated" \| "persistent"` | `"isolated"` | Browser session mode. `isolated` starts from a clean browser profile. `persistent` reuses one temporary profile for the duration of a single OpenCheck run. |
| `timeout` | `number` (ms) | `60000` | Per-test timeout in milliseconds. Must be positive. |
| `maxAttempts` | `number` (1-10) | `3` | Max AI retry attempts per test before marking as failed. |
| `cacheDir` | `string` | `".opencheck-cache"` | Directory for cached step recordings. |
| `recording` | `boolean` | `true` | Enable Playwright trace and video recording per test. Saves to `.opencheck-recordings/`. Set `false` to disable. |
| `model` | `string` | `"claude-sonnet-4-5-20250929"` | LLM model identifier for the AI agent. |
| `modelProvider` | `string` | _(auto-inferred)_ | LangChain provider name. Required for Bedrock; auto-inferred for Anthropic, OpenAI, etc. See [Providers](../README.md#providers). |
| `fallbackModels` | `FallbackModel[]` | `[]` | Ordered list of fallback LLMs. The agent fails over to the next entry when the primary errors (e.g. 429 rate-limit, transient provider failure). See [Fallback Models](#fallback-models). |
| `llmRetryAttempts` | `number` (0-10) | `3` | How many times to retry transient LLM errors (429, 503, network) per model before falling through to the next fallback. Set to `0` to disable retries. |
| `tests` | `TestCase[]` | _(required)_ | Array of test cases. Must have at least one entry. |

### Test Case Fields

Each entry in the `tests` array supports:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `case` | `string` | _(required)_ | Natural language description of what to test. The AI auto-selects browser or API tools based on this. |
| `name` | `string` | _(none)_ | Optional name for referencing a test case from another case, e.g. `#login`. |
| `baseUrl` | `string` (URL) | _(inherits top-level)_ | Override the base URL for this specific test. |
| `timeout` | `number` (ms) | _(inherits top-level)_ | Override the timeout for this specific test. |

## Fallback Models

Configure one or more fallback LLMs that the agent will try in order when the primary model errors out. The common case: your primary provider (e.g. Groq) hits a rate limit, and you want the run to continue on OpenRouter or another provider without aborting the suite.

```yaml
model: "llama-3.3-70b-versatile"
modelProvider: "groq"
fallbackModels:
  - model: "anthropic/claude-sonnet-4.5"
    modelProvider: "openai"
    baseUrl: "https://openrouter.ai/api/v1"
    apiKey: "${OPENROUTER_API_KEY}"
```

### How it works

1. The agent tries the primary model.
2. On a transient error (429, 503, network blip, etc.), the primary's own retry (`llmRetryAttempts`, default `3`) kicks in.
3. If the retries are exhausted — or the error is non-transient (e.g. 401) — the next entry in `fallbackModels` is tried, with its own retry budget.
4. The chain continues until a model succeeds or all fallbacks are exhausted.

### Fields

Each entry in `fallbackModels` supports:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `string` | _(required)_ | Model identifier. Format depends on provider (e.g. `anthropic/claude-sonnet-4.5` for OpenRouter via OpenAI-compatible API). |
| `modelProvider` | `string` | _(auto-inferred)_ | LangChain provider name. Use `openai` for OpenRouter and any other OpenAI-compatible gateway. |
| `baseUrl` | `string` (URL) | _(provider default)_ | Override the upstream HTTP endpoint. For `openai`/`azure_openai` this maps to the SDK's `configuration.baseURL`; other providers receive `baseUrl` directly. |
| `apiKey` | `string` | _(env var)_ | API key for this fallback only. Use `${VAR}` interpolation to pull from env. |

### Notes

- **OpenRouter:** Use `modelProvider: "openai"` (OpenRouter is OpenAI-compatible). Install `@langchain/openai` if not already present: `bun add @langchain/openai`.
- **Multi-tier fallback:** List as many entries as you want — they're tried top-to-bottom.
- **All errors trigger fallback:** Including non-transient errors like `401 Unauthorized`. This keeps your suite running through misconfigured primaries, but watch the logs on first-run to catch credential mistakes early.

## Named References

Named test cases let you keep config simple while still reusing intent:

```yaml
tests:
  - name: "#login"
    case: "Navigate to portal dashboard, and login with testuser+clerk_test@example.com and OTP code 424242"
  - case: "#login, then navigate to search page, and search for 'Elon Musk'"
```

OpenCheck does not expand these references in the runner. Instead, during an AI execution the agent is instructed to use an internal lookup tool to resolve references like `#login` or `{login}` before acting. Cached runs still replay the browser steps directly.

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
- **Invalid sessionMode** - Must be `isolated` or `persistent`
- **`maxAttempts` out of range** - Must be between 1 and 10

## Minimal Config

The simplest valid config only needs the `tests` array:

```yaml
tests:
  - case: "check the homepage loads"
```

All other fields will use their defaults.
