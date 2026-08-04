"use client";

import { createContext, useContext } from "react";

import type { WorkspaceApp } from "./types";

const WorkspaceAppsContext = createContext<WorkspaceApp[]>([]);

export function WorkspaceAppsProvider({
  apps,
  children,
}: {
  apps: WorkspaceApp[];
  children: React.ReactNode;
}) {
  return (
    <WorkspaceAppsContext.Provider value={apps}>
      {children}
    </WorkspaceAppsContext.Provider>
  );
}

export function useWorkspaceApps() {
  return useContext(WorkspaceAppsContext);
}
