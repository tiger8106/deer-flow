import { expect, test } from "@playwright/test";

import { mockLangGraphAPI } from "./utils/mock-api";

test.describe("Tiger entry page", () => {
  test("skips the upstream landing page and shows Tiger branding", async ({
    page,
  }) => {
    mockLangGraphAPI(page);

    await page.goto("/");

    // Normal deployments stop on /login. Auth-disabled test deployments
    // immediately continue to the authenticated workspace.
    await page.waitForURL(/\/(login|workspace\/chats\/new)$/);
    await expect(
      page.getByText("Tiger", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /DeerFlow|official website|GitHub/i }),
    ).toHaveCount(0);
  });
});
