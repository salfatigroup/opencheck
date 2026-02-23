# OpenCheck

**AI-powered end-to-end browser testing, designed to be simple.**

By [Salfati Group](https://salfati.group) | [opencheck.ai](https://opencheck.ai)

---

Write test cases in plain English. An AI agent executes them in a real browser or via API calls. Successful steps are cached for instant replay on subsequent runs.

```yaml
# tests.yaml
baseUrl: "http://localhost:3000"
tests:
  - case: "check login is working"
  - case: "verify dashboard loads after login"
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
- An `ANTHROPIC_API_KEY` environment variable
- Node.js 18+ (for Playwright MCP)

### Install

Run directly with no install:

```bash
npx opencheck --config tests.yaml
# or
bunx opencheck --config tests.yaml
```

Or install globally:

```bash
npm install -g opencheck
# or
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
   - **AI passes?** Steps saved to `.opencheck-cache/`
   - **AI fails after retries?** Test marked failed, stale cache deleted
3. Summary printed with pass/fail/cached counts and timing
4. Exit code `0` if all pass, `1` if any fail

## Documentation

- [Configuration Reference](docs/configuration.md) — All `tests.yaml` options
- [How It Works](docs/how-it-works.md) — Architecture and AI strategy
- [Cache System](docs/cache.md) — How step caching works
- [CLI Reference](docs/cli.md) — Flags, exit codes, environment variables

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Bun |
| Language | TypeScript (strict mode) |
| AI Agent | LangChain + LangGraph |
| LLM | Claude (via @langchain/anthropic) |
| Browser | Playwright MCP (@playwright/mcp) |
| API | curl MCP (@mcp-get-community/server-curl) |
| Config | Zod + YAML |
| CLI | Commander.js |

## License

Business Source License 1.1 (`BUSL-1.1`).

Copyright (c) Salfati Group GmbH, Zug, Switzerland.
See `LICENSE` for full terms.

---

Built and maintained by [Salfati Group](https://salfati.group)
