import { z } from "zod";

import type { WorkspaceApp } from "./types";

const workspaceAppSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    href: z.string().regex(/^\/workspace\/[a-z0-9][a-z0-9-]*$/),
    embedUrl: z.string().regex(/^\/(?!\/)/),
    labels: z.object({
      "en-US": z.string().min(1),
      "zh-CN": z.string().min(1),
    }),
    icon: z.string().regex(/^[a-z0-9-]+$/),
    placement: z.enum(["sidebar", "settings-menu"]).optional(),
    requiredSystemRole: z.enum(["admin", "user"]).optional(),
    chatInput: z
      .object({
        scopeEndpoint: z.string().regex(/^\/(?!\/)/),
        labels: z.object({
          "en-US": z.string().min(1),
          "zh-CN": z.string().min(1),
        }),
        allLabel: z.object({
          "en-US": z.string().min(1),
          "zh-CN": z.string().min(1),
        }),
      })
      .optional(),
  })
  .refine((app) => app.href === `/workspace/${app.id}`, {
    message: "Workspace app href must match its id",
    path: ["href"],
  });

const workspaceAppsSchema = z.array(workspaceAppSchema);

export function parseWorkspaceApps(raw: string | undefined): WorkspaceApp[] {
  if (!raw?.trim()) return [];
  try {
    const apps = workspaceAppsSchema.parse(JSON.parse(raw));
    const ids = new Set<string>();
    const hrefs = new Set<string>();
    return apps.filter((app) => {
      if (ids.has(app.id) || hrefs.has(app.href)) return false;
      ids.add(app.id);
      hrefs.add(app.href);
      return true;
    });
  } catch {
    return [];
  }
}
