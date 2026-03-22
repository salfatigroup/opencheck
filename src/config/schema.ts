import { z } from "zod";

/** Schema for a single test case in the configuration */
export const TestCaseSchema = z.object({
  case: z.string().min(1, "Test case description cannot be empty"),
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
});

/** Schema for the full OpenCheck configuration file */
export const ConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  browser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  headless: z.boolean().default(true),
  timeout: z.number().positive().default(60_000),
  maxAttempts: z.number().int().positive().max(10).default(3),
  cacheDir: z.string().default(".opencheck-cache"),
  model: z.string().default("claude-sonnet-4-5-20250929"),
  modelProvider: z.string().optional(),
  recursionLimit: z.number().int().positive().default(500),
  recording: z.boolean().default(false),
  tests: z.array(TestCaseSchema).min(1, "At least one test case is required"),
});
