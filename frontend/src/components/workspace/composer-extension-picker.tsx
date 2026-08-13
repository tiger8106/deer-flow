"use client";

import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  Loader2Icon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/core/i18n/hooks";
import {
  getComposerScopeGroupState,
  getComposerScopeSelectionLabel,
  getSelectedScopeExpansion,
  groupComposerScopeNodes,
  parseComposerScopeResponse,
  toggleComposerScope,
  toggleComposerScopeGroup,
  type ComposerExtensionSelection,
  type ComposerScopeGroup,
  type ComposerScopeNode,
  type ComposerScopeRef,
} from "@/core/workspace-apps/chat-input";
import {
  getWorkspaceAppAllScopeLabel,
  getWorkspaceAppChatInputLabel,
  getWorkspaceAppPartialScopeLabel,
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
  const [expandedScopeGroups, setExpandedScopeGroups] = useState<Set<string>>(
    new Set(),
  );
  const nodeLabelClickTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const config = app.chatInput;
  const appLabel = getWorkspaceAppChatInputLabel(app, locale);
  const allLabel = getWorkspaceAppAllScopeLabel(app, locale);
  const configuredPartialLabel = getWorkspaceAppPartialScopeLabel(app, locale);

  useEffect(() => {
    if (!config || nodes.length > 0) return;
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
  }, [config, nodes.length, reloadKey]);

  const scopes = useMemo(() => value?.scopes ?? [], [value?.scopes]);
  const scopeGroups = useMemo(() => groupComposerScopeNodes(nodes), [nodes]);
  const selectedLabel = useMemo(() => {
    const partialLabel =
      configuredPartialLabel ??
      t.inputBox.composerScopesSelected.replace(
        "{count}",
        String(scopes.length),
      );
    return getComposerScopeSelectionLabel(
      nodes,
      scopes,
      allLabel,
      partialLabel,
    );
  }, [
    allLabel,
    configuredPartialLabel,
    nodes,
    scopes,
    t.inputBox.composerScopesSelected,
  ]);

  useEffect(() => {
    if (!open || nodes.length === 0) return;
    const expansion = getSelectedScopeExpansion(nodes, scopes);
    setExpandedFolders(expansion.folderIds);
    setExpandedDocuments(expansion.documentParentIds);
    // Scope changes while the menu is open must not auto-expand the tree.
    // This effect only initializes expansion after the async first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, open]);

  useEffect(() => {
    const timers = nodeLabelClickTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

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

  const nodeLabelKey = (node: ComposerScopeNode) => `${node.kind}:${node.id}`;

  const cancelPendingNodeLabelClick = (node: ComposerScopeNode) => {
    const key = nodeLabelKey(node);
    const timer = nodeLabelClickTimers.current.get(key);
    if (timer === undefined) return;
    clearTimeout(timer);
    nodeLabelClickTimers.current.delete(key);
  };

  const handleNodeLabelClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    node: ComposerScopeNode,
    hasFolderChildren: boolean,
  ) => {
    if (
      event.detail !== 1 ||
      node.kind !== "collection" ||
      !hasFolderChildren
    ) {
      return;
    }
    const key = nodeLabelKey(node);
    cancelPendingNodeLabelClick(node);
    // 浏览器会先派发双击中的两次 click，延迟单击动作以避免两种交互互相触发。
    const timer = setTimeout(() => {
      toggleExpanded(setExpandedFolders, node.id);
      nodeLabelClickTimers.current.delete(key);
    }, 250);
    nodeLabelClickTimers.current.set(key, timer);
  };

  const handleNodeLabelDoubleClick = (
    node: ComposerScopeNode,
    hasDocumentChildren: boolean,
  ) => {
    cancelPendingNodeLabelClick(node);
    if (node.kind === "collection" && hasDocumentChildren) {
      toggleExpanded(setExpandedDocuments, node.id);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setExpandedScopeGroups(new Set());
    }
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
      scopes: toggleComposerScope(scopes, target, nodes),
    });
  };

  const toggleScopeGroup = (group: ComposerScopeGroup) => {
    onChange({
      enabled: value?.enabled ?? false,
      scopes: toggleComposerScopeGroup(scopes, group.nodes),
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
              cancelPendingNodeLabelClick(node);
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
            onClick={(event) =>
              handleNodeLabelClick(event, node, folderChildren.length > 0)
            }
            onDoubleClick={() =>
              handleNodeLabelDoubleClick(node, documentChildren.length > 0)
            }
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

  const renderGroup = (group: ComposerScopeGroup) => {
    const groupState = getComposerScopeGroupState(scopes, group.nodes);
    const expanded = expandedScopeGroups.has(group.id);
    return (
      <div key={`group:${group.id}`} className="border-border/60 border-b pb-1">
        <div className="bg-muted/40 hover:bg-accent flex min-h-9 w-full items-center gap-1 rounded-sm px-2 text-left text-sm">
          <button
            type="button"
            className="flex size-7 shrink-0 items-center justify-center"
            aria-expanded={expanded}
            aria-label={`${expanded ? "收起" : "展开"}${group.label}`}
            onClick={() =>
              setExpandedScopeGroups((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              })
            }
          >
            {expanded ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
          </button>
          <input
            type="checkbox"
            className="accent-primary size-3.5"
            checked={groupState.selected}
            ref={(element) => {
              if (element) element.indeterminate = groupState.indeterminate;
            }}
            aria-label={group.label}
            aria-checked={
              groupState.indeterminate ? "mixed" : groupState.selected
            }
            onChange={() => toggleScopeGroup(group)}
          />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
            title={group.label}
            onClick={() =>
              setExpandedScopeGroups((current) => {
                const next = new Set(current);
                if (next.has(group.id)) next.delete(group.id);
                else next.add(group.id);
                return next;
              })
            }
          >
            <FolderIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate font-medium">{group.label}</span>
          </button>
        </div>
        {expanded ? (
          <div role="group" className="pt-0.5">
            {group.nodes.map((node) => renderNode(node, 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <div className="flex min-w-0 items-center">
        <PromptInputButton
          className={cn(
            "max-w-32 gap-1 rounded-r-none border-r-0 px-2!",
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
          <span className="truncate text-xs font-normal">{selectedLabel}</span>
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
          <div role="tree">
            {scopeGroups.map((group) =>
              group.label
                ? renderGroup(group)
                : group.nodes.map((node) => renderNode(node, 0)),
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
