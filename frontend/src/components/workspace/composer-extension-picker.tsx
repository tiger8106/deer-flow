"use client";

import {
  BookOpenIcon,
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
  findComposerScopeLabel,
  getSelectedScopeExpansion,
  parseComposerScopeResponse,
  toggleComposerScope,
  type ComposerExtensionSelection,
  type ComposerScopeNode,
  type ComposerScopeRef,
} from "@/core/workspace-apps/chat-input";
import {
  getWorkspaceAppAllScopeLabel,
  getWorkspaceAppChatInputLabel,
  type WorkspaceApp,
} from "@/core/workspace-apps/types";
import { cn } from "@/lib/utils";

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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [expandedDocuments, setExpandedDocuments] = useState<Set<string>>(
    new Set(),
  );
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

  const scopes = useMemo(() => value?.scopes ?? [], [value?.scopes]);
  const selectedLabel = useMemo(() => {
    if (scopes.length === 0) return allLabel;
    if (scopes.length === 1 && scopes[0]) {
      return findComposerScopeLabel(nodes, scopes[0]) ?? appLabel;
    }
    return t.inputBox.composerScopesSelected.replace(
      "{count}",
      String(scopes.length),
    );
  }, [allLabel, appLabel, nodes, scopes, t.inputBox.composerScopesSelected]);

  useEffect(() => {
    if (!open || nodes.length === 0) return;
    const expansion = getSelectedScopeExpansion(nodes, scopes);
    setExpandedFolders(expansion.folderIds);
    setExpandedDocuments(expansion.documentParentIds);
    // Scope changes while the menu is open must not auto-expand the tree.
    // This effect only initializes expansion after the async first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, open]);

  if (!config) return null;

  const toggleExpanded = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && nodes.length > 0) {
      const expansion = getSelectedScopeExpansion(nodes, scopes);
      setExpandedFolders(expansion.folderIds);
      setExpandedDocuments(expansion.documentParentIds);
    }
    setOpen(nextOpen);
  };

  const isSelected = (target: ComposerScopeRef) =>
    scopes.some(
      (scope) => scope.kind === target.kind && scope.id === target.id,
    );

  const toggleScope = (target: ComposerScopeRef) => {
    onChange({
      enabled: value?.enabled ?? false,
      scopes: toggleComposerScope(scopes, target),
    });
  };

  const renderNode = (node: ComposerScopeNode, depth: number) => {
    const isCollection = node.kind === "collection";
    const folderChildren = node.children.filter(
      (child) => child.kind === "collection",
    );
    const documentChildren = node.children.filter(
      (child) => child.kind === "document",
    );
    const foldersOpen = expandedFolders.has(node.id);
    const documentsOpen = expandedDocuments.has(node.id);
    const target = { kind: node.kind, id: node.id } satisfies ComposerScopeRef;
    const selected = isSelected(target);
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
            aria-label={foldersOpen ? "收起" : "展开"}
            disabled={!isCollection || folderChildren.length === 0}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (isCollection && folderChildren.length > 0) {
                toggleExpanded(setExpandedFolders, node.id);
              }
            }}
          >
            {isCollection && folderChildren.length > 0 ? (
              foldersOpen ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )
            ) : null}
          </button>
          <input
            type="checkbox"
            className="accent-primary size-3.5 shrink-0"
            checked={selected}
            aria-label={node.label}
            onChange={() => toggleScope(target)}
          />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
            title={node.label}
            onDoubleClick={() => {
              if (isCollection && documentChildren.length > 0) {
                toggleExpanded(setExpandedDocuments, node.id);
              }
            }}
          >
            {isCollection ? (
              <FolderIcon className="size-4 shrink-0" />
            ) : (
              <FileTextIcon className="size-4 shrink-0" />
            )}
            <span className="truncate">{node.label}</span>
          </button>
        </div>
        {isCollection && documentsOpen
          ? documentChildren.map((child) => renderNode(child, depth + 1))
          : null}
        {isCollection && foldersOpen
          ? folderChildren.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <div className="flex min-w-0 items-center">
        <PromptInputButton
          className={cn(
            "max-w-28 gap-1 rounded-r-none border-r-0 px-2!",
            value?.enabled && "bg-accent text-accent-foreground",
          )}
          disabled={disabled}
          title={`${appLabel} · ${selectedLabel}`}
          aria-pressed={value?.enabled ?? false}
          onClick={() =>
            onChange({
              enabled: !(value?.enabled ?? false),
              scopes,
            })
          }
        >
          <BookOpenIcon className="size-3" />
          <span className="truncate text-xs font-normal">{appLabel}</span>
        </PromptInputButton>
        <DropdownMenuTrigger asChild>
          <PromptInputButton
            className={cn(
              "rounded-l-none px-1.5!",
              value?.enabled && "bg-accent text-accent-foreground",
            )}
            disabled={disabled}
            aria-label={selectedLabel}
            title={selectedLabel}
          >
            <ChevronDownIcon className="size-3" />
          </PromptInputButton>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        align="start"
        sideOffset={5}
        collisionPadding={8}
        className="max-h-[min(24rem,calc(100vh-1rem))] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto p-1"
      >
        <label
          className={cn(
            "hover:bg-accent flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm",
            scopes.length === 0 && "bg-accent",
          )}
          title={allLabel}
        >
          <input
            type="checkbox"
            className="accent-primary size-3.5"
            checked={scopes.length === 0}
            onChange={() =>
              onChange({ enabled: value?.enabled ?? false, scopes: [] })
            }
          />
          <FolderIcon className="size-4" />
          <span className="flex-1 truncate">{allLabel}</span>
        </label>
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
