import type { AIMessage, Message } from "@langchain/langgraph-sdk";

import { stripLegacyCitationArtifacts } from "@/core/citations/legacy";

interface GenericMessageGroup<T = string> {
  type: T;
  id: string | undefined;
  messages: Message[];
}

interface HumanMessageGroup extends GenericMessageGroup<"human"> {}

interface AssistantProcessingGroup extends GenericMessageGroup<"assistant:processing"> {}

interface AssistantMessageGroup extends GenericMessageGroup<"assistant"> {}

interface AssistantPresentFilesGroup extends GenericMessageGroup<"assistant:present-files"> {}

interface AssistantClarificationGroup extends GenericMessageGroup<"assistant:clarification"> {}

interface AssistantSubagentGroup extends GenericMessageGroup<"assistant:subagent"> {}

export type MessageGroup =
  | HumanMessageGroup
  | AssistantProcessingGroup
  | AssistantMessageGroup
  | AssistantPresentFilesGroup
  | AssistantClarificationGroup
  | AssistantSubagentGroup;

const HIDDEN_CONTROL_MESSAGE_NAMES = new Set([
  "summary",
  "loop_warning",
  "todo_reminder",
  "todo_completion_reminder",
]);

export function getMessageGroups(messages: Message[]): MessageGroup[] {
  if (messages.length === 0) {
    return [];
  }

  const groups: MessageGroup[] = [];

  // Returns the last group if it can still accept tool messages
  // (i.e. it's an in-flight processing group, not a terminal human/assistant group).
  function lastOpenGroup() {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.type !== "human" &&
      last.type !== "assistant" &&
      last.type !== "assistant:clarification"
    ) {
      return last;
    }
    return null;
  }

  for (const [messageIndex, message] of messages.entries()) {
    if (isHiddenFromUIMessage(message)) {
      continue;
    }

    // Provider-created messages normally carry an id. Keep a unique UI-only
    // fallback for legacy/replayed messages without one; otherwise two
    // consecutive terminal responses share React's `undefined` key and one
    // response can disappear until the thread is reloaded.
    const groupId = message.id ?? `ui-message-group-${messageIndex}`;

    if (message.type === "human") {
      groups.push({ id: groupId, type: "human", messages: [message] });
      continue;
    }

    if (message.type === "tool") {
      if (isClarificationToolMessage(message)) {
        // Add to the preceding processing group to preserve tool-call association,
        // then also open a standalone clarification group for prominent display.
        lastOpenGroup()?.messages.push(message);
        groups.push({
          id: groupId,
          type: "assistant:clarification",
          messages: [message],
        });
      } else {
        // Replayed results belong to the originating call, not the latest turn.
        const owner = groups.find((group) =>
          group.messages.some(
            (candidate) =>
              candidate.type === "ai" &&
              candidate.tool_calls?.some(
                (call) =>
                  Boolean(message.tool_call_id) &&
                  call.id === message.tool_call_id,
              ),
          ),
        );
        const open = owner ?? lastOpenGroup();
        if (open) {
          open.messages.push(message);
        } else {
          // Fallback for orphan tool messages — LangGraph `messages-tuple` can
          // emit tool-result events out of order or replay them from subagent
          // state (e.g. bash subagent under LocalSandboxProvider with
          // allow_host_bash). When that happens, the tool message arrives after
          // a terminal group and lastOpenGroup() returns null. Previously we
          // dropped the message with console.error, silently hiding the tool
          // result from the UI. Attach to the most recent group instead so the
          // user can still see what the agent did.
          const lastGroup = groups[groups.length - 1];
          if (lastGroup) {
            lastGroup.messages.push(message);
          } else {
            // groups is empty (shouldn't happen — the outer for loop is guarded
            // by `messages.length === 0 -> return []`), but keep the diagnostic
            // just in case.
            console.error(
              "Unexpected tool message with no preceding group",
              message,
            );
          }
        }
      }
      continue;
    }

    if (message.type === "ai") {
      // A message with answer content and no tool calls becomes its own
      // assistant bubble below, which already renders the message's
      // reasoning_content inside the bubble's <Reasoning> collapsible. Such a
      // message must NOT also feed the processing group, or the ChainOfThought
      // panel above the bubble paints the identical reasoning a second time
      // (#3868). Intermediate reasoning (no content) and tool-calling steps
      // still belong in the processing group.
      const becomesAssistantBubble =
        hasContent(message) && !hasToolCalls(message);

      if (hasPresentFiles(message)) {
        groups.push({
          id: groupId,
          type: "assistant:present-files",
          messages: [message],
        });
      } else if (hasSubagent(message)) {
        groups.push({
          id: groupId,
          type: "assistant:subagent",
          messages: [message],
        });
      } else if (
        !becomesAssistantBubble &&
        (hasReasoning(message) || hasToolCalls(message))
      ) {
        const lastGroup = groups[groups.length - 1];
        // Accumulate consecutive intermediate AI messages into one processing group.
        if (lastGroup?.type !== "assistant:processing") {
          groups.push({
            id: groupId,
            type: "assistant:processing",
            messages: [message],
          });
        } else {
          lastGroup.messages.push(message);
        }
      }

      if (becomesAssistantBubble) {
        groups.push({ id: groupId, type: "assistant", messages: [message] });
      }
    }
  }

  return groups;
}

// Processing belongs to the whole user turn, not only its latest message.
export function getActiveTurnStartIndex(groups: MessageGroup[]): number {
  for (let index = groups.length - 1; index >= 0; index--) {
    if (groups[index]?.type === "human") return index + 1;
  }
  return 0;
}

export function groupMessages<T>(
  messages: Message[],
  mapper: (group: MessageGroup) => T,
): T[] {
  return getMessageGroups(messages)
    .map(mapper)
    .filter((result) => result !== undefined && result !== null) as T[];
}

export function getAssistantTurnUsageMessages(groups: MessageGroup[]) {
  const usageMessagesByGroupIndex: Array<Message[] | null> = Array.from(
    { length: groups.length },
    () => null,
  );

  let turnStartIndex: number | null = null;

  for (const [index, group] of groups.entries()) {
    if (group.type === "human") {
      turnStartIndex = null;
      continue;
    }

    turnStartIndex ??= index;

    const nextGroup = groups[index + 1];
    const isTurnEnd = !nextGroup || nextGroup.type === "human";

    if (!isTurnEnd) {
      continue;
    }

    usageMessagesByGroupIndex[index] = groups
      .slice(turnStartIndex, index + 1)
      .flatMap((currentGroup) => currentGroup.messages)
      .filter((message) => message.type === "ai");

    turnStartIndex = null;
  }

  return usageMessagesByGroupIndex;
}

type MessageMetadataLookup = (
  message: Message,
  index: number,
) => { streamMetadata?: Record<string, unknown> } | undefined;

export type StreamingMessageLookup = {
  ids: ReadonlySet<string>;
  messages: ReadonlySet<Message>;
};

const INTERNAL_STREAM_RUN_NAMES = new Set([
  "memory_agent",
  "summary_agent",
  "title_agent",
]);

export function isInternalStreamMetadata(
  metadata: Record<string, unknown> | undefined,
) {
  if (!metadata) return false;
  const caller = metadata.caller;
  if (typeof caller === "string" && caller.startsWith("middleware:")) {
    return true;
  }
  const runName = metadata.run_name ?? metadata.name;
  if (typeof runName === "string" && INTERNAL_STREAM_RUN_NAMES.has(runName)) {
    return true;
  }
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  return tags.some(
    (tag) =>
      typeof tag === "string" &&
      (tag === "nostream" || tag.startsWith("middleware:")),
  );
}

export function getStreamingMessageLookup(
  messages: Message[],
  isStreaming: boolean,
  getMessagesMetadata?: MessageMetadataLookup,
): StreamingMessageLookup {
  const streamingMessageIds = new Set<string>();
  const streamingMessages = new Set<Message>();

  if (!isStreaming) {
    return {
      ids: streamingMessageIds,
      messages: streamingMessages,
    };
  }

  messages.forEach((message, index) => {
    if (!getMessagesMetadata?.(message, index)?.streamMetadata) {
      return;
    }

    if (typeof message.id === "string" && message.id.length > 0) {
      streamingMessageIds.add(message.id);
    }
    streamingMessages.add(message);
  });

  return {
    ids: streamingMessageIds,
    messages: streamingMessages,
  };
}

export function isAssistantMessageGroupStreaming(
  groupMessages: Message[],
  streamingMessages: StreamingMessageLookup,
) {
  return groupMessages.some((message) => {
    if (message.type !== "ai") {
      return false;
    }

    return (
      (typeof message.id === "string" &&
        message.id.length > 0 &&
        streamingMessages.ids.has(message.id)) ||
      streamingMessages.messages.has(message)
    );
  });
}

export function getAssistantTurnCopyData(
  messages: Message[],
  { isStreaming = false }: { isStreaming?: boolean } = {},
) {
  if (isStreaming) {
    return null;
  }

  return (
    [...messages]
      .reverse()
      .filter((message) => message.type === "ai")
      .map((message) => {
        const content = extractContentFromMessage(message);
        return content ?? extractReasoningContentFromMessage(message) ?? "";
      })
      .find((content) => content.length > 0) ?? null
  );
}

export function getMessageCopyData(message: Message) {
  const content = extractContentFromMessage(message);
  if (message.type === "human") {
    return stripUploadedFilesTag(content);
  }
  if (content.length > 0) {
    return content;
  }
  return extractReasoningContentFromMessage(message) ?? "";
}

export function extractTextFromMessage(message: Message) {
  if (typeof message.content === "string") {
    return (
      splitInlineReasoningFromAIMessage(message)?.content ??
      message.content.trim()
    );
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((content) =>
        typeof content === "string"
          ? content
          : content.type === "text"
            ? content.text
            : "",
      )
      .join("\n")
      .trim();
  }
  return "";
}

const THINK_OPEN_TAG = "<think>";
const THINK_TAG_RE = /<think>\s*([\s\S]*?)\s*<\/think>/g;

function splitInlineReasoning(content: string) {
  const reasoningParts: string[] = [];

  // First pass: strip every fully closed `<think>...</think>` pair and
  // collect its body as reasoning.
  let cleaned = content.replace(THINK_TAG_RE, (_, reasoning: string) => {
    const normalized = reasoning.trim();
    if (normalized) {
      reasoningParts.push(normalized);
    }
    return "";
  });

  // Streaming-safe pass: a `<think>` opener whose `</think>` has not arrived
  // yet means the rest of the chunk is reasoning in flight. Route it into the
  // reasoning slot instead of letting it render as message content (the
  // raw-HTML markdown pipeline would otherwise paint the inner text on
  // screen until the closing tag lands).
  //
  // Skip when the opener sits right after a backtick — that is the model
  // talking about `<think>` literally inside markdown inline code, not
  // actually streaming reasoning.
  const openTagIndex = cleaned.indexOf(THINK_OPEN_TAG);
  if (openTagIndex !== -1 && cleaned[openTagIndex - 1] !== "`") {
    const tail = cleaned.slice(openTagIndex + THINK_OPEN_TAG.length).trim();
    if (tail) {
      reasoningParts.push(tail);
    }
    cleaned = cleaned.slice(0, openTagIndex);
  }

  return {
    // Compatibility for messages persisted before citation metadata stopped
    // being appended to assistant content.
    content: stripLegacyCitationArtifacts(cleaned),
    reasoning: reasoningParts.length > 0 ? reasoningParts.join("\n\n") : null,
  };
}

function splitInlineReasoningFromAIMessage(message: Message) {
  if (message.type !== "ai" || typeof message.content !== "string") {
    return null;
  }
  return splitInlineReasoning(message.content);
}

export function extractContentFromMessage(message: Message) {
  if (typeof message.content === "string") {
    return (
      splitInlineReasoningFromAIMessage(message)?.content ??
      message.content.trim()
    );
  }
  if (Array.isArray(message.content)) {
    const content = message.content
      .map((content) => {
        if (typeof content === "string") {
          return content;
        }
        switch (content.type) {
          case "text":
            return content.text;
          case "image_url":
            const imageURL = extractURLFromImageURLContent(content.image_url);
            return `![image](${imageURL})`;
          default:
            return "";
        }
      })
      .join("\n")
      .trim();
    return message.type === "ai"
      ? stripLegacyCitationArtifacts(content)
      : content;
  }
  return "";
}

export function extractReasoningContentFromMessage(message: Message) {
  if (message.type !== "ai") {
    return null;
  }
  if (
    message.additional_kwargs &&
    "reasoning_content" in message.additional_kwargs
  ) {
    return message.additional_kwargs.reasoning_content as string | null;
  }
  if (Array.isArray(message.content)) {
    const part = message.content[0];
    if (part && typeof part === "object" && "thinking" in part) {
      return part.thinking as string;
    }
  }
  if (typeof message.content === "string") {
    return splitInlineReasoning(message.content).reasoning;
  }
  return null;
}

export function removeReasoningContentFromMessage(message: Message) {
  if (message.type !== "ai" || !message.additional_kwargs) {
    return;
  }
  delete message.additional_kwargs.reasoning_content;
}

export function extractURLFromImageURLContent(
  content:
    | string
    | {
        url: string;
      },
) {
  if (typeof content === "string") {
    return content;
  }
  return content.url;
}

export function hasContent(message: Message) {
  if (typeof message.content === "string") {
    return (
      (
        splitInlineReasoningFromAIMessage(message)?.content ??
        message.content.trim()
      ).length > 0
    );
  }
  if (Array.isArray(message.content)) {
    return message.content.length > 0;
  }
  return false;
}

export function hasReasoning(message: Message) {
  if (message.type !== "ai") {
    return false;
  }
  if (typeof message.additional_kwargs?.reasoning_content === "string") {
    return true;
  }
  if (Array.isArray(message.content)) {
    const part = message.content[0];
    // Compatible with the Anthropic gateway
    return (part as unknown as { type: "thinking" })?.type === "thinking";
  }
  if (typeof message.content === "string") {
    return splitInlineReasoning(message.content).reasoning !== null;
  }
  return false;
}

export function hasToolCalls(message: Message) {
  return (
    message.type === "ai" && message.tool_calls && message.tool_calls.length > 0
  );
}

export function hasPresentFiles(message: Message) {
  return (
    message.type === "ai" &&
    message.tool_calls?.some((toolCall) => toolCall.name === "present_files")
  );
}

export function isClarificationToolMessage(message: Message) {
  return message.type === "tool" && message.name === "ask_clarification";
}

export function extractPresentFilesFromMessage(message: Message) {
  if (message.type !== "ai" || !hasPresentFiles(message)) {
    return [];
  }
  const files: string[] = [];
  for (const toolCall of message.tool_calls ?? []) {
    if (
      toolCall.name === "present_files" &&
      Array.isArray(toolCall.args.filepaths)
    ) {
      files.push(...(toolCall.args.filepaths as string[]));
    }
  }
  return files;
}

/**
 * Return files published by this message/turn, without reading cumulative
 * thread state.  The metadata path covers tools such as finish_ppt and
 * web_capture that publish artifacts directly; the present_files call path
 * keeps older and in-flight messages compatible.
 */
export function extractPresentedFilesFromMessage(message: Message) {
  const files = extractPresentFilesFromMessage(message).filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
  const metadataFiles = message.additional_kwargs?.presented_files;
  if (Array.isArray(metadataFiles)) {
    files.push(
      ...metadataFiles.filter(
        (path): path is string => typeof path === "string" && path.length > 0,
      ),
    );
  }
  // Keep delivery cards visible for messages persisted before the explicit
  // presented_files marker was added. Only parse the known finish_ppt payload;
  // arbitrary tool output must never become a file card.
  if (
    message.additional_kwargs?.ppt_delivery &&
    typeof message.content === "string"
  ) {
    try {
      const payload: unknown = JSON.parse(message.content);
      if (typeof payload === "object" && payload !== null) {
        const deliveryFiles = Reflect.get(payload, "files");
        if (Array.isArray(deliveryFiles)) {
          files.push(
            ...deliveryFiles.filter(
              (path): path is string =>
                typeof path === "string" && path.length > 0,
            ),
          );
        }
      }
    } catch {
      // Older failed/partial delivery messages are not file publications.
    }
  }
  const uniqueFiles = [...new Set(files)];
  // review.json is a private PPT validation report, never a user-facing file.
  return uniqueFiles.filter((path) => !isPptReviewArtifactPath(path));
}

export function isPptDeliveryMessage(message: Message) {
  return (
    message.additional_kwargs?.ppt_delivery === true ||
    (message.type === "tool" && message.name === "finish_ppt") ||
    extractPresentedFilesFromMessage(message).some((path) =>
      /\.(?:pptx?|potx?)$/i.test(path),
    )
  );
}

export function isPptReviewArtifactPath(path: string) {
  return path.split("/").pop()?.toLowerCase() === "review.json";
}

export function hasSubagent(message: AIMessage) {
  for (const toolCall of message.tool_calls ?? []) {
    if (toolCall.name === "task") {
      return true;
    }
  }
  return false;
}

export function findToolCallResult(toolCallId: string, messages: Message[]) {
  for (const message of messages) {
    if (message.type === "tool" && message.tool_call_id === toolCallId) {
      const content = extractTextFromMessage(message);
      if (content) {
        return content;
      }
    }
  }
  return undefined;
}

export function isHiddenFromUIMessage(message: Message) {
  const content = extractTextFromMessage(message);
  const messageId = typeof message.id === "string" ? message.id : "";
  return (
    message.additional_kwargs?.hide_from_ui === true ||
    message.additional_kwargs?.dynamic_context_reminder === true ||
    (message.type === "human" && messageId.endsWith("__memory")) ||
    (typeof message.name === "string" &&
      HIDDEN_CONTROL_MESSAGE_NAMES.has(message.name)) ||
    (message.type === "human" &&
      content.includes("<slash_skill_activation>") &&
      stripUploadedFilesTag(content).length === 0)
  );
}

/**
 * Represents a file stored in message additional_kwargs.files.
 * Used for optimistic UI (uploading state) and structured file metadata.
 */
export interface FileInMessage {
  filename: string;
  size: number; // bytes
  path?: string; // virtual path, may not be set during upload
  status?: "uploading" | "uploaded";
}

/**
 * Strip backend-injected human context from message content.
 *
 * The normal upload middleware uses XML tags, while older/replayed messages
 * can contain HTML-escaped tags inside the prompt-sanitization boundary. Both
 * forms are transport context, not text the user typed, so callers must remove
 * them before rendering or copying a human message.
 */
export function stripUploadedFilesTag(content: string): string {
  return content
    .replace(/^\s*--- BEGIN USER INPUT ---\s*/i, "")
    .replace(/\s*--- END USER INPUT ---\s*$/i, "")
    .replace(
      /(?:<|&lt;)\s*(uploaded_files|slash_skill_activation)\s*(?:>|&gt;)[\s\S]*?(?:<|&lt;)\s*\/\s*\1\s*(?:>|&gt;)/gi,
      "",
    )
    .trim();
}

/**
 * Tag names that backend middlewares wrap around internal payloads before
 * letting them ride along inside LangGraph message ``content``.
 *
 * These markers are *not* user copy — they come from:
 *
 * - ``UploadsMiddleware`` → ``<uploaded_files>``
 * - ``SkillActivationMiddleware`` → ``<slash_skill_activation>``
 * - ``DynamicContextMiddleware`` → ``<system-reminder>`` (carrying
 *   ``<memory>`` / ``<current_date>`` inside)
 * - ``TodoListMiddleware`` / ``LoopDetectionMiddleware`` style reminders
 *   live in ``hide_from_ui`` HumanMessages, but their inner payload uses
 *   the same tag vocabulary.
 *
 * The primary export filter is {@link isHiddenFromUIMessage}. This list is
 * the defence-in-depth strip for any message that — by middleware bug,
 * provider quirk, or merge-conflict regression — slips through without
 * its ``hide_from_ui`` flag set.
 */
export const INTERNAL_MARKER_TAGS = [
  "uploaded_files",
  "slash_skill_activation",
  "system-reminder",
  "memory",
  "current_date",
] as const;

const INTERNAL_MARKER_RE = new RegExp(
  `<(${INTERNAL_MARKER_TAGS.join("|")})>[\\s\\S]*?</\\1>`,
  "g",
);

/**
 * Strip every known backend-injected marker from message content.
 *
 * Intended for the chat export path where a marker leaking through is a
 * privacy regression. UI render paths should keep using
 * {@link stripUploadedFilesTag} — they receive ``hide_from_ui`` messages
 * via a separate filter and the narrower function avoids stripping content
 * a user might legitimately type into a meta-discussion (e.g. asking the
 * model about its own ``<memory>`` system).
 */
export function stripInternalMarkers(content: string): string {
  return stripLegacyCitationArtifacts(content.replace(INTERNAL_MARKER_RE, ""));
}

export function parseUploadedFiles(content: string): FileInMessage[] {
  // Match <uploaded_files>...</uploaded_files> tag
  const uploadedFilesRegex = /<uploaded_files>([\s\S]*?)<\/uploaded_files>/;
  // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
  const match = content.match(uploadedFilesRegex);

  if (!match) {
    return [];
  }

  const uploadedFilesContent = match[1];

  // Check if it's "No files have been uploaded yet."
  if (uploadedFilesContent?.includes("No files have been uploaded yet.")) {
    return [];
  }

  // Check if the backend reported no new files were uploaded in this message
  if (uploadedFilesContent?.includes("(empty)")) {
    return [];
  }

  // Parse file list
  // Format: - filename (size)\n  Path: /path/to/file
  const fileRegex = /- ([^\n(]+)\s*\(([^)]+)\)\s*\n\s*Path:\s*([^\n]+)/g;
  const files: FileInMessage[] = [];
  let fileMatch;

  while ((fileMatch = fileRegex.exec(uploadedFilesContent ?? "")) !== null) {
    files.push({
      filename: fileMatch[1].trim(),
      size: parseInt(fileMatch[2].trim(), 10) ?? 0,
      path: fileMatch[3].trim(),
    });
  }

  return files;
}
