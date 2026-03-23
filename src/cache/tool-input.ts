export function normalizeToolInput(toolInput: Record<string, unknown>): Record<string, unknown> {
  const args = toolInput["args"];
  if (isRecord(args)) {
    return args;
  }
  return toolInput;
}

export function enrichToolInputWithSnapshot(
  toolInput: Record<string, unknown>,
  snapshotText: string | null,
): Record<string, unknown> {
  if (!snapshotText) return toolInput;
  const ref = typeof toolInput["ref"] === "string" ? toolInput["ref"] : null;
  const existingElement = typeof toolInput["element"] === "string" ? toolInput["element"] : null;
  if (!ref || existingElement) return toolInput;

  const inferredElement = inferElementLabelFromSnapshot(snapshotText, ref);
  if (!inferredElement) return toolInput;

  return {
    ...toolInput,
    element: inferredElement,
  };
}

export function extractSnapshotText(resultText: string): string | null {
  const match = resultText.match(/### Snapshot\s+```yaml\n([\s\S]*?)\n```/);
  return match?.[1] ?? null;
}

function inferElementLabelFromSnapshot(snapshotText: string, ref: string): string | null {
  const lines = snapshotText.split("\n");
  const matchingLine = lines.find((line) => line.includes(`[ref=${ref}]`));
  if (!matchingLine) return null;

  const textMatch = matchingLine.match(/-\s+([a-z]+)(?:\s+"([^"]+)")?.*\[ref=/i);
  if (!textMatch) return null;

  const role = textMatch[1]?.toLowerCase();
  const label = textMatch[2]?.trim();
  if (!label) return null;

  switch (role) {
    case "button":
    case "link":
    case "textbox":
    case "combobox":
    case "checkbox":
    case "radio":
      return `${label} ${role}`;
    default:
      return label;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
