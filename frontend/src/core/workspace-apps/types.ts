export type WorkspaceApp = {
  id: string;
  href: string;
  embedUrl: string;
  labels: {
    "en-US": string;
    "zh-CN": string;
  };
  icon: string;
};

export function getWorkspaceAppLabel(
  app: WorkspaceApp,
  locale: string,
): string {
  return locale.startsWith("zh") ? app.labels["zh-CN"] : app.labels["en-US"];
}
