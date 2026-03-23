import { describe, it, expect } from "vitest";
import {
  enrichToolInputWithSnapshot,
  extractSnapshotText,
  normalizeToolInput,
} from "../../../src/cache/tool-input.ts";

describe("normalizeToolInput", () => {
  it("returns raw args from wrapped LangChain tool input", () => {
    const input = {
      name: "browser_navigate",
      args: { url: "https://example.com" },
      id: "toolu_123",
      type: "tool_call",
    };

    expect(normalizeToolInput(input)).toEqual({ url: "https://example.com" });
  });

  it("returns raw tool input unchanged when no args wrapper exists", () => {
    const input = { ref: "e31", element: "Continue button" };

    expect(normalizeToolInput(input)).toEqual(input);
  });

  it("extracts the snapshot yaml block from MCP result text", () => {
    const resultText = `### Page
- Page URL: https://example.com
### Snapshot
\`\`\`yaml
- textbox "Search for anything..." [ref=e249]
\`\`\`
### Events`;

    expect(extractSnapshotText(resultText)).toBe(
      '- textbox "Search for anything..." [ref=e249]',
    );
  });

  it("enriches a ref-only tool input with an element label from snapshot text", () => {
    const toolInput = { ref: "e249", text: "Elon Musk" };
    const snapshotText = [
      '- generic [ref=e2]:',
      '  - textbox "Search for anything..." [ref=e249]',
    ].join("\n");

    expect(enrichToolInputWithSnapshot(toolInput, snapshotText)).toEqual({
      ref: "e249",
      text: "Elon Musk",
      element: "Search for anything... textbox",
    });
  });
});
