import type { z } from "zod";
import type { ConfigSchema, TestCaseSchema, RecordingOptionsSchema } from "./schema.ts";

/** A single test case parsed from the config YAML */
export type TestCase = z.infer<typeof TestCaseSchema>;

/** The full configuration object after validation */
export type Config = z.infer<typeof ConfigSchema>;

/** Granular recording options */
export type RecordingOptions = z.infer<typeof RecordingOptionsSchema>;

/** Normalize the recording field to a consistent { trace, video } object */
export function resolveRecording(recording: Config["recording"]): { trace: boolean; video: boolean } {
  if (typeof recording === "boolean") {
    return { trace: recording, video: recording };
  }
  return { trace: recording.trace, video: recording.video };
}
