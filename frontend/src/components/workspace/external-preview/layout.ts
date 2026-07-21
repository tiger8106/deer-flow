const MIN_PREVIEW_PANEL_PERCENT = 30;
const MAX_PREVIEW_PANEL_PERCENT = 75;

export function clampPreviewPanelPercent(percent: number) {
  return Math.min(
    MAX_PREVIEW_PANEL_PERCENT,
    Math.max(MIN_PREVIEW_PANEL_PERCENT, percent),
  );
}
