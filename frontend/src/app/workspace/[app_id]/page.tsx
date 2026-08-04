import { notFound } from "next/navigation";

import { getServerSideUser } from "@/core/auth/server";
import { detectLocaleServer } from "@/core/i18n/server";
import { getWorkspaceApps } from "@/core/workspace-apps/server";
import { getWorkspaceAppLabel } from "@/core/workspace-apps/types";

export default async function WorkspaceAppPage({
  params,
}: {
  params: Promise<{ app_id: string }>;
}) {
  const { app_id: appId } = await params;
  const app = getWorkspaceApps().find((item) => item.id === appId);
  if (!app) notFound();
  if (app.requiredSystemRole) {
    const result = await getServerSideUser();
    if (
      result.tag !== "authenticated" ||
      result.user.system_role !== app.requiredSystemRole
    ) {
      notFound();
    }
  }
  const locale = await detectLocaleServer();

  return (
    <iframe
      className="size-full min-h-0 border-0"
      src={app.embedUrl}
      title={getWorkspaceAppLabel(app, locale)}
    />
  );
}
