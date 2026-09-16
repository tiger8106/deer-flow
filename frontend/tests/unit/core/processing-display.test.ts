import { describe, expect, it } from "@rstest/core";

import {
  visibleProcessingText,
  isInternalToolCall,
} from "@/core/messages/processing-display";

describe("processing display", () => {
  it("removes the body of multiline code blocks, including blank lines", () => {
    expect(
      visibleProcessingText(
        "Check evidence.\n\n```python\nx = 1\n\nsecret()\n```\n\nUse the original units.",
      ),
    ).toBe("Check evidence.\n\nUse the original units.");
  });
  it("buffers incomplete technical paragraphs across streaming chunks", () => {
    expect(
      visibleProcessingText("Check the original.\n\nNext read", true),
    ).toBe("Check the original.");
    expect(
      visibleProcessingText(
        "Check the original.\n\nNext read SKILL.md\n\n",
        true,
      ),
    ).toBe("Check the original.");
  });
  it("retains business reasoning while removing technical paragraphs", () => {
    expect(
      visibleProcessingText(
        "Compare the figures.\n\nUse build_ppt with deck.json.\n\nPreserve the units.",
      ),
    ).toBe("Compare the figures.\n\nPreserve the units.");
  });
  it("does not hide user documents or business searches", () => {
    expect(
      isInternalToolCall({
        name: "read_file",
        args: { path: "/mnt/user-data/uploads/report.md" },
      }),
    ).toBe(false);
    expect(isInternalToolCall({ name: "knowledge_query", args: {} })).toBe(
      false,
    );
    expect(
      isInternalToolCall({
        name: "read_file",
        args: { path: "/mnt/skills/public/ppt-generation/references/plan.md" },
      }),
    ).toBe(true);
  });
});
