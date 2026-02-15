# CLI Reference

## Usage

```bash
opencheck --config <path>
```

Or run directly with Bun:

```bash
bun run src/cli.ts --config tests.yaml
```

## Options

| Flag | Alias | Required | Description |
|------|-------|----------|-------------|
| `--config <path>` | `-c` | Yes | Path to the YAML configuration file |
| `--version` | `-V` | No | Print version number |
| `--help` | `-h` | No | Display help message |

## Examples

```bash
# Run with default config file
opencheck --config tests.yaml

# Run with a custom config location
opencheck -c ./config/e2e-tests.yaml

# Show version
opencheck --version

# Show help
opencheck --help
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | One or more tests failed, or a configuration error occurred |

Exit codes are designed for CI/CD integration. Use them in your pipeline:

```bash
opencheck --config tests.yaml || echo "Tests failed!"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key for Claude access |

The AI agent uses Claude via the `@langchain/anthropic` package, which reads `ANTHROPIC_API_KEY` from the environment.

## Output Format

During execution, OpenCheck shows real-time progress:

```
OpenCheck v0.1.0
Running 3 test(s)...

  [RUNNING] check login is working
  [PASS] check login is working (cache, 45ms)
  [RUNNING] verify dashboard loads
  [PASS] verify dashboard loads (ai, 8.2s)
  [RUNNING] check logout works
  [FAIL] check logout works (ai, 12.1s)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test Results Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total:   3
  Passed:  2
  Failed:  1
  Cached:  1
  Time:    20.3s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Failed tests:
    - check logout works
      TEST_FAILED: Logout button not found on page
```

The `source` field in each result shows how it passed:
- **cache** — replayed from cached steps (fast)
- **ai** — executed by the AI agent (slower, but handles UI changes)
