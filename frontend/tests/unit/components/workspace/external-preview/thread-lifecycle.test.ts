import { afterEach, describe, expect, it, rs } from "@rstest/core";

afterEach(() => {
  rs.doUnmock("react");
  rs.resetModules();
});

async function loadLifecycleHook(initialThreadId: string) {
  const threadIdRef = { current: initialThreadId };
  const cleanups: Array<() => void> = [];

  rs.doMock("react", () => ({
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    },
    useRef: () => threadIdRef,
  }));

  const { useCloseExternalPreviewOnThreadChange } =
    await import("@/components/workspace/external-preview/thread-lifecycle");
  return { cleanups, threadIdRef, useCloseExternalPreviewOnThreadChange };
}

describe("useCloseExternalPreviewOnThreadChange", () => {
  it("closes the preview when the active thread changes", async () => {
    const closePreview = rs.fn();
    const { threadIdRef, useCloseExternalPreviewOnThreadChange } =
      await loadLifecycleHook("thread-a");

    useCloseExternalPreviewOnThreadChange("thread-b", closePreview);

    expect(threadIdRef.current).toBe("thread-b");
    expect(closePreview).toHaveBeenCalledTimes(1);
  });

  it("closes the preview when the chat is unmounted", async () => {
    const closePreview = rs.fn();
    const { cleanups, useCloseExternalPreviewOnThreadChange } =
      await loadLifecycleHook("thread-a");

    useCloseExternalPreviewOnThreadChange("thread-a", closePreview);
    expect(closePreview).not.toHaveBeenCalled();

    cleanups.at(-1)?.();
    expect(closePreview).toHaveBeenCalledTimes(1);
  });
});
