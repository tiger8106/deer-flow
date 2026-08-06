import { expect, test } from "@rstest/core";

import {
  sanitizeRunStreamOptions,
  warnUnsupportedStreamModes,
} from "@/core/api/stream-mode";

test("drops unsupported stream modes from array payloads", () => {
  const sanitized = sanitizeRunStreamOptions({
    streamMode: [
      "values",
      "messages-tuple",
      "custom",
      "updates",
      "events",
      "tools",
    ],
  });

  expect(sanitized.streamMode).toEqual([
    "values",
    "messages-tuple",
    "custom",
    "updates",
    "events",
  ]);
});

test("drops unsupported stream modes from scalar payloads", () => {
  const sanitized = sanitizeRunStreamOptions({
    streamMode: "tools",
  });

  expect(sanitized.streamMode).toBeUndefined();
});

test("keeps payloads without streamMode untouched", () => {
  const options = {
    streamSubgraphs: true,
  };

  expect(sanitizeRunStreamOptions(options)).toBe(options);
});

test("unsupported stream mode warnings use Tiger branding", () => {
  const warnings: string[] = [];

  warnUnsupportedStreamModes(["tiger-test-mode"], (message) => {
    warnings.push(message);
  });

  expect(warnings[0]).toContain("[tiger]");
  expect(warnings[0]).not.toContain("DeerFlow");
});
