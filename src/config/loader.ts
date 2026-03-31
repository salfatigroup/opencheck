import { readFile, access } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { ConfigSchema } from "./schema.ts";
import type { Config } from "./types.ts";

/** Error thrown when config loading or validation fails */
export class ConfigLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ConfigLoadError";
    if (cause) this.cause = cause;
  }
}

/**
 * Load and validate a YAML config file.
 * @param filePath - Absolute or relative path to the YAML config
 * @returns Validated Config object with defaults applied
 * @throws ConfigLoadError if file is missing, malformed, or fails validation
 */
export async function loadConfig(filePath: string): Promise<Config> {
  await assertFileExists(filePath);
  const raw = await readYamlFile(filePath);
  return validateConfig(raw);
}

async function assertFileExists(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new ConfigLoadError(`Config file not found: ${filePath}`);
  }
}

async function readYamlFile(filePath: string): Promise<unknown> {
  try {
    const content = await readFile(filePath, "utf-8");
    const interpolated = interpolateEnvVars(content);
    return parseYaml(interpolated) as unknown;
  } catch (error) {
    if (error instanceof ConfigLoadError) throw error;
    throw new ConfigLoadError(
      `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

/**
 * Replace `${VAR_NAME}` placeholders with values from process.env.
 * Unset variables are replaced with an empty string.
 * Supports both `${VAR}` and `$VAR` (word-boundary) syntax.
 */
export function interpolateEnvVars(content: string): string {
  return content
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => process.env[name] ?? "")
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)\b/g, (_match, name: string) => process.env[name] ?? "");
}

function validateConfig(raw: unknown): Config {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigLoadError(`Config validation failed:\n${issues}`);
  }
  return result.data;
}
