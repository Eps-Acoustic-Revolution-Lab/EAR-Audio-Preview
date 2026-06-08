/* eslint-disable @typescript-eslint/naming-convention */
/** Horizontal plot insets for timeline strips (time axis uses full width; Y labels overlay inside). */
export const TIMELINE_PLOT_PAD_LEFT = 0;
export const TIMELINE_PLOT_PAD_RIGHT = 8;

/** Inset for Y-axis tick labels drawn inside the plot (left overlay). */
export const STRIP_Y_LABEL_INSET = 6;

export function readTimelinePadFromElement(el: Element): {
  left: number;
  right: number;
} {
  const style = getComputedStyle(el);
  const left = parseFloat(style.getPropertyValue("--timeline-pad-left"));
  const right = parseFloat(style.getPropertyValue("--timeline-pad-right"));
  return {
    left: Number.isFinite(left) ? left : 0,
    right: Number.isFinite(right) ? right : 0,
  };
}

export function plotWidthPx(
  containerWidthPx: number,
  padLeft: number,
  padRight: number,
): number {
  return Math.max(1, containerWidthPx - padLeft - padRight);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Map pointer X (client coords) to time within the plot area. */
export function plotTimeSecFromClientX(
  clientX: number,
  containerRect: DOMRect,
  minTime: number,
  maxTime: number,
  padLeft: number,
  padRight: number,
): number {
  const span = maxTime - minTime;
  if (span <= 0) {
    return minTime;
  }
  const plotW = plotWidthPx(containerRect.width, padLeft, padRight);
  const xNorm =
    plotW > 0
      ? clamp01((clientX - containerRect.left - padLeft) / plotW)
      : 0;
  return minTime + xNorm * span;
}

export function timeSecToPlotX(
  sec: number,
  minTime: number,
  maxTime: number,
  containerWidthPx: number,
  padLeft: number,
  padRight: number,
): number {
  const span = maxTime - minTime;
  if (span <= 0 || containerWidthPx <= 0) {
    return padLeft;
  }
  const pct = Math.max(0, Math.min(1, (sec - minTime) / span));
  return padLeft + pct * plotWidthPx(containerWidthPx, padLeft, padRight);
}

/** Map absolute time to horizontal % of a container (for playhead / progress overlays). */
export function timeSecToContainerPercent(
  sec: number,
  minTime: number,
  maxTime: number,
  containerWidthPx: number,
  padLeft: number,
  padRight: number,
): number {
  const span = maxTime - minTime;
  if (span <= 0) {
    return 0;
  }
  if (containerWidthPx <= 0) {
    return Math.max(0, Math.min(100, ((sec - minTime) / span) * 100));
  }
  return (
    (timeSecToPlotX(
      sec,
      minTime,
      maxTime,
      containerWidthPx,
      padLeft,
      padRight,
    ) /
      containerWidthPx) *
    100
  );
}
