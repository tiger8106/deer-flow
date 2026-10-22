import { expect, test } from "@playwright/test";

import { mockLangGraphAPI, MOCK_THREAD_ID } from "./utils/mock-api";

for (const width of [1440, 390]) {
  test(`source-only file links open the sidebar without a new tab at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    const source = `${process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"}/knowledge/citation-preview?preview=side-panel&preview_key=book&document_id=book&sheet=s_bank&page=3&title=bank.xlsx`;
    mockLangGraphAPI(page, {
      threads: [
        {
          thread_id: MOCK_THREAD_ID,
          title: "Excel lookup",
          messages: [
            {
              type: "ai",
              id: "source-only",
              content: `已找到记录。\n\n检索来源（未标注具体引用位置）：[citation: 1](${source})\n\n[查看来源文件](${source})`,
            },
          ],
        },
      ],
    });
    await page.route("**/api/threads/*/messages/page*", (route) =>
      route.fulfill({
        json: { data: [], has_more: false, next_before_seq: null },
      }),
    );
    await page.route("**/knowledge/citation-preview?**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<main>Bank sheet PDF</main>",
      }),
    );
    await page.goto(`/workspace/chats/${MOCK_THREAD_ID}`);
    await page.getByRole("link", { name: "查看来源文件", exact: true }).click();
    await expect(page.locator('iframe[src*="sheet=s_bank"]')).toBeVisible();
    expect(page.context().pages()).toHaveLength(1);
    await page
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await page.locator("summary").filter({ hasText: "Used 1 source" }).click();
    await page
      .locator("details[open] a")
      .filter({ hasText: "bank.xlsx" })
      .click();
    await expect(page.locator('iframe[src*="sheet=s_bank"]')).toBeVisible();
    expect(page.context().pages()).toHaveLength(1);
  });
}
