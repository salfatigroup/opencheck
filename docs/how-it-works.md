# How It Works

## Architecture

OpenCheck is built as 6 clean layers, each with a single responsibility:

```
CLI (commander)
 └─> Config (zod + yaml)
 └─> Runner (orchestration)
      ├─> Agent (LangChain + Playwright MCP + curl MCP)
      ├─> Cache (filesystem)
      └─> Output (console reporter)
```

- **CLI** parses arguments and wires everything together
- **Config** loads and validates `tests.yaml` via Zod schemas
- **Runner** orchestrates test execution sequentially
- **Agent** creates a LangChain ReAct agent with both Playwright and curl MCP tools
- **Cache** manages file-based step recordings
- **Output** formats progress and summary to the console

## The Cache-First-Then-AI Strategy

This is the core loop that makes OpenCheck fast on repeat runs:

```
For each test case:
  1. Cache exists? → Replay cached Playwright steps
     → Pass? ✅ Done (fast, no AI needed)
     → Fail? → Step 2
  2. AI agent executes test via Playwright browser
     → Pass? ✅ Save steps to cache → Done
     → Fail? (after maxAttempts retries)
       → ❌ Delete stale cache → Report failure
```

### First Run (Cold)

On the first run, no cache exists. The AI agent:
1. Receives the test case description and base URL
2. Uses Playwright MCP tools to navigate, click, type, and snapshot
3. Determines pass/fail based on the browser state
4. On success: the exact sequence of tool calls is saved to cache

### Subsequent Runs (Warm)

On repeat runs, cached steps are replayed directly:
1. The cached Playwright tool calls are executed in order
2. No AI model is invoked — this is fast and deterministic
3. If any step fails (e.g., UI changed), falls back to the AI agent

### Cache Invalidation

When the UI changes and cached steps fail:
1. The AI agent re-executes the test from scratch
2. If the AI succeeds, the cache is updated with new steps
3. If the AI fails after all retries, the stale cache is deleted

## How the AI Agent Works

Each test gets its own isolated agent with:
- A fresh **Playwright MCP server** + **curl MCP server** (both always available)
- A **LangChain ReAct agent** powered by Claude
- A **unified system prompt** that tells the agent to:
  - Analyze the test case and choose the right tools
  - Use browser tools for UI tests, curl for API tests (or both)
  - Respond with `TEST_PASSED` or `TEST_FAILED`

The AI **autonomously picks the right tools** based on the test case description — no configuration needed.

For browser tests, the agent uses accessibility snapshots (not screenshots) to understand page state. This is text-based, faster, and doesn't require vision models.

### Step Recording

During AI execution, each MCP tool call is intercepted by a recording wrapper that captures `(toolName, toolInput)`. This is the data that gets cached:

```json
{
  "steps": [
    { "toolName": "browser_navigate", "toolInput": { "url": "http://localhost:3000" } },
    { "toolName": "browser_type", "toolInput": { "selector": "#username", "text": "admin" } },
    { "toolName": "browser_click", "toolInput": { "selector": "#login-btn" } }
  ]
}
```

## Sequential Execution

Tests run sequentially in v1. Each test gets:
- Its own MCP server process
- Its own browser context
- Complete isolation from other tests

This ensures predictable, reproducible results.
