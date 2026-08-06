import type { ToolCall } from "@langchain/core/messages";
import type { AIMessage } from "@langchain/langgraph-sdk";

import type { Locale } from "../i18n";
import type { Translations } from "../i18n";
import { hasToolCalls } from "../messages/utils";

import {
  resolveToolDisplayLabel,
  type ToolDisplayLabels,
} from "./display-labels";

export function explainLastToolCall(
  message: AIMessage,
  t: Translations,
  locale: Locale,
  toolDisplayLabels: ToolDisplayLabels,
) {
  if (hasToolCalls(message)) {
    const lastToolCall = message.tool_calls![message.tool_calls!.length - 1]!;
    return explainToolCall(lastToolCall, t, locale, toolDisplayLabels);
  }
  return t.common.thinking;
}

export function explainToolCall(
  toolCall: ToolCall,
  t: Translations,
  locale: Locale,
  toolDisplayLabels: ToolDisplayLabels,
) {
  if (toolCall.name === "web_search" || toolCall.name === "image_search") {
    return t.toolCalls.searchFor(toolCall.args.query);
  } else if (toolCall.name === "web_fetch") {
    return t.toolCalls.viewWebPage;
  } else if (toolCall.name === "present_files") {
    return t.toolCalls.presentFiles;
  } else if (toolCall.name === "write_todos") {
    return t.toolCalls.writeTodos;
  } else if (toolCall.args.description) {
    return toolCall.args.description;
  } else {
    return resolveToolDisplayLabel(
      toolCall.name,
      locale,
      toolDisplayLabels,
      t.toolCalls.useTool(toolCall.name),
    );
  }
}
