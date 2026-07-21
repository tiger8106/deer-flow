"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getSidePanelPreviewKey } from "@/core/citations/side-panel-preview";

export type ExternalPreview = {
  url: string;
  navigationUrl: string;
  title: string;
  requestId: number;
  navigationId: number;
};

type ExternalPreviewContextValue = {
  preview: ExternalPreview | null;
  open: (preview: Pick<ExternalPreview, "url" | "title">) => void;
  close: () => void;
};

const ExternalPreviewContext =
  createContext<ExternalPreviewContextValue | null>(null);

export function ExternalPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<ExternalPreview | null>(null);
  const requestIdRef = useRef(0);
  const open = useCallback((next: Pick<ExternalPreview, "url" | "title">) => {
    setPreview((current) => {
      const nextPreviewKey = getSidePanelPreviewKey(next.url);
      const currentPreviewKey = getSidePanelPreviewKey(current?.url);
      if (current && nextPreviewKey && nextPreviewKey === currentPreviewKey) {
        return {
          ...current,
          title: next.title,
          navigationUrl: next.url,
          navigationId: current.navigationId + 1,
        };
      }
      return {
        ...next,
        navigationUrl: next.url,
        requestId: ++requestIdRef.current,
        navigationId: 0,
      };
    });
  }, []);
  const close = useCallback(() => setPreview(null), []);
  const value = useMemo(
    () => ({ preview, open, close }),
    [close, open, preview],
  );
  return (
    <ExternalPreviewContext.Provider value={value}>
      {children}
    </ExternalPreviewContext.Provider>
  );
}

export function useExternalPreview() {
  const value = useContext(ExternalPreviewContext);
  if (!value) {
    throw new Error(
      "useExternalPreview must be used within ExternalPreviewProvider",
    );
  }
  return value;
}

export function useMaybeExternalPreview() {
  return useContext(ExternalPreviewContext);
}
