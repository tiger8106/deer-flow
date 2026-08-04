import { AppWindow, LibraryBig, ShieldCheck } from "lucide-react";

const WORKSPACE_APP_ICONS = {
  library: LibraryBig,
  shield: ShieldCheck,
} as const;

export function WorkspaceAppIcon({ name }: { name: string }) {
  const Icon =
    WORKSPACE_APP_ICONS[name as keyof typeof WORKSPACE_APP_ICONS] ?? AppWindow;
  return <Icon />;
}
