import "server-only";

import { z } from "zod";

import type { ToolDisplayLabels } from "./display-labels";

const toolDisplayLabelsSchema = z.record(
  z.string().min(1),
  z.object({
    "en-US": z.string().min(1),
    "zh-CN": z.string().min(1),
  }),
);

export function getToolDisplayLabels(): ToolDisplayLabels {
  const raw = process.env.DEER_FLOW_TOOL_DISPLAY_LABELS;
  if (!raw?.trim()) return {};

  try {
    return toolDisplayLabelsSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}
