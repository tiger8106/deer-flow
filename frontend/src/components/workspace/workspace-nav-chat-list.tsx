"use client";

import { BotIcon, CalendarClock, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAgentsApiEnabled } from "@/core/agents";
import { useAuth } from "@/core/auth/AuthProvider";
import { useI18n } from "@/core/i18n/hooks";
import {
  canAccessWorkspaceApp,
  getWorkspaceAppLabel,
  type WorkspaceApp,
} from "@/core/workspace-apps/types";

import { WorkspaceAppIcon } from "./workspace-app-icon";

export function WorkspaceNavChatList({
  workspaceApps,
}: {
  workspaceApps: WorkspaceApp[];
}) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const { enabled: agentsEnabled } = useAgentsApiEnabled();
  const { user } = useAuth();
  const showDevelopmentEntries = user?.system_role === "admin";
  const sidebarApps = workspaceApps.filter(
    (app) =>
      (app.placement ?? "sidebar") === "sidebar" &&
      canAccessWorkspaceApp(app, user?.system_role),
  );
  return (
    <SidebarGroup className="pt-1">
      <SidebarMenu>
        {sidebarApps.map((app) => (
          <SidebarMenuItem key={app.id}>
            <SidebarMenuButton isActive={pathname.startsWith(app.href)} asChild>
              <Link className="text-muted-foreground" href={app.href}>
                <WorkspaceAppIcon name={app.icon} />
                <span>{getWorkspaceAppLabel(app, locale)}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
        {showDevelopmentEntries && (
          <>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname === "/workspace/chats"} asChild>
                <Link className="text-muted-foreground" href="/workspace/chats">
                  <MessagesSquare />
                  <span>{t.sidebar.chats}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname.startsWith("/workspace/agents")}
                disabled={!agentsEnabled}
                asChild={agentsEnabled}
              >
                {agentsEnabled ? (
                  <Link className="text-muted-foreground" href="/workspace/agents">
                    <BotIcon />
                    <span>{t.sidebar.agents}</span>
                  </Link>
                ) : (
                  <><BotIcon /><span>{t.sidebar.agents}</span></>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname.startsWith("/workspace/scheduled-tasks")} asChild>
                <Link className="text-muted-foreground" href="/workspace/scheduled-tasks">
                  <CalendarClock />
                  <span>{t.sidebar.scheduledTasks}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
