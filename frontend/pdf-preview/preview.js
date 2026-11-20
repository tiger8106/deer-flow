// The viewer dispatches webviewerloaded on the embedding document before it
// reads preferences. Subscribe before its module starts, including on cache hits.
let parentDocument;
try {
  parentDocument = window.parent.document;
} catch {
  parentDocument = document;
}
parentDocument.addEventListener("webviewerloaded", function initialize(event) {
  if (event.detail?.source !== window) return;
  parentDocument.removeEventListener("webviewerloaded", initialize);
  const options = window.PDFViewerApplicationOptions;
  options.set("disablePreferences", true);
  options.set("defaultZoomValue", "page-width");
  options.set("viewOnLoad", 1);
  options.set("enableScripting", false);
  options.set("defaultUrl", "");

  const status = document.createElement("div");
  status.id = "preview-status";
  status.setAttribute("role", "status");
  const chinese = navigator.language.toLowerCase().startsWith("zh");
  status.textContent = chinese ? "正在加载预览…" : "Loading preview…";
  document.body.append(status);
  const app = window.PDFViewerApplication;
  void app.initializedPromise.then(() => {
    app.eventBus.on(
      "pagerendered",
      ({ source, error, cssTransform, isDetailView }) => {
        if (cssTransform || isDetailView) return;
        if (error) {
          status.hidden = false;
          status.textContent = chinese
            ? "页面渲染失败"
            : "Page rendering failed";
          return;
        }
        source.div.classList.add("preview-painted");
        status.hidden = true;
      },
    );
    app.eventBus.on("documenterror", ({ message }) => {
      status.hidden = false;
      status.textContent = message;
    });

    // Only the embedding application supplies credentialed URLs. Keeping
    // them off the viewer URL also preserves signed queries and blob URLs.
    const frame = window.frameElement;
    if (frame?.dataset.pdfSource) {
      const url = new URL(frame.dataset.pdfSource, frame.ownerDocument.baseURI);
      void app.open({ url: url.href, withCredentials: true }).catch(() => {
        // PDF.js reports the localized reason via documenterror above.
      });
    }
  });
});
