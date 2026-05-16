import { z } from "zod";

/** Schema for a single test case in the configuration */
export const TestCaseSchema = z.object({
  case: z.string().min(1, "Test case description cannot be empty"),
  name: z.string().min(1, "Test case name cannot be empty").optional(),
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
});

/**
 * Schema for a fallback LLM entry. The agent fails over to these in order when
 * the primary model errors (e.g. rate-limit / 429 / transient provider failure).
 * `baseUrl` and `apiKey` let a fallback target a different provider account or
 * an OpenAI-compatible gateway (e.g. OpenRouter) without polluting the primary's env vars.
 */
export const FallbackModelSchema = z.object({
  model: z.string().min(1, "Fallback model name cannot be empty"),
  modelProvider: z.string().optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
});

/** Schema for granular recording options */
export const RecordingOptionsSchema = z.object({
  trace: z.boolean().default(true),
  video: z.boolean().default(true),
});

/** Recording can be a boolean (shorthand) or an object with trace/video flags */
export const RecordingSchema = z.union([
  z.boolean(),
  RecordingOptionsSchema,
]);

/** Schema for the full OpenCheck configuration file */
export const ConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  browser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  headless: z.boolean().default(true),
  sessionMode: z.enum(["isolated", "persistent"]).default("isolated"),
  timeout: z.number().positive().default(60_000),
  maxAttempts: z.number().int().positive().max(10).default(3),
  llmRetryAttempts: z.number().int().nonnegative().max(10).default(3),
  cacheDir: z.string().default(".opencheck-cache"),
  model: z.string().default("claude-sonnet-4-5-20250929"),
  modelProvider: z.string().optional(),
  fallbackModels: z.array(FallbackModelSchema).default([]),
  recursionLimit: z.number().int().positive().default(500),
  recording: RecordingSchema.default(true),
  bailOnFailure: z.boolean().default(false),
  viewportSize: z.string().regex(/^\d+x\d+$/, "Must be WIDTHxHEIGHT, e.g. '1280x720'").default("1280x720"),
  secrets: z.array(z.string()).default([]),
  tests: z.array(TestCaseSchema).min(1, "At least one test case is required"),
});
