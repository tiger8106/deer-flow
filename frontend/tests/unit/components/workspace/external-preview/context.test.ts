import { afterEach, describe, expect, it, rs } from "@rstest/core";

afterEach(() => {
  rs.doUnmock("react");
  rs.resetModules();
});

async function contextHarness() {
  const state: unknown[] = [];
  let cursor = 0;
  const requestId = { current: 0 };
  rs.doMock("react", () => ({
    createContext: () => ({ Provider: "provider" }),
    useContext: () => null,
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useRef: () => requestId,
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [
        state[index],
        (next: unknown) => {
          state[index] = typeof next === "function" ? next(state[index]) : next;
        },
      ];
    },
  }));
  const { ExternalPreviewProvider } =
    await import("@/components/workspace/external-preview/context");
  return () => {
    cursor = 0;
    return ExternalPreviewProvider({ children: null }).props.value;
  };
}

describe("shared document preview selection", () => {
  it("shares fullscreen across preview types and resets it when closing or switching", async () => {
    const render = await contextHarness();
    render().showArtifacts();
    render().setFullscreen(true);
    expect(render().fullscreen).toBe(true);
    render().open({ url: "/source", title: "source" });
    expect(render().fullscreen).toBe(false);
    render().setFullscreen(true);
    render().close();
    expect(render().fullscreen).toBe(false);
    render().showArtifacts();
    render().setFullscreen(true);
    render().hideArtifacts();
    expect(render().fullscreen).toBe(false);
  });
  it("shows the most recently selected type and closing never restores an older pane", async () => {
    const render = await contextHarness();
    render().showArtifacts();
    expect(render().artifactsVisible).toBe(true);
    render().open({ url: "/source?preview=side-panel", title: "source" });
    expect(render().artifactsVisible).toBe(false);
    expect(render().preview?.title).toBe("source");
    render().showArtifacts();
    expect(render().preview).toBeNull();
    expect(render().artifactsVisible).toBe(true);
    render().hideArtifacts();
    expect(render().artifactsVisible).toBe(false);
    expect(render().preview).toBeNull();
    render().open({ url: "/other?preview=side-panel", title: "other" });
    render().close();
    expect(render().preview).toBeNull();
    expect(render().artifactsVisible).toBe(false);
  });

  it("preserves same-document navigation and starts fresh after selecting an artifact", async () => {
    const render = await contextHarness();
    render().open({
      url: "/source?preview=side-panel&preview_key=doc&page=1",
      title: "source",
    });
    const firstId = render().preview?.requestId;
    render().open({
      url: "/source?preview=side-panel&preview_key=doc&page=2",
      title: "source",
    });
    expect(render().preview?.requestId).toBe(firstId);
    expect(render().preview?.navigationId).toBe(1);
    render().showArtifacts();
    render().open({
      url: "/source?preview=side-panel&preview_key=doc&page=1",
      title: "source",
    });
    expect(render().preview?.requestId).not.toBe(firstId);
    expect(render().preview?.navigationId).toBe(0);
  });
});
