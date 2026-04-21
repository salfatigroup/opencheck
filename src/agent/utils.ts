import type { TestCase } from "../config/types.ts";
import { TransientLLMError } from "./model-factory.ts";

/** Convert a test case description to a filesystem-safe directory name */
export function sanitizeTestName(testCase: string): string {
  return testCase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

/** Extract the last AI message content from agent result */
export function extractLastMessage(result: Record<string, unknown>): string {
  const messages = result["messages"] as Array<{ content: string }> | undefined;
  if (!messages || messages.length === 0) {
    return "No response from agent";
  }
  const last = messages[messages.length - 1];
  return last?.content ?? "No content in last message";
}

export function buildNamedCaseMap(tests: TestCase[]): Map<string, string> {
  const namedCaseMap = new Map<string, string>();
  for (const test of tests) {
    if (!test.name) continue;

    const key = normalizeNamedCaseReference(test.name);
    if (namedCaseMap.has(key)) {
      throw new Error(`Duplicate named test case reference: ${test.name}`);
    }
    namedCaseMap.set(key, test.case);
  }
  return namedCaseMap;
}

export function normalizeNamedCaseReference(reference: string): string {
  let normalized = reference.trim();

  if (normalized.startsWith("{") && normalized.endsWith("}")) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.startsWith("#")) {
    normalized = normalized.slice(1);
  }

  return normalized.toLowerCase();
}

/** Convert an agent runtime error into a user-friendly failure message */
export function formatAgentError(error: unknown, testCase: string, recursionLimit: number): string {
  const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorName === "GraphRecursionError" || errorMessage.includes("Recursion limit")) {
    return [
      `TEST_FAILED: Agent exceeded the recursion limit (${recursionLimit} steps) while executing this test.`,
      `  The test "${testCase}" required more steps than the configured limit allows.`,
      `  Suggestion: Increase 'recursionLimit' in your config (current: ${recursionLimit}), or simplify the test case into smaller, focused checks.`,
    ].join("\n");
  }

  if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
    return [
      `TEST_FAILED: The AI model returned a rate-limit error.`,
      `  Suggestion: Wait a moment and retry, or check your API key usage and billing.`,
    ].join("\n");
  }

  if (errorMessage.includes("401") || errorMessage.includes("authentication") || errorMessage.includes("API key")) {
    return [
      `TEST_FAILED: Authentication error when calling the AI model.`,
      `  Suggestion: Verify your API key is set correctly in your environment.`,
    ].join("\n");
  }

  if (error instanceof TransientLLMError) {
    return [
      `TEST_FAILED: Bedrock returned a transient service error (503) and retries were exhausted.`,
      `  Error: ${errorMessage}`,
      `  Suggestion: This is a transient AWS Bedrock issue. Re-run the test, or increase 'llmRetryAttempts' in your config (default: 3).`,
    ].join("\n");
  }

  if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND") || errorMessage.includes("network")) {
    return [
      `TEST_FAILED: Network error while running the agent.`,
      `  Error: ${errorMessage}`,
      `  Suggestion: Check your network connection and ensure the target URL is reachable.`,
    ].join("\n");
  }

  return [
    `TEST_FAILED: Unexpected error during agent execution (${errorName}).`,
    `  Error: ${errorMessage}`,
    `  Suggestion: This may be a transient issue. Check the error above and retry.`,
  ].join("\n");
}
