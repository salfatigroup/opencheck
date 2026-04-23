/** Utility functions for browser state recovery during test replay */

export function extractRefFromSnapshot(
  snapshotText: string,
  label: string,
  toolName: string,
): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const roleMatches = Array.from(
    snapshotText.matchAll(
      new RegExp(`-\\s+([a-z]+)\\s+"${escapedLabel}"[^\\n]*\\[ref=(e\\d+)\\]`, "gi"),
    ),
  );

  const preferredRoles = preferredRolesForTool(toolName);
  for (const preferredRole of preferredRoles) {
    const match = roleMatches.find((entry) => entry[1]?.toLowerCase() === preferredRole);
    if (match?.[2]) return match[2];
  }

  return roleMatches[0]?.[2] ?? null;
}

export function buildElementSearchCandidates(label: string): string[] {
  const candidates = new Set<string>();
  const trimmed = label.trim();

  const cleaned = trimmed
    .replace(/\s+in\s+sidebar$/i, "")
    .replace(/\s+(button|link|textbox)$/i, "")
    .trim();

  candidates.add(trimmed);
  if (cleaned) candidates.add(cleaned);

  const withoutRoles = trimmed
    .replace(/\s+(button|link|textbox)\b/gi, "")
    .replace(/\s+in\s+sidebar$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (withoutRoles) candidates.add(withoutRoles);

  if (/search/i.test(trimmed)) {
    candidates.add("Search");
  }
  if (/search for anything/i.test(trimmed)) {
    candidates.add("Search for anything");
  }

  return [...candidates].filter(Boolean);
}

export function preferredRolesForTool(toolName: string): string[] {
  switch (toolName) {
    case "browser_type":
      return ["textbox", "combobox"];
    case "browser_click":
      return ["button", "link"];
    default:
      return [];
  }
}

export async function waitForAnyText(
  waitTool: { invoke(input: Record<string, unknown>): Promise<unknown> },
  labels: string[],
  toolName: string,
): Promise<string | null> {
  const textWaitCandidates = filterTextWaitCandidates(labels, toolName);
  if (textWaitCandidates.length === 0) return null;

  for (const label of textWaitCandidates) {
    try {
      await waitTool.invoke({ text: label });
      return label;
    } catch {
      // Try the next candidate label.
    }
  }
  return null;
}

export function recoverRefFromLabels(
  snapshotText: string,
  labels: string[],
  toolName: string,
): { label: string; ref: string } | null {
  for (const label of labels) {
    const ref = extractRefFromSnapshot(snapshotText, label, toolName);
    if (ref) {
      return { label, ref };
    }
  }
  return null;
}

export async function snapshotToText(
  snapshotTool: { invoke(input: Record<string, unknown>): Promise<unknown> },
): Promise<string> {
  const snapshot = await snapshotTool.invoke({});
  return typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot);
}

export function filterTextWaitCandidates(labels: string[], toolName: string): string[] {
  if (toolName === "browser_type") {
    return labels.filter((label) => /textbox|combobox/i.test(label));
  }
  return labels;
}
