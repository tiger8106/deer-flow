export type WorkspaceApp = {
  id: string;
  href: string;
  embedUrl: string;
  labels: {
    "en-US": string;
    "zh-CN": string;
  };
  icon: string;
  placement?: "sidebar" | "settings-menu";
  requiredSystemRole?: "admin" | "user";
  chatInput?: {
    scopeEndpoint: string;
    labels: {
      "en-US": string;
      "zh-CN": string;
    };
    allLabel: {
      "en-US": string;
      "zh-CN": string;
    };
  };
};

export function canAccessWorkspaceApp(
  app: WorkspaceApp,
  systemRole: "admin" | "user" | undefined,
): boolean {
  return !app.requiredSystemRole || app.requiredSystemRole === systemRole;
}

export function getWorkspaceAppLabel(
  app: WorkspaceApp,
  locale: string,
): string {
  return locale.startsWith("zh") ? app.labels["zh-CN"] : app.labels["en-US"];
}

export function getWorkspaceAppChatInputLabel(
  app: WorkspaceApp,
  locale: string,
): string {
  const labels = app.chatInput?.labels;
  if (!labels) return getWorkspaceAppLabel(app, locale);
  return locale.startsWith("zh") ? labels["zh-CN"] : labels["en-US"];
}

export function getWorkspaceAppAllScopeLabel(
  app: WorkspaceApp,
  locale: string,
): string {
  const labels = app.chatInput?.allLabel;
  if (!labels) return getWorkspaceAppLabel(app, locale);
  return locale.startsWith("zh") ? labels["zh-CN"] : labels["en-US"];
}
