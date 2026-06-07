/** Horizontal plot insets shared by loudness pane and (on Loudness tab) waveform playhead. */
export const TIMELINE_PLOT_PAD_LEFT = 36;
export const TIMELINE_PLOT_PAD_RIGHT = 8;

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
