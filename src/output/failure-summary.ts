import { createChatModel } from "../agent/model-factory.ts";
import type { Config } from "../config/types.ts";
import type { TestResult } from "../runner/types.ts";

const SYSTEM_PROMPT = [
  "You are a test failure analyst. Given failed test results, produce a concise summary.",
  "For each failure state: the test name, what failed, and what specifically didn't work.",
  "Only state facts from the provided error messages. Do not guess or speculate.",
  "Be as brief as possible — no preamble, no suggestions, no fixes.",
].join(" ");

/**
 * Use the configured LLM to generate a concise, factual summary of failed tests.
 * Only called when there are failures. Returns null if generation fails.
 */
export async function generateFailureSummary(
  failedResults: TestResult[],
  config: Config,
): Promise<string | null> {
  if (failedResults.length === 0) return null;

  const failureList = failedResults
    .map((r) => `- "${r.testCase}": ${r.error ?? "No error details"}`)
    .join("\n");

  try {
    const model = await createChatModel(config);
    const response = await model.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Failed tests:\n${failureList}` },
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    return content.trim() || null;
  } catch {
    return null;
  }
}
