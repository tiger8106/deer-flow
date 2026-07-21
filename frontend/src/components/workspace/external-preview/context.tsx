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

export type ExternalPreview = { url: string; title: string; requestId: number };

type ExternalPreviewContextValue = {
  preview: ExternalPreview | null;
  open: (preview: Omit<ExternalPreview, "requestId">) => void;
  close: () => void;
};

const ExternalPreviewContext =
  createContext<ExternalPreviewContextValue | null>(null);

export function ExternalPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<ExternalPreview | null>(null);
  const requestIdRef = useRef(0);
  const open = useCallback(
    (next: Omit<ExternalPreview, "requestId">) =>
      setPreview({ ...next, requestId: ++requestIdRef.current }),
    [],
  );
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
