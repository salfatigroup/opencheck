#!/usr/bin/env bash
# Evaluation script: Verify project structure matches plan
set -euo pipefail

WORK_DIR="${1:-/private/tmp/aitest/knowledge/internal/research/executions/development/aitest/work}"
cd "$WORK_DIR"

ERRORS=0

echo "=== OpenCheck Structure Evaluation ==="

# Required source files
REQUIRED_FILES=(
  "src/cli.ts"
  "src/index.ts"
  "src/config/schema.ts"
  "src/config/loader.ts"
  "src/cache/types.ts"
  "src/cache/cache-manager.ts"
  "src/cache/step-recorder.ts"
  "src/cache/step-replayer.ts"
  "src/agent/types.ts"
  "src/agent/mcp-client.ts"
  "src/agent/agent-factory.ts"
  "src/agent/model-factory.ts"
  "src/runner/types.ts"
  "src/runner/test-runner.ts"
  "src/runner/test-executor.ts"
  "src/output/types.ts"
  "src/output/reporter.ts"
  "package.json"
  "tsconfig.json"
  "vitest.config.ts"
)

echo ""
echo "--- Checking required source files ---"
for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ MISSING: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

# Required test files
REQUIRED_TESTS=(
  "tests/unit/config/schema.test.ts"
  "tests/unit/config/loader.test.ts"
  "tests/unit/cache/cache-manager.test.ts"
  "tests/unit/cache/step-recorder.test.ts"
  "tests/unit/cache/step-replayer.test.ts"
  "tests/unit/agent/agent-factory.test.ts"
  "tests/unit/agent/mcp-client.test.ts"
  "tests/unit/agent/model-factory.test.ts"
  "tests/unit/runner/test-executor.test.ts"
  "tests/unit/runner/test-runner.test.ts"
  "tests/unit/output/reporter.test.ts"
)

echo ""
echo "--- Checking required test files ---"
for f in "${REQUIRED_TESTS[@]}"; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ MISSING: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

# Required integration test files
REQUIRED_INTEGRATION=(
  "tests/integration/config-loading.test.ts"
  "tests/integration/cache-roundtrip.test.ts"
  "tests/integration/cli-pipeline.test.ts"
)

echo ""
echo "--- Checking integration test files ---"
for f in "${REQUIRED_INTEGRATION[@]}"; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ MISSING: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

# Check for test fixtures
echo ""
echo "--- Checking test fixtures ---"
FIXTURE_DIR="tests/fixtures"
if [ -d "$FIXTURE_DIR" ]; then
  FIXTURE_COUNT=$(find "$FIXTURE_DIR" -type f | wc -l | tr -d ' ')
  echo "  ✅ Fixtures directory exists with $FIXTURE_COUNT files"
  if [ "$FIXTURE_COUNT" -lt 3 ]; then
    echo "  ⚠️  Expected at least 3 fixture files"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ❌ MISSING: tests/fixtures/"
  ERRORS=$((ERRORS + 1))
fi

# Required documentation files
REQUIRED_DOCS=(
  "README.md"
  "docs/configuration.md"
  "docs/how-it-works.md"
  "docs/cache.md"
  "docs/cli.md"
)

echo ""
echo "--- Checking documentation files ---"
for f in "${REQUIRED_DOCS[@]}"; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ MISSING: $f"
    ERRORS=$((ERRORS + 1))
  fi
done

# Verify rename: no remaining "aitest" references in source or package.json
echo ""
echo "--- Checking rename completeness ---"
OLD_NAME_COUNT=$(grep -rl 'checkmate\|Checkmate\|aitest\|AITest' src/ package.json 2>/dev/null | wc -l | tr -d ' ') || OLD_NAME_COUNT=0
if [ "$OLD_NAME_COUNT" -gt 0 ]; then
  echo "  ❌ Found $OLD_NAME_COUNT files still referencing old names:"
  grep -rl 'checkmate\|Checkmate\|aitest\|AITest' src/ package.json 2>/dev/null | head -10
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ Rename complete — no old name references in src/ or package.json"
fi

# Check no file exceeds 200 lines
echo ""
echo "--- Checking file sizes (max 200 lines) ---"
while IFS= read -r f; do
  LINES=$(wc -l < "$f" | tr -d ' ')
  if [ "$LINES" -gt 200 ]; then
    echo "  ❌ $f: $LINES lines (max 200)"
    ERRORS=$((ERRORS + 1))
  fi
done < <(find src/ -name '*.ts' -type f 2>/dev/null)
echo "  ✅ All source files within line limit"

echo ""
echo "=== Structure Evaluation Complete ==="
echo "Errors: $ERRORS"
exit $ERRORS
