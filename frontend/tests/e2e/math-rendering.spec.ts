import { expect, test } from "@playwright/test";

import { mockLangGraphAPI, MOCK_THREAD_ID } from "./utils/mock-api";

const answer = String.raw`## 最大赫兹接触应力公式

$$
\sigma_{max} = \sqrt[3]{\frac{6 F {E^*}^2}{\pi^3 R^2}}
$$

其中：$E^*$ 是等效弹性模量。

## 等效弹性模量计算

$$
\frac{1}{E^*} = \frac{1-\nu_1^2}{E_1} + \frac{1-\nu_2^2}{E_2}
$$

**公式说明**：[原文出处](/source-fixture)
`;

test("starred knowledge formulas render during streaming and after reload", async ({
  page,
}) => {
  const conversation = {
    thread_id: MOCK_THREAD_ID,
    title: "公式渲染验证",
    messages: [] as Record<string, unknown>[],
  };
  mockLangGraphAPI(page, { threads: [conversation] });
  await page.route("**/api/threads/*/messages/page*", (route) =>
    route.fulfill({ json: { data: [], has_more: false } }),
  );
  await page.route("**/api/langgraph/threads/*/runs/stream", async (route) => {
    const human = route.request().postDataJSON().input.messages.at(-1);
    const ai = { id: "math-answer", type: "ai", content: answer };
    conversation.messages = [human, ai];
    const events = [
      {
        event: "metadata",
        data: { run_id: "math-run", thread_id: MOCK_THREAD_ID },
      },
      {
        event: "values",
        data: { messages: [human, { ...ai, content: answer.slice(0, 70) }] },
      },
      { event: "values", data: { messages: [human, ai] } },
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
  const input = page.locator("textarea[name='message']");
  await input.fill("材料接触应力如何计算？");
  await input.press("Enter");
  for (let iteration = 0; iteration < 2; iteration++) {
    await expect(page.locator(".katex-display")).toHaveCount(2);
    await expect(page.locator(".katex-error")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "原文出处" })).toBeVisible();
    await expect(page.getByText("公式说明", { exact: true })).toBeVisible();
    expect(await page.locator('[role="log"]').innerText()).not.toContain("$$*");
    if (iteration === 0) await page.reload();
  }
});
