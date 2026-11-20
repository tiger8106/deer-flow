import { expect, test } from "@playwright/test";

import {
  mockLangGraphAPI,
  MOCK_THREAD_ID,
  MOCK_THREAD_ID_2,
} from "./utils/mock-api";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/threads/*/messages/page*", (route) =>
    route.fulfill({
      json: { data: [], has_more: false, next_before_seq: null },
    }),
  );
});

function generatedTurn(index: number, human: Record<string, unknown>) {
  return [
    human,
    {
      type: "ai",
      id: `progress-${index}`,
      content: "正在整理图片中的框架。",
      additional_kwargs: { deerflow_processing: true },
    },
    {
      type: "tool",
      id: `delivery-${index}`,
      name: "finish_ppt",
      tool_call_id: `finish-${index}`,
      content: "ready",
      additional_kwargs: {
        ppt_delivery: true,
        presented_files: [
          `/mnt/user-data/outputs/turn-${index}/能源架构-${index}.pptx`,
        ],
      },
    },
    {
      type: "ai",
      id: `answer-${index}`,
      content: `第${index}份演示文稿已完成。`,
    },
  ];
}

test("repeated PPT turns survive partial snapshots, navigation and reload with separate files", async ({
  page,
}) => {
  const initial = generatedTurn(1, {
    type: "human",
    id: "human-1",
    content: "第一张图片转PPT",
  });
  const conversation = {
    thread_id: MOCK_THREAD_ID,
    title: "能源架构演示文稿",
    messages: initial,
  };
  mockLangGraphAPI(page, {
    threads: [conversation, { thread_id: MOCK_THREAD_ID_2, title: "其他会话" }],
  });
  await page.route("**/api/langgraph/threads/*/runs/stream", async (route) => {
    const body = route.request().postDataJSON();
    const human = body.input.messages.at(-1);
    expect(human.id).toBeTruthy();
    // Date/context injection replaces the submitted ID even on a later turn (midnight).
    const next = generatedTurn(2, {
      ...human,
      id: `${human.id}__user`,
      additional_kwargs: {
        ...human.additional_kwargs,
        deerflow_original_message_id: human.id,
      },
    });
    const reminder = {
      type: "system",
      id: human.id,
      content: "date",
      additional_kwargs: { hide_from_ui: true },
    };
    conversation.messages = [...initial, ...next];
    const events = [
      {
        event: "metadata",
        data: { run_id: "run-second", thread_id: MOCK_THREAD_ID },
      },
      { event: "values", data: { messages: [...initial, reminder, next[1]] } },
      {
        event: "values",
        data: {
          messages: [...initial, reminder, next[1], next[0], ...next.slice(2)],
        },
      },
      { event: "values", data: { messages: initial } },
      { event: "end", data: {} },
    ];
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: events
        .map(
          (event) =>
            `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
        )
        .join(""),
    });
  });
  await page.goto(`/workspace/chats/${MOCK_THREAD_ID}`);
  await expect(
    page.getByText("第1份演示文稿已完成。", { exact: true }),
  ).toBeVisible();
  const input = page.locator("textarea[name='message']");
  await input.fill("第二张图片转PPT");
  await input.press("Enter");
  await expect(
    page.getByText("第2份演示文稿已完成。", { exact: true }),
  ).toBeVisible();
  for (const text of [
    "第一张图片转PPT",
    "第二张图片转PPT",
    "第1份演示文稿已完成。",
    "第2份演示文稿已完成。",
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(1);
  const cards = page.getByTestId("conversation-artifacts");
  await expect(cards).toHaveCount(2);
  await expect(
    cards.nth(0).getByRole("link", { name: /download/i }),
  ).toHaveAttribute("href", /turn-1/);
  await expect(
    cards.nth(1).getByRole("link", { name: /download/i }),
  ).toHaveAttribute("href", /turn-2/);
  await page.getByText("其他会话", { exact: true }).click();
  await page.getByText("能源架构演示文稿", { exact: true }).first().click();
  await expect(
    page.getByText("第二张图片转PPT", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("conversation-artifacts")).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByText("第二张图片转PPT", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("conversation-artifacts")).toHaveCount(2);
});

test("first input survives context rewriting and an identical later question remains distinct", async ({
  page,
}) => {
  const conversation = {
    thread_id: MOCK_THREAD_ID,
    title: "重复输入验证",
    messages: [] as Record<string, unknown>[],
  };
  mockLangGraphAPI(page, { threads: [conversation] });
  let turn = 0;
  await page.route("**/api/langgraph/threads/*/runs/stream", async (route) => {
    const human = route.request().postDataJSON().input.messages.at(-1);
    const reminder = {
      type: "system",
      id: human.id,
      content: "date",
      additional_kwargs: { hide_from_ui: true },
    };
    const next = generatedTurn(++turn, {
      ...human,
      id: `${human.id}__user`,
      additional_kwargs: { deerflow_original_message_id: human.id },
    });
    const prior = conversation.messages;
    conversation.messages = [...prior, ...next];
    const events = [
      {
        event: "metadata",
        data: { run_id: `run-${turn}`, thread_id: MOCK_THREAD_ID },
      },
      { event: "values", data: { messages: [...prior, reminder, next[1]] } },
      { event: "values", data: { messages: [...prior, reminder, ...next] } },
      { event: "end", data: {} },
    ];
    await route.fulfill({
      contentType: "text/event-stream",
      body: events
        .map(
          (event) =>
            `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
        )
        .join(""),
    });
  });
  await page.goto(`/workspace/chats/${MOCK_THREAD_ID}`);
  for (let index = 1; index <= 2; index++) {
    const input = page.locator("textarea[name='message']");
    await input.fill("将图片转换成PPT");
    await input.press("Enter");
    await expect(
      page.getByText(`第${index}份演示文稿已完成。`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("将图片转换成PPT", { exact: true }),
    ).toHaveCount(index);
  }
  await page.reload();
  await expect(page.getByText("将图片转换成PPT", { exact: true })).toHaveCount(
    2,
  );
});

for (const width of [1440, 390]) {
  test(`PPT preview shares the closable document pane at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    const messages = generatedTurn(1, {
      type: "human",
      id: "h",
      content: "生成PPT",
    });
    messages.push({
      type: "ai",
      id: "source",
      content:
        "[citation:来源预览](/source-fixture?preview=side-panel&preview_key=source)",
    });
    mockLangGraphAPI(page, {
      threads: [{ thread_id: MOCK_THREAD_ID, title: "预览", messages }],
    });
    await page.route("**/api/threads/*/artifacts/**?preview=true", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: "%PDF-1.4\n%%EOF",
      }),
    );
    await page.route("**/source-fixture?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<p id="title">Knowledge document preview</p><script>
          addEventListener('message', event => {
            if (event.source !== parent || event.origin !== location.origin) return;
            if (event.data.type === 'deerflow:external-preview:host') {
              document.querySelector('#title').hidden = true;
              parent.postMessage({type: 'deerflow:external-preview:state', navigationUrl: location.href,
                title: '超长文档标题'.repeat(30), downloadUrl: '/images/tiger-logo.png?version=2'}, location.origin);
            }
          });
          parent.postMessage({type: 'deerflow:external-preview:ready'}, location.origin);
        </script>`,
      }),
    );
    await page.goto(`/workspace/chats/${MOCK_THREAD_ID}`);
    const card = page
      .getByTestId("conversation-artifacts")
      .getByText("能源架构-1.pptx", { exact: true });
    await card.click();
    await expect(page.locator('iframe[title="能源架构-1.pptx"]')).toBeVisible();
    if (width === 1440) {
      await expect(
        page.locator('[data-slot="sidebar"][data-side="left"]'),
      ).toHaveAttribute("data-state", "expanded");
      await expect(card).toBeInViewport();
    }
    await page
      .getByRole("button", { name: "Expand preview", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Collapse preview", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Collapse preview", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await expect(page.locator('iframe[title="能源架构-1.pptx"]')).toHaveCount(
      0,
    );
    await page.getByRole("link", { name: "来源预览", exact: true }).click();
    await expect(page.locator('iframe[src*="source-fixture"]')).toBeVisible();
    const title = page
      .locator("span[title]")
      .filter({ hasText: "超长文档标题" });
    await expect(title).toBeVisible();
    const download = page.getByRole("button", {
      name: "Download",
      exact: true,
    });
    await expect(download).toBeVisible();
    await expect
      .poll(async () => {
        const titleBox = await title.boundingBox();
        const buttonBox = await download.boundingBox();
        return !!(
          titleBox &&
          buttonBox &&
          titleBox.x + titleBox.width <= buttonBox.x &&
          buttonBox.x + buttonBox.width <= width
        );
      })
      .toBe(true);
    const downloadEvent = page.waitForEvent("download");
    await download.click();
    // Native download requests bypass page.route in Chromium; use a real static file.
    const downloaded = await downloadEvent;
    expect(downloaded.suggestedFilename()).toBe("tiger-logo.png");
    expect(await downloaded.failure()).toBeNull();
    expect(page.context().pages()).toHaveLength(1);
    await page.getByRole("button", { name: /close/i }).last().click();
    await expect(page.locator('iframe[src*="source-fixture"]')).toHaveCount(0);
    await card.click();
    await expect(page.locator('iframe[title="能源架构-1.pptx"]')).toBeVisible();
    // The mobile sheet animates in from the right; assert its settled geometry.
    await expect
      .poll(async () => {
        const bounds = await page
          .locator('iframe[title="能源架构-1.pptx"]')
          .boundingBox();
        return Boolean(
          bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
        );
      })
      .toBe(true);
  });
}
