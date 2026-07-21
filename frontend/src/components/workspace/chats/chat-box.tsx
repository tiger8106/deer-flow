import { FilesIcon, XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { env } from "@/env";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import {
  ArtifactFileDetail,
  ArtifactFileList,
  useArtifacts,
} from "../artifacts";
import { useExternalPreview } from "../external-preview";
import { clampPreviewPanelPercent } from "../external-preview/layout";
import { useThread } from "../messages/context";
import { SidecarPanel, useMaybeSidecar } from "../sidecar";

const RIGHT_PANEL_ANIMATION_MS = 280;

type RightPanelKind = "external-preview" | "sidecar" | "artifacts";

const ChatBox: React.FC<{ children: React.ReactNode; threadId: string }> = ({
  children,
  threadId,
}) => {
  const { thread } = useThread();
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const threadIdRef = useRef(threadId);
  const externalPreviewFrameRef = useRef<HTMLIFrameElement>(null);

  const {
    artifacts,
    open: artifactsOpen,
    setOpen: setArtifactsOpen,
    setArtifacts,
    select: selectArtifact,
    deselect,
    selectedArtifact,
  } = useArtifacts();
  const sidecar = useMaybeSidecar();
  const sidecarOpen = sidecar?.open ?? false;
  const externalPreview = useExternalPreview();
  const externalPreviewOpen = externalPreview.preview !== null;
  const [externalPreviewFullscreen, setExternalPreviewFullscreen] =
    useState(false);
  const [rightPanelPercent, setRightPanelPercent] = useState(40);
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const resizeFrameRef = useRef<number | null>(null);
  const pendingPercentRef = useRef(40);

  const [autoSelectFirstArtifact, setAutoSelectFirstArtifact] = useState(true);
  useEffect(() => {
    const threadArtifacts = Array.isArray(thread.values.artifacts)
      ? thread.values.artifacts
      : undefined;

    if (threadIdRef.current !== threadId) {
      threadIdRef.current = threadId;
      deselect();
      setArtifacts([]);
    }

    // Update artifacts from the current thread
    if (threadArtifacts) {
      setArtifacts(threadArtifacts);
    }

    // DO NOT automatically deselect the artifact when switching threads, because the artifacts auto discovering is not work now.
    // if (
    //   selectedArtifact &&
    //   !thread.values.artifacts?.includes(selectedArtifact)
    // ) {
    //   deselect();
    // }

    if (
      env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" &&
      autoSelectFirstArtifact
    ) {
      if (threadArtifacts && threadArtifacts.length > 0) {
        setAutoSelectFirstArtifact(false);
        selectArtifact(threadArtifacts[0]!);
      }
    }
  }, [
    threadId,
    autoSelectFirstArtifact,
    deselect,
    selectArtifact,
    selectedArtifact,
    setArtifacts,
    thread.values.artifacts,
  ]);

  const artifactPanelOpen = useMemo(() => {
    if (sidecarOpen || externalPreviewOpen) {
      return false;
    }
    if (env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true") {
      return artifactsOpen && artifacts?.length > 0;
    }
    return artifactsOpen;
  }, [artifactsOpen, artifacts, externalPreviewOpen, sidecarOpen]);

  const activeRightPanel: RightPanelKind | null = externalPreviewOpen
    ? "external-preview"
    : sidecarOpen
      ? "sidecar"
      : artifactPanelOpen
        ? "artifacts"
        : null;
  const rightPanelOpen = activeRightPanel !== null;
  const [renderedRightPanel, setRenderedRightPanel] =
    useState<RightPanelKind | null>(activeRightPanel);

  const resizableIdBase = useMemo(() => {
    return pathname.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  }, [pathname]);

  useEffect(() => {
    if (activeRightPanel) {
      setRenderedRightPanel(activeRightPanel);
      return;
    }

    const timeout = window.setTimeout(() => {
      setRenderedRightPanel(null);
    }, RIGHT_PANEL_ANIMATION_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeRightPanel]);

  useEffect(() => {
    if (sidecarOpen && artifactsOpen) {
      setArtifactsOpen(false);
    }
  }, [artifactsOpen, setArtifactsOpen, sidecarOpen]);

  useEffect(() => {
    if (externalPreviewOpen) return;
    setRightPanelPercent(40);
    setExternalPreviewFullscreen(false);
  }, [externalPreviewOpen]);

  useEffect(() => {
    if (!externalPreview.preview?.navigationId) return;
    externalPreviewFrameRef.current?.contentWindow?.postMessage(
      {
        type: "deerflow:external-preview:navigate",
        url: externalPreview.preview.navigationUrl,
      },
      window.location.origin,
    );
  }, [
    externalPreview.preview?.navigationId,
    externalPreview.preview?.navigationUrl,
  ]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === "deerflow:external-preview:close"
      ) {
        externalPreview.close();
        setExternalPreviewFullscreen(false);
        setRightPanelPercent(40);
      }
      if (
        event.origin === window.location.origin &&
        event.data?.type === "deerflow:external-preview:set-fullscreen" &&
        typeof event.data.fullscreen === "boolean"
      ) {
        setExternalPreviewFullscreen(event.data.fullscreen);
      }
      if (
        event.origin === window.location.origin &&
        event.data?.type === "deerflow:external-preview:ready" &&
        externalPreview.preview?.navigationId
      ) {
        externalPreviewFrameRef.current?.contentWindow?.postMessage(
          {
            type: "deerflow:external-preview:navigate",
            url: externalPreview.preview.navigationUrl,
          },
          window.location.origin,
        );
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [externalPreview]);

  const rightPanelContent = useMemo(() => {
    if (renderedRightPanel === "external-preview" && externalPreview.preview) {
      return (
        <iframe
          ref={externalPreviewFrameRef}
          key={externalPreview.preview.requestId}
          className="size-full border-0"
          src={externalPreview.preview.url}
          title={externalPreview.preview.title}
        />
      );
    }
    if (renderedRightPanel === "sidecar") {
      return <SidecarPanel />;
    }
    if (renderedRightPanel === "artifacts" && selectedArtifact) {
      return (
        <ArtifactFileDetail
          className="size-full"
          filepath={selectedArtifact}
          threadId={threadId}
        />
      );
    }
    if (renderedRightPanel === "artifacts") {
      return (
        <div className="relative flex size-full justify-center">
          <div className="absolute top-1 right-1 z-30">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setArtifactsOpen(false);
              }}
            >
              <XIcon />
            </Button>
          </div>
          {artifacts.length === 0 ? (
            <ConversationEmptyState
              icon={<FilesIcon />}
              title="No artifact selected"
              description="Select an artifact to view its details"
            />
          ) : (
            <div className="flex size-full max-w-(--container-width-sm) flex-col justify-center p-4 pt-8">
              <header className="shrink-0">
                <h2 className="text-lg font-medium">Artifacts</h2>
              </header>
              <main className="min-h-0 grow">
                <ArtifactFileList
                  className="max-w-(--container-width-sm) p-4 pt-12"
                  files={artifacts}
                  threadId={threadId}
                />
              </main>
            </div>
          )}
        </div>
      );
    }
    return null;
  }, [
    renderedRightPanel,
    selectedArtifact,
    threadId,
    artifacts,
    externalPreview.preview,
    setArtifactsOpen,
  ]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      !rightPanelOpen ||
      renderedRightPanel !== "external-preview" ||
      externalPreviewFullscreen
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const container = event.currentTarget.parentElement;
    if (!container) return;
    pendingPercentRef.current = rightPanelPercent;
    externalPreviewFrameRef.current?.contentWindow?.postMessage(
      { type: "deerflow:external-preview:resize-start" },
      window.location.origin,
    );
    const handleMove = (moveEvent: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      const percent = ((bounds.right - moveEvent.clientX) / bounds.width) * 100;
      pendingPercentRef.current = clampPreviewPanelPercent(percent);
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        setRightPanelPercent(pendingPercentRef.current);
      });
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      setRightPanelPercent(pendingPercentRef.current);
      setIsResizingPreview(false);
      externalPreviewFrameRef.current?.contentWindow?.postMessage(
        { type: "deerflow:external-preview:resize-end" },
        window.location.origin,
      );
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    setIsResizingPreview(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  if (isMobile) {
    return (
      <>
        <div className="relative size-full min-w-0">{children}</div>
        <Sheet
          open={rightPanelOpen}
          onOpenChange={(open) => {
            if (open) {
              return;
            }
            if (sidecarOpen) {
              sidecar?.close();
            }
            if (externalPreviewOpen) {
              externalPreview.close();
            }
            if (artifactsOpen) {
              setArtifactsOpen(false);
            }
          }}
        >
          <SheetContent
            className="w-[calc(100vw-1rem)] max-w-none gap-0 p-0 sm:max-w-md [&>button]:hidden"
            side="right"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>
                {renderedRightPanel === "external-preview"
                  ? "Preview"
                  : renderedRightPanel === "sidecar"
                    ? "Sidecar"
                    : "Artifacts"}
              </SheetTitle>
              <SheetDescription>
                Browse the side panel for this conversation.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 p-3 pt-10">{rightPanelContent}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div
      id={`${resizableIdBase}-panels`}
      className={cn(
        "[container-type:inline-size] relative grid size-full min-h-0 transition-[grid-template-columns] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        isResizingPreview && "transition-none",
        rightPanelOpen
          ? "grid-cols-[minmax(0,1fr)_1px_minmax(0,40%)]"
          : "grid-cols-[minmax(0,1fr)_0px_0px]",
      )}
      style={
        rightPanelOpen
          ? {
              gridTemplateColumns: externalPreviewFullscreen
                ? "0px 0px minmax(0, 1fr)"
                : `minmax(0, 1fr) 1px minmax(0, ${rightPanelPercent}%)`,
            }
          : undefined
      }
    >
      <div
        className={cn(
          "relative min-h-0 min-w-0 transition-opacity duration-200",
          externalPreviewFullscreen && "pointer-events-none opacity-0",
        )}
        id="chat"
      >
        {children}
      </div>
      <div
        id={`${resizableIdBase}-separator`}
        aria-hidden={!rightPanelOpen || externalPreviewFullscreen}
        onPointerDown={startResize}
        className={cn(
          "bg-border relative z-10 cursor-col-resize opacity-33 transition-opacity duration-200 ease-out after:absolute after:inset-y-0 after:-left-2 after:w-4 motion-reduce:transition-none",
          !rightPanelOpen && "pointer-events-none opacity-0",
          renderedRightPanel !== "external-preview" && "cursor-default",
          externalPreviewFullscreen && "pointer-events-none opacity-0",
        )}
      />
      <aside
        aria-hidden={!rightPanelOpen}
        className={cn(
          "min-h-0 min-w-0 overflow-hidden transition-opacity duration-[280ms] ease-out motion-reduce:transition-none",
          !rightPanelOpen && "pointer-events-none opacity-0",
        )}
        id="artifacts"
      >
        <div
          className={cn(
            "ml-auto h-full w-full transition-opacity duration-[280ms] ease-out motion-reduce:transition-none",
            renderedRightPanel === "sidecar" ||
              renderedRightPanel === "external-preview"
              ? "p-0"
              : "p-4",
            rightPanelOpen ? "opacity-100" : "opacity-0",
          )}
        >
          {rightPanelContent}
        </div>
      </aside>
      {isResizingPreview ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-50 cursor-col-resize"
        />
      ) : null}
    </div>
  );
};

export { ChatBox };
