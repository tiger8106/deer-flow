import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "@rstest/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MessageListItem } from "@/components/workspace/messages/message-list-item";
import { I18nContext } from "@/core/i18n/context";

describe("MessageListItem uploaded images", () => {
  it("uses an in-page dialog trigger instead of opening a new tab", () => {
    const html = renderToStaticMarkup(
      createElement(
        I18nContext.Provider,
        {
          value: {
            locale: "zh-CN",
            setLocale: () => undefined,
          },
        },
        createElement(MessageListItem, {
          message: {
            id: "human-image",
            type: "human",
            content: "",
            additional_kwargs: {
              files: [
                {
                  filename: "现场照片.png",
                  size: 1024,
                  path: "/mnt/user-data/uploads/现场照片.png",
                },
              ],
            },
          } as Message,
          threadId: "thread-1",
          showCopyButton: false,
        }),
      ),
    );

    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="预览: 现场照片.png"');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('<a href="');
  });

  it("opens images in assistant answers in the current-window dialog", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        {
          client: queryClient,
        },
        createElement(
          I18nContext.Provider,
          {
            value: {
              locale: "zh-CN",
              setLocale: () => undefined,
            },
          },
          createElement(MessageListItem, {
            message: {
              id: "assistant-image",
              type: "ai",
              content: "![流程图](/mnt/user-data/outputs/流程图.png)",
              additional_kwargs: {},
            } as Message,
            threadId: "thread-1",
            showCopyButton: false,
          }),
        ),
      ),
    );

    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="预览: 流程图"');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('<a href="');
  });
});
