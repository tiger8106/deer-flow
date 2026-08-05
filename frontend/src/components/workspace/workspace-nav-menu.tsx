"use client";

import { ChevronsUpDown, Settings2Icon, SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/core/auth/AuthProvider";
import { useI18n } from "@/core/i18n/hooks";
import {
  canAccessWorkspaceApp,
  getWorkspaceAppLabel,
  type WorkspaceApp,
} from "@/core/workspace-apps/types";

import { FullscreenDialogCloseButton } from "./fullscreen-dialog-close-button";
import { SettingsDialog } from "./settings";
import { WorkspaceAppIcon } from "./workspace-app-icon";

function NavMenuButtonContent({
  isSidebarOpen,
  t,
}: {
  isSidebarOpen: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return isSidebarOpen ? (
    <div className="text-muted-foreground flex w-full items-center gap-2 text-left text-sm">
      <SettingsIcon className="size-4" />
      <span>{t.workspace.settingsAndMore}</span>
      <ChevronsUpDown className="text-muted-foreground ml-auto size-4" />
    </div>
  ) : (
    <div className="flex size-full items-center justify-center">
      <SettingsIcon className="text-muted-foreground size-4" />
    </div>
  );
}

export function WorkspaceNavMenu({
  workspaceApps,
}: {
  workspaceApps: WorkspaceApp[];
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialogApp, setDialogApp] = useState<WorkspaceApp | null>(null);
  const [settingsDefaultSection, setSettingsDefaultSection] = useState<
    "appearance" | "memory" | "tools" | "skills" | "notification"
  >("appearance");
  const [mounted, setMounted] = useState(false);
  const dialogAppFrameRef = useRef<HTMLIFrameElement>(null);
  const { open: isSidebarOpen } = useSidebar();
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const settingsMenuApps = workspaceApps.filter(
    (app) =>
      app.placement === "settings-menu" &&
      canAccessWorkspaceApp(app, user?.system_role),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!dialogApp) return;
    function closeWorkspaceApp(event: MessageEvent) {
      if (
        event.origin === window.location.origin &&
        event.source === dialogAppFrameRef.current?.contentWindow &&
        event.data?.type === "deerflow:workspace-app:close"
      ) {
        setDialogApp(null);
      }
    }
    window.addEventListener("message", closeWorkspaceApp);
    return () => window.removeEventListener("message", closeWorkspaceApp);
  }, [dialogApp]);

  return (
    <>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultSection={settingsDefaultSection}
      />
      <Dialog
        open={dialogApp !== null}
        onOpenChange={(open) => {
          if (!open) setDialogApp(null);
        }}
      >
        <DialogContent
          className="top-0 left-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
          aria-describedby={undefined}
          showCloseButton={false}
        >
          <FullscreenDialogCloseButton />
          <DialogTitle className="sr-only">
            {dialogApp ? getWorkspaceAppLabel(dialogApp, locale) : ""}
          </DialogTitle>
          {dialogApp && (
            <iframe
              ref={dialogAppFrameRef}
              className="size-full min-h-0 border-0"
              src={dialogApp.embedUrl}
              title={getWorkspaceAppLabel(dialogApp, locale)}
            />
          )}
        </DialogContent>
      </Dialog>
      <SidebarMenu className="w-full">
        <SidebarMenuItem>
          {mounted ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <NavMenuButtonContent isSidebarOpen={isSidebarOpen} t={t} />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      setSettingsDefaultSection("appearance");
                      setSettingsOpen(true);
                    }}
                  >
                    <Settings2Icon />
                    {t.common.settings}
                  </DropdownMenuItem>
                  {settingsMenuApps.map((app) => (
                    <DropdownMenuItem
                      key={app.id}
                      onClick={() => setDialogApp(app)}
                    >
                      <WorkspaceAppIcon name={app.icon} />
                      {getWorkspaceAppLabel(app, locale)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <NavMenuButtonContent isSidebarOpen={isSidebarOpen} t={t} />
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
