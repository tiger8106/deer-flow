"use client";

import {
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/core/i18n/hooks";
import {
  parseComposerScopeResponse,
  type ComposerExtensionSelection,
  type ComposerScopeNode,
} from "@/core/workspace-apps/chat-input";
import {
  getWorkspaceAppAllScopeLabel,
  getWorkspaceAppChatInputLabel,
  type WorkspaceApp,
} from "@/core/workspace-apps/types";
import { cn } from "@/lib/utils";

function findScopeLabel(nodes: ComposerScopeNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.label;
    const nested = findScopeLabel(node.children, id);
    if (nested) return nested;
  }
  return null;
}

export function ComposerExtensionPicker({
  app,
  disabled,
  value,
  onChange,
}: {
  app: WorkspaceApp;
  disabled?: boolean;
  value?: ComposerExtensionSelection;
  onChange: (value: ComposerExtensionSelection) => void;
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [nodes, setNodes] = useState<ComposerScopeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const config = app.chatInput;
  const appLabel = getWorkspaceAppChatInputLabel(app, locale);
  const allLabel = getWorkspaceAppAllScopeLabel(app, locale);

  useEffect(() => {
    if (!open || !config || nodes.length > 0) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    fetch(config.scopeEndpoint, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseComposerScopeResponse(await response.json());
      })
      .then((result) => setNodes(result.nodes))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") {
          setLoadError(true);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [config, nodes.length, open, reloadKey]);

  const selectedLabel = useMemo(() => {
    if (!value?.enabled) return appLabel;
    if (!value.scope) return allLabel;
    return findScopeLabel(nodes, value.scope.id) ?? appLabel;
  }, [allLabel, appLabel, nodes, value]);

  if (!config) return null;

  const select = (selection: ComposerExtensionSelection) => {
    onChange(selection);
    setOpen(false);
  };

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: ComposerScopeNode, depth: number) => {
    const isCollection = node.kind === "collection";
    const isExpanded = expanded.has(node.id);
    const selected =
      value?.enabled &&
      value.scope?.kind === node.kind &&
      value.scope.id === node.id;
    return (
      <div
        key={`${node.kind}:${node.id}`}
        role="treeitem"
        aria-selected={selected}
      >
        <div
          className={cn(
            "hover:bg-accent flex min-h-8 items-center rounded-sm pr-2 text-sm",
            selected && "bg-accent",
          )}
          style={{ paddingLeft: 4 + depth * 16 }}
        >
          <button
            type="button"
            className="flex size-7 shrink-0 items-center justify-center"
            aria-label={isExpanded ? "收起" : "展开"}
            disabled={!isCollection || node.children.length === 0}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isCollection && node.children.length > 0) toggle(node.id);
            }}
          >
            {isCollection && node.children.length > 0 ? (
              isExpanded ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )
            ) : null}
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
            title={node.label}
            onClick={() =>
              select({
                enabled: true,
                scope: { kind: node.kind, id: node.id },
              })
            }
          >
            {isCollection ? (
              <FolderIcon className="size-4 shrink-0" />
            ) : (
              <FileTextIcon className="size-4 shrink-0" />
            )}
            <span className="truncate">{node.label}</span>
          </button>
          {selected ? <CheckIcon className="size-4 shrink-0" /> : null}
        </div>
        {isCollection && isExpanded
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <PromptInputButton
          className={cn(
            "max-w-32 gap-1 px-2!",
            value?.enabled && "bg-accent text-accent-foreground",
          )}
          disabled={disabled}
          title={selectedLabel}
        >
          <BookOpenIcon className="size-3" />
          <span className="truncate text-xs font-normal">{selectedLabel}</span>
          <ChevronDownIcon className="size-3" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={5}
        collisionPadding={8}
        className="max-h-[min(24rem,calc(100vh-1rem))] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto p-1"
      >
        <button
          type="button"
          className="hover:bg-accent flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm"
          onClick={() => select({ enabled: false })}
        >
          <BookOpenIcon className="size-4" />
          <span className="flex-1 truncate">
            {t.inputBox.disableComposerExtension.replace("{label}", appLabel)}
          </span>
          {!value?.enabled ? <CheckIcon className="size-4" /> : null}
        </button>
        <button
          type="button"
          className={cn(
            "hover:bg-accent flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm",
            value?.enabled && !value.scope && "bg-accent",
          )}
          title={allLabel}
          onClick={() => select({ enabled: true })}
        >
          <FolderIcon className="size-4" />
          <span className="flex-1 truncate">{allLabel}</span>
          {value?.enabled && !value.scope ? (
            <CheckIcon className="size-4" />
          ) : null}
        </button>
        <div className="bg-border my-1 h-px" />
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {t.inputBox.composerScopeLoading}
          </div>
        ) : loadError ? (
          <button
            type="button"
            className="text-destructive w-full px-2 py-3 text-left text-sm"
            onClick={() => {
              setNodes([]);
              setLoadError(false);
              setReloadKey((current) => current + 1);
            }}
          >
            {t.inputBox.composerScopeLoadFailed}
          </button>
        ) : (
          <div role="tree">{nodes.map((node) => renderNode(node, 0))}</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
