import { expect, test } from "@playwright/test";

import { mockLangGraphAPI, MOCK_THREAD_ID } from "./utils/mock-api";

test("opens a slow PDF artifact at page width after its first paint", async ({
  page,
}) => {
  await page.route("**/api/threads/*/messages/page*", (route) =>
    route.fulfill({
      json: { data: [], has_more: false, next_before_seq: null },
    }),
  );
  const name = "封面 #1.pdf";
  const path = `/mnt/user-data/outputs/${name}`;
  mockLangGraphAPI(page, {
    threads: [
      {
        thread_id: MOCK_THREAD_ID,
        title: "PDF preview",
        artifacts: [path],
        messages: [
          {
            type: "human",
            id: "pdf-request",
            content: "生成 PDF",
          },
          {
            type: "ai",
            id: "pdf-answer",
            content: "文档已生成。",
            additional_kwargs: { presented_files: [path] },
          },
        ],
      },
    ],
  });
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => decodeURIComponent(url.pathname).endsWith(path),
    async (route) => {
      await delayed;
      await route.fulfill({
        contentType: "application/pdf",
        path: "tests/e2e/fixtures/two-pages.pdf",
      });
    },
  );
  await page.goto(`/workspace/chats/${MOCK_THREAD_ID}`);
  await page.getByText(name, { exact: true }).first().click();
  const viewer = page.frameLocator(`iframe[title="${name}"]`);
  try {
    await expect(viewer.locator("#preview-status")).toBeVisible();
    await expect(viewer.locator(".preview-painted")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(
    viewer
      .locator('.page[data-page-number="1"].preview-painted canvas')
      .first(),
  ).toBeVisible();
  await expect(viewer.locator("#preview-status")).toBeHidden();
});
