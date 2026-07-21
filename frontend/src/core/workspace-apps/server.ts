import "server-only";

import { parseWorkspaceApps } from "./parse";
import type { WorkspaceApp } from "./types";

export function getWorkspaceApps(): WorkspaceApp[] {
  return parseWorkspaceApps(process.env.DEER_FLOW_WORKSPACE_APPS);
}
