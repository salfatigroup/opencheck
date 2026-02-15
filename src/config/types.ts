import type { z } from "zod";
import type { ConfigSchema, TestCaseSchema } from "./schema.ts";

/** A single test case parsed from the config YAML */
export type TestCase = z.infer<typeof TestCaseSchema>;

/** The full configuration object after validation */
export type Config = z.infer<typeof ConfigSchema>;
