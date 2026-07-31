import { useEffect, useRef } from "react";

export function useCloseExternalPreviewOnThreadChange(
  threadId: string,
  closePreview: () => void,
) {
  const previousThreadIdRef = useRef(threadId);

  useEffect(() => {
    if (previousThreadIdRef.current === threadId) return;
    previousThreadIdRef.current = threadId;
    closePreview();
  }, [closePreview, threadId]);

  useEffect(() => {
    return () => {
      closePreview();
    };
  }, [closePreview]);
}
