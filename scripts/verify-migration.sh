#!/usr/bin/env bash
# Verify multi-provider migration completeness
set -euo pipefail

WORK_DIR="${1:-$(pwd)}"
cd "$WORK_DIR"

ERRORS=0

echo "=== Multi-Provider Migration Verification ==="

echo ""
echo "--- Checking agent-factory.ts has no direct @langchain/anthropic import ---"
if grep -q 'ChatAnthropic\|@langchain/anthropic' src/agent/agent-factory.ts 2>/dev/null; then
  echo "  ❌ Found @langchain/anthropic import in agent-factory.ts"
  grep 'ChatAnthropic\|@langchain/anthropic' src/agent/agent-factory.ts
  ERRORS=$((ERRORS + 1))
else
  echo "  ✅ No @langchain/anthropic import in agent-factory.ts"
fi

echo ""
echo "--- Checking model-factory.ts uses initChatModel ---"
if grep -q 'initChatModel' src/agent/model-factory.ts 2>/dev/null; then
  echo "  ✅ model-factory.ts uses initChatModel"
else
  echo "  ❌ model-factory.ts does not use initChatModel"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "--- Checking schema has modelProvider field ---"
if grep -q 'modelProvider' src/config/schema.ts 2>/dev/null; then
  echo "  ✅ ConfigSchema has modelProvider field"
else
  echo "  ❌ ConfigSchema missing modelProvider field"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "--- Checking optionalDependencies ---"
if grep -q 'optionalDependencies' package.json 2>/dev/null; then
  echo "  ✅ package.json has optionalDependencies section"
  if grep -q '@langchain/aws' package.json 2>/dev/null; then
    echo "  ✅ @langchain/aws in package.json"
  else
    echo "  ❌ @langchain/aws missing from package.json"
    ERRORS=$((ERRORS + 1))
  fi
  if grep -q '@langchain/google-vertexai' package.json 2>/dev/null; then
    echo "  ✅ @langchain/google-vertexai in package.json"
  else
    echo "  ❌ @langchain/google-vertexai missing from package.json"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ❌ package.json missing optionalDependencies section"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=== Migration Verification Complete ==="
echo "Errors: $ERRORS"
exit $ERRORS
