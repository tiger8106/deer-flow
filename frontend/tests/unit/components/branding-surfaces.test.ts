import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@rstest/core";

const FRONTEND_ROOT = resolve(__dirname, "../../..");

function source(path: string) {
  return readFileSync(resolve(FRONTEND_ROOT, path), "utf8");
}

test("public root enters through login instead of the upstream landing page", () => {
  const page = source("src/app/page.tsx");

  expect(page).toContain('redirect("/login")');
  expect(page).not.toContain("@/components/landing");
});

test("workspace menus do not expose upstream links, channels, or about", () => {
  const nav = source("src/components/workspace/workspace-nav-menu.tsx");
  const settings = source(
    "src/components/workspace/settings/settings-dialog.tsx",
  );
  const header = source("src/components/workspace/workspace-container.tsx");
  const combined = `${nav}\n${settings}\n${header}`;

  expect(combined).not.toMatch(/deerflow\.tech|bytedance\/deer-flow/);
  expect(settings).not.toContain('id: "channels"');
  expect(settings).not.toContain('id: "about"');
  expect(nav).not.toContain("reportIssue");
  expect(nav).not.toContain("contactUs");
});

test("Tiger logo is present and active branding surfaces use Tiger", () => {
  expect(
    existsSync(resolve(FRONTEND_ROOT, "public/images/tiger-logo.png")),
  ).toBe(true);
  expect(existsSync(resolve(FRONTEND_ROOT, "src/app/icon.png"))).toBe(true);

  const surfaces = [
    "src/app/layout.tsx",
    "src/app/(auth)/login/page.tsx",
    "src/app/(auth)/setup/page.tsx",
    "src/components/tiger-brand.tsx",
    "src/components/workspace/workspace-header.tsx",
  ].map(source);

  expect(surfaces.join("\n")).toContain("Tiger");
  expect(surfaces.join("\n")).not.toContain("DeerFlow");
});
