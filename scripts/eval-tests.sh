#!/usr/bin/env bash
# Evaluation script: Run tests and check coverage
set -uo pipefail

WORK_DIR="${1:-/private/tmp/aitest/knowledge/internal/research/executions/development/aitest/work}"
cd "$WORK_DIR"

ERRORS=0

echo "=== OpenCheck Test Evaluation ==="

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  bun install
fi

# Run vitest
echo ""
echo "--- Running test suite ---"
if bun run test 2>&1; then
  echo "  ✅ All tests passed"
else
  echo "  ❌ Tests failed"
  ERRORS=$((ERRORS + 1))
fi

# Count tests
echo ""
echo "--- Counting test assertions ---"
TEST_COUNT=$(grep -rn -E 'it\(|test\(|it\.each|test\.each' tests/ --include='*.test.ts' 2>/dev/null | wc -l | tr -d ' ') || TEST_COUNT=0
echo "  Found approximately $TEST_COUNT test cases"
if [ "$TEST_COUNT" -lt 20 ]; then
  echo "  ❌ Expected at least 20 test cases, found $TEST_COUNT"
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ Test count meets minimum (>= 20)"
fi

echo ""
echo "=== Test Evaluation Complete ==="
echo "Errors: $ERRORS"
exit $ERRORS
