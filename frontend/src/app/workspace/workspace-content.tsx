import { cookies } from "next/headers";
import { Toaster } from "sonner";

import { QueryClientProvider } from "@/components/query-client-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/workspace/command-palette";
import { GatewayOfflineBanner } from "@/components/workspace/gateway-offline-banner";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { ToolDisplayLabelsProvider } from "@/core/tools/context";
import { getToolDisplayLabels } from "@/core/tools/server";
import { WorkspaceAppsProvider } from "@/core/workspace-apps/context";
import type { WorkspaceApp } from "@/core/workspace-apps/types";

function parseSidebarOpenCookie(
  value: string | undefined,
): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export async function WorkspaceContent({
  children,
  gatewayUnavailable = false,
  workspaceApps,
}: Readonly<{
  children: React.ReactNode;
  gatewayUnavailable?: boolean;
  workspaceApps: WorkspaceApp[];
}>) {
  const cookieStore = await cookies();
  const initialSidebarOpen = parseSidebarOpenCookie(
    cookieStore.get("sidebar_state")?.value,
  );
  const toolDisplayLabels = getToolDisplayLabels();

  return (
    <QueryClientProvider>
      <ToolDisplayLabelsProvider labels={toolDisplayLabels}>
        <WorkspaceAppsProvider apps={workspaceApps}>
          <SidebarProvider
            className="h-screen"
            defaultOpen={initialSidebarOpen}
          >
            <WorkspaceSidebar workspaceApps={workspaceApps} />
            <SidebarInset className="min-w-0">
              <GatewayOfflineBanner gatewayUnavailable={gatewayUnavailable} />
              {children}
            </SidebarInset>
          </SidebarProvider>
          <CommandPalette />
          <Toaster position="top-center" />
        </WorkspaceAppsProvider>
      </ToolDisplayLabelsProvider>
    </QueryClientProvider>
  );
}
