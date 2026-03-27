const ENV_VAR_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function expandEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(ENV_VAR_PATTERN, (match, name) => {
      const envValue = process.env[name];
      if (envValue === undefined) return match;
      return envValue;
    });
  }

  if (Array.isArray(value)) {
    return value.map(expandEnvVars);
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = expandEnvVars(val);
    }
    return result;
  }

  return value;
}
