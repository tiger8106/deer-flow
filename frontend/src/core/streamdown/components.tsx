"use client";

import {
  MessageResponse,
  type MessageResponseProps,
} from "@/components/ai-elements/message";
import {
  ReasoningContent,
  type ReasoningContentProps,
} from "@/components/ai-elements/reasoning";
import {
  ClipboardSafeStreamdown,
  type ClipboardSafeStreamdownProps,
} from "@/components/ai-elements/streamdown";

import {
  shouldCompleteStreamdownMarkdown,
  useSafeStreamdownChildren,
  useSafeStreamdownMarkdown,
} from "./safe-children";

export function SafeStreamdown({
  children,
  parseIncompleteMarkdown,
  ...props
}: ClipboardSafeStreamdownProps) {
  const safeChildren = useSafeStreamdownChildren(children);
  const completeMarkdown = shouldCompleteStreamdownMarkdown(
    safeChildren,
    parseIncompleteMarkdown,
  );

  return (
    <ClipboardSafeStreamdown
      key={String(completeMarkdown)}
      {...props}
      parseIncompleteMarkdown={completeMarkdown}
    >
      {safeChildren}
    </ClipboardSafeStreamdown>
  );
}

export function SafeMessageResponse({
  children,
  parseIncompleteMarkdown,
  ...props
}: MessageResponseProps) {
  const safeChildren = useSafeStreamdownChildren(children);
  const completeMarkdown = shouldCompleteStreamdownMarkdown(
    safeChildren,
    parseIncompleteMarkdown,
  );

  // Upstream memo comparators only compare content, not completion mode.
  // Remount when the mode changes so a settled reply cannot retain guessed syntax.
  return (
    <MessageResponse
      key={String(completeMarkdown)}
      {...props}
      parseIncompleteMarkdown={completeMarkdown}
    >
      {safeChildren}
    </MessageResponse>
  );
}

export function SafeReasoningContent({
  children,
  ...props
}: ReasoningContentProps) {
  const safeChildren = useSafeStreamdownMarkdown(children);

  return <ReasoningContent {...props}>{safeChildren}</ReasoningContent>;
}
