#!/usr/bin/env bash
# Evaluation script: Code quality checks
set -euo pipefail

WORK_DIR="${1:-/private/tmp/aitest/knowledge/internal/research/executions/development/aitest/work}"
cd "$WORK_DIR"

ERRORS=0

echo "=== OpenCheck Quality Evaluation ==="

# Check for 'any' type usage in source (not test) files
echo ""
echo "--- Checking for 'any' type usage in src/ ---"
ANY_COUNT=$(grep -rn ': any' src/ --include='*.ts' 2>/dev/null | grep -v '// eslint-disable' | grep -v '// any-ok' | wc -l | tr -d ' ') || ANY_COUNT=0
if [ "$ANY_COUNT" -gt 0 ]; then
  echo "  ❌ Found $ANY_COUNT uses of ': any' in source files:"
  grep -rn ': any' src/ --include='*.ts' 2>/dev/null | grep -v '// eslint-disable' | grep -v '// any-ok' | head -20
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ No 'any' types found in source files"
fi

# Check TypeScript compilation
echo ""
echo "--- TypeScript type checking ---"
if command -v bun &> /dev/null; then
  if bun run tsc --noEmit 2>&1; then
    echo "  ✅ TypeScript compilation successful"
  else
    echo "  ❌ TypeScript compilation failed"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ⚠️  Bun not available, skipping type check"
fi

# Check package.json has bin field
echo ""
echo "--- Checking package.json configuration ---"
if [ -f "package.json" ]; then
  if grep -q '"bin"' package.json; then
    echo "  ✅ package.json has bin field"
  else
    echo "  ❌ package.json missing bin field"
    ERRORS=$((ERRORS + 1))
  fi

  if grep -q '"type": "module"' package.json || grep -q '"type":"module"' package.json; then
    echo "  ✅ package.json has type: module"
  else
    echo "  ❌ package.json missing type: module"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ❌ package.json not found"
  ERRORS=$((ERRORS + 1))
fi

# Check tsconfig.json has strict mode
echo ""
echo "--- Checking tsconfig.json ---"
if [ -f "tsconfig.json" ]; then
  if grep -q '"strict": true' tsconfig.json || grep -q '"strict":true' tsconfig.json; then
    echo "  ✅ tsconfig.json has strict mode"
  else
    echo "  ❌ tsconfig.json missing strict mode"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ❌ tsconfig.json not found"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=== Quality Evaluation Complete ==="
echo "Errors: $ERRORS"
exit $ERRORS
