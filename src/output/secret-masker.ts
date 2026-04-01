/**
 * Replaces secret values with "***" in any string.
 * Used to prevent credentials from leaking into CI logs.
 */
export class SecretMasker {
  private readonly patterns: RegExp[];

  constructor(secrets: string[]) {
    this.patterns = secrets
      .filter((s) => s.length > 0)
      .map((s) => new RegExp(escapeRegExp(s), "g"));
  }

  /** Return a copy of `text` with all secret values replaced by "***" */
  mask(text: string): string {
    let result = text;
    for (const pattern of this.patterns) {
      result = result.replace(pattern, "***");
    }
    return result;
  }

  /** Returns true if this masker has at least one secret configured */
  get hasSecrets(): boolean {
    return this.patterns.length > 0;
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
