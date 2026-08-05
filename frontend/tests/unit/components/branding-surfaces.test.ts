import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@rstest/core";

const FRONTEND_ROOT = resolve(__dirname, "../../..");

function source(path: string) {
  return readFileSync(resolve(FRONTEND_ROOT, path), "utf8");
}

test("public root enters through login instead of the upstream landing page", () => {
  const page = source("src/app/page.tsx");
  const login = source("src/app/(auth)/login/page.tsx");
  const authProvider = source("src/core/auth/AuthProvider.tsx");
  const themeProvider = source("src/components/theme-provider.tsx");

  expect(page).toContain('redirect("/login")');
  expect(page).not.toContain("@/components/landing");
  expect(login).not.toContain("t.login.backToHome");
  expect(login).not.toContain('<Link href="/"');
  expect(authProvider).toContain('router.replace("/login")');
  expect(authProvider).toContain('window.location.replace("/login")');
  expect(authProvider).not.toContain('router.push("/")');
  expect(authProvider).not.toContain('window.location.href = "/"');
  expect(themeProvider).not.toContain("forcedTheme");
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

test("settings and settings-menu apps fill the available viewport", () => {
  const nav = source("src/components/workspace/workspace-nav-menu.tsx");
  const settings = source(
    "src/components/workspace/settings/settings-dialog.tsx",
  );
  const closeButton = source(
    "src/components/workspace/fullscreen-dialog-close-button.tsx",
  );

  expect(nav).toContain("setDialogApp(app)");
  for (const dialog of [nav, settings]) {
    expect(dialog).toContain("h-dvh");
    expect(dialog).toContain("w-screen");
    expect(dialog).toContain("max-w-none");
    expect(dialog).toContain("rounded-none border-0");
    expect(dialog).not.toContain("h-[75vh]");
    expect(dialog).not.toContain("100vh-2rem");
  }
  expect(settings).toContain('className="text-xl"');
  expect(settings).not.toContain('className="text-2xl"');
  expect(closeButton).toContain("size-11");
  expect(closeButton).toContain("rounded-full");
  expect(nav).toContain('event.data?.type === "deerflow:workspace-app:close"');
  expect(nav).toContain("dialogAppFrameRef");
  expect(settings).toContain("md:grid-cols-[260px_minmax(0,1fr)]");
  expect(nav).toContain("src={dialogApp.embedUrl}");
  expect(nav).not.toContain("router.push(app.href)");
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
