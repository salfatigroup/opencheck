# OpenCheck

**AI-powered end-to-end browser testing, designed to be simple.**

By [Salfati Group](https://salfati.group) | [opencheck.ai](https://opencheck.ai)

---

Write test cases in plain English. An AI agent executes them in a real browser or via API calls. Successful steps are cached for instant replay on subsequent runs.

```yaml
# tests.yaml
baseUrl: "http://localhost:3000"
sessionMode: "isolated"
tests:
  - name: "#login"
    case: "check login is working"
  - case: "#login, then verify dashboard loads after login"
  - case: "check logout redirects to login page"
  - case: "GET /api/health returns 200"
```

```bash
opencheck --config tests.yaml
```

## Why OpenCheck?

Unlike tools like **browser-use** or raw **Playwright MCP**, OpenCheck is built from the ground up as a **testing framework** — not just a browser automation tool.

The key difference: **the cache layer**.

| Feature | OpenCheck | browser-use | Playwright MCP |
|---------|:---------:|:-----------:|:--------------:|
| Test framework (pass/fail, exit codes) | ✅ | ❌ | ❌ |
| **Step caching (instant replay)** | ✅ | ❌ | ❌ |
| Self-healing (auto-updates on UI change) | ✅ | ❌ | ❌ |
| Natural language test cases | ✅ | ✅ | ❌ |
| YAML config, zero code | ✅ | ❌ | ❌ |
| CI/CD ready (exit codes + summary) | ✅ | ❌ | ❌ |
| Browser + API testing (auto-detected) | ✅ | ❌ | ❌ |

### The cache makes E2E tests viable for CI/CD

Without caching, every AI-driven test takes **~10 seconds** (LLM reasoning + browser interaction). That's fine for 3 tests, but not for 30.

OpenCheck solves this: on the first run, the AI figures out the steps. On every subsequent run, those steps **replay in ~50ms** — no AI, no LLM calls, no cost. If the UI changes and the cached steps fail, the AI automatically re-executes and updates the cache.

```
First run:   AI agent → ~10s per test  (learns the steps)
Second run:  Cache replay → ~50ms per test  (instant, deterministic)
UI changed:  Cache fails → AI re-runs → ~10s → cache updated
```

This is what makes OpenCheck a **testing framework** rather than a demo tool.

## Quickstart

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- An LLM provider configured (see [Providers](#providers) below)
- Node.js 18+ (for Playwright MCP)

### Install

Run directly with no install:

```bash
bunx opencheck --config tests.yaml
```

Or install globally:

```bash
bun install -g opencheck
```

### Configure

Create a `tests.yaml`:

```yaml
baseUrl: "http://localhost:3000"
tests:
  - case: "check login is working"
  - case: "verify the homepage loads correctly"
```

### Run

```bash
# Make sure your app is running at baseUrl
opencheck --config tests.yaml
```

### What happens

1. OpenCheck loads and validates your `tests.yaml`
2. For each test case:
   - **Cached?** Replay stored steps instantly (no AI needed)
   - **No cache / cache stale?** AI agent drives the browser
   - **Named references?** The agent can resolve `#login`-style references through an internal lookup tool
   - **AI passes?** Steps saved to `.opencheck-cache/`
   - **AI fails after retries?** Test marked failed, stale cache deleted
3. Summary printed with pass/fail/cached counts and timing
4. Exit code `0` if all pass, `1` if any fail

## Test Recordings

Every test run records a Playwright trace and video by default:

```yaml
# tests.yaml
baseUrl: "http://localhost:3000"
tests:
  - case: "check login is working"
  - case: "verify dashboard loads after login"
```

Each test saves a **Playwright trace** and **video** to `.opencheck-recordings/<test-name>/`. Traces capture DOM snapshots, screenshots, network, and console at every step — ideal for debugging failed tests (expected vs actual).

To disable recordings, set `recording: false` in your `tests.yaml`.

### Viewing Recordings

**Locally:**

```bash
bunx playwright show-trace .opencheck-recordings/check-login-is-working/trace.zip
```

**Online (no install):**

Drag the `trace.zip` into [trace.playwright.dev](https://trace.playwright.dev).

**Videos:**

Open `.opencheck-recordings/<test-name>/video.webm` in any browser or media player.

### CI/CD (GitHub Actions)

Use the built-in reusable workflow. It runs OpenCheck, uploads recordings as artifacts, and posts results as a PR comment updated on each re-run:

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  pull_request:

jobs:
  opencheck:
    uses: salfatigroup/opencheck/.github/workflows/opencheck.yml@main
    with:
      config: tests.yaml
    secrets: inherit
```

Because recordings are enabled by default, trace and video artifacts will be uploaded automatically unless you set `recording: false`.

That's it. On each PR, you'll get:
- A **PR comment** with the full test results summary
- Downloadable **recording artifacts** (traces + videos) in the Actions run summary
- A direct link to view traces at [trace.playwright.dev](https://trace.playwright.dev)

#### Manual setup

If you prefer not to use the reusable workflow, add these steps directly:

```yaml
- name: Run OpenCheck
  run: bunx opencheck --config tests.yaml
  continue-on-error: true

- name: Upload test recordings
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: opencheck-recordings
    path: .opencheck-recordings/
    retention-days: 30
```

After the workflow completes, download the `opencheck-recordings` artifact from the GitHub Actions run summary. Extract it and view traces with:

```bash
bunx playwright show-trace trace.zip
```

Or drag `trace.zip` into [trace.playwright.dev](https://trace.playwright.dev) for browser-based viewing.
## Documentation

- [Configuration Reference](docs/configuration.md) — All `tests.yaml` options
- [How It Works](docs/how-it-works.md) — Architecture and AI strategy
- [Cache System](docs/cache.md) — How step caching works
- [CLI Reference](docs/cli.md) — Flags, exit codes, environment variables

## Providers

OpenCheck supports multiple LLM providers via LangChain's universal model interface. Set the `model` and optionally `modelProvider` in your `tests.yaml`.

### Anthropic (default)

No extra config needed — provider is auto-inferred from the model name.

```yaml
model: "claude-sonnet-4-5-20250929"
tests:
  - case: "check login is working"
```

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
opencheck --config tests.yaml
```

### AWS Bedrock

Requires `@langchain/aws` and AWS credentials.

```bash
bun add @langchain/aws
```

```yaml
model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
modelProvider: "bedrock"
tests:
  - case: "check login is working"
```

```bash
# Standard AWS credential chain (env vars, ~/.aws/credentials, IAM role, etc.)
export AWS_DEFAULT_REGION="us-east-1"
opencheck --config tests.yaml
```

### Google Vertex AI

Requires `@langchain/google-vertexai` and GCP credentials.

```bash
bun add @langchain/google-vertexai
```

```yaml
model: "gemini-1.5-pro"
modelProvider: "google-vertexai"
tests:
  - case: "check login is working"
```

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
opencheck --config tests.yaml
```

### Other Providers

Any provider supported by [LangChain's initChatModel](https://js.langchain.com/docs/how_to/chat_models_universal_init/) works. Install the provider package and set `modelProvider` accordingly (e.g., `openai`, `fireworks`, `mistralai`).

### Fallback Models (rate-limit failover)

Configure one or more `fallbackModels` to fail over when the primary errors out (e.g. Groq 429 → OpenRouter):

```yaml
model: "llama-3.3-70b-versatile"
modelProvider: "groq"
fallbackModels:
  - model: "anthropic/claude-sonnet-4.5"
    modelProvider: "openai"
    baseUrl: "https://openrouter.ai/api/v1"
    apiKey: "${OPENROUTER_API_KEY}"
```

Each fallback gets its own retry budget (`llmRetryAttempts`) before the chain advances. See [docs/configuration.md#fallback-models](docs/configuration.md#fallback-models) for full semantics.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Bun |
| Language | TypeScript (strict mode) |
| AI Agent | LangChain + LangGraph |
| LLM | Multi-provider via LangChain (Anthropic, Bedrock, Vertex AI, and more) |
| Browser | Playwright MCP (@playwright/mcp) |
| API | curl MCP (@mcp-get-community/server-curl) |
| Config | Zod + YAML |
| CLI | Commander.js |

## Releasing

1. Bump `version` in `package.json`, commit and push to `main`
2. Tag and push: `git tag <version> && git push origin <version>`

The `publish-npm.yml` workflow takes it from there — runs tests, publishes to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC — no token needed, provenance auto-generated), and creates a GitHub Release with auto-generated notes.

## License

Business Source License 1.1 (`BUSL-1.1`).

Copyright (c) Salfati Group GmbH, Zug, Switzerland.
See `LICENSE` for full terms.

---

Built and maintained by [Salfati Group](https://salfati.group)
