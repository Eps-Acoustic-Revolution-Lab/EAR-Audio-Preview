/* eslint-disable @typescript-eslint/naming-convention */
import {
  STRIP_Y_LABEL_INSET,
  TIMELINE_PLOT_PAD_LEFT,
  TIMELINE_PLOT_PAD_RIGHT,
} from "./timelinePlotLayout";

export const STRIP_PLOT_PAD_TOP = 12;
export const STRIP_PLOT_PAD_BOTTOM = 22;

export interface StripPlotRect {
  dpr: number;
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  plotW: number;
  plotH: number;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function percentile(values: number[], p: number): number {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!finite.length) {
    return NaN;
  }
  const pos = clamp01(p) * (finite.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) {
    return finite[lo];
  }
  return finite[lo] + (finite[hi] - finite[lo]) * (pos - lo);
}

export function computeStripPlotRect(
  cssW: number,
  cssH: number,
  dpr: number,
  padTop = STRIP_PLOT_PAD_TOP,
  padBottom = STRIP_PLOT_PAD_BOTTOM,
): StripPlotRect {
  const w = Math.round(Math.max(1, cssW) * dpr);
  const h = Math.round(Math.max(1, cssH) * dpr);
  const padL = TIMELINE_PLOT_PAD_LEFT * dpr;
  const padR = TIMELINE_PLOT_PAD_RIGHT * dpr;
  const padT = padTop * dpr;
  const padB = padBottom * dpr;
  return {
    dpr,
    w,
    h,
    padL,
    padR,
    padT,
    padB,
    plotW: Math.max(1, w - padL - padR),
    plotH: Math.max(1, h - padT - padB),
  };
}

export function resizeCanvasToWrap(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number,
): StripPlotRect {
  const plot = computeStripPlotRect(cssW, cssH, dpr);
  if (canvas.width !== plot.w || canvas.height !== plot.h) {
    canvas.width = plot.w;
    canvas.height = plot.h;
  }
  return plot;
}

export function fillCanvasBackground(
  ctx: CanvasRenderingContext2D,
  plot: StripPlotRect,
  color: string,
): void {
  ctx.clearRect(0, 0, plot.w, plot.h);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, plot.w, plot.h);
}

export function drawHorizontalGrid(
  ctx: CanvasRenderingContext2D,
  plot: StripPlotRect,
  ticks: number[],
  valueToY: (v: number) => number,
  labelFormatter: (v: number) => string,
  minLabelTopPx = 18,
): void {
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.font = `${9 * plot.dpr}px monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const labelX = plot.padL + STRIP_Y_LABEL_INSET * plot.dpr;
  const minLabelY = minLabelTopPx * plot.dpr;
  for (const tick of ticks) {
    const y = valueToY(tick);
    if (!Number.isFinite(y)) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(plot.padL, y);
    ctx.lineTo(plot.padL + plot.plotW, y);
    ctx.stroke();
    if (y >= minLabelY) {
      ctx.fillText(labelFormatter(tick), labelX, y);
    }
  }
}

export function drawTimeAxisLabels(
  ctx: CanvasRenderingContext2D,
  plot: StripPlotRect,
  minTime: number,
  maxTime: number,
  formatTime: (sec: number) => string,
): void {
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(formatTime(minTime), plot.padL, plot.h - plot.padB + 4 * plot.dpr);
  ctx.fillText(
    formatTime(maxTime),
    plot.padL + plot.plotW,
    plot.h - plot.padB + 4 * plot.dpr,
  );
}

export interface CurveDrawStyle {
  color: string;
  lineWidth: number;
  alpha?: number;
}

export function drawTimeSeriesCurve(
  ctx: CanvasRenderingContext2D,
  plot: StripPlotRect,
  times: Float32Array,
  values: Float32Array,
  minTime: number,
  maxTime: number,
  valueToY: (v: number) => number,
  style: CurveDrawStyle,
): void {
  const tSpan = Math.max(1e-9, maxTime - minTime);
  ctx.strokeStyle = style.color;
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.lineWidth = style.lineWidth * plot.dpr;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    if (time < minTime || time > maxTime) {
      started = false;
      continue;
    }
    const v = values[i];
    if (!Number.isFinite(v)) {
      started = false;
      continue;
    }
    const x = plot.padL + ((time - minTime) / tSpan) * plot.plotW;
    const y = valueToY(v);
    if (!Number.isFinite(y)) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function logHzTicks(minHz: number, maxHz: number): number[] {
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  const ticks: number[] = [];
  const startExp = Math.floor(logMin);
  const endExp = Math.ceil(logMax);
  for (let exp = startExp; exp <= endExp; exp++) {
    for (const mult of [1, 2, 5]) {
      const hz = mult * Math.pow(10, exp);
      if (hz >= minHz * 0.99 && hz <= maxHz * 1.01) {
        ticks.push(hz);
      }
    }
  }
  return ticks;
}

export function dynamicLogHzRange(
  times: Float32Array,
  values: Float32Array,
  minTime: number,
  maxTime: number,
  floorHz = 80,
  ceilHz = 4000,
): { minHz: number; maxHz: number; ticks: number[] } {
  const inRange: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const v = values[i];
    if (t >= minTime && t <= maxTime && Number.isFinite(v) && v > 0) {
      inRange.push(v);
    }
  }
  if (!inRange.length) {
    return { minHz: floorHz, maxHz: ceilHz, ticks: logHzTicks(floorHz, ceilHz) };
  }
  let minHz = percentile(inRange, 0.02);
  let maxHz = percentile(inRange, 0.98);
  if (!Number.isFinite(minHz) || !Number.isFinite(maxHz)) {
    minHz = floorHz;
    maxHz = ceilHz;
  }
  minHz = Math.max(floorHz, minHz * 0.9);
  maxHz = Math.min(ceilHz, maxHz * 1.1);
  if (maxHz <= minHz) {
    maxHz = minHz * 1.5;
  }
  return { minHz, maxHz, ticks: logHzTicks(minHz, maxHz) };
}

export function dynamicLinearRange(
  times: Float32Array,
  values: Float32Array,
  minTime: number,
  maxTime: number,
  minSpan = 1e-6,
): { min: number; max: number; ticks: number[] } {
  const inRange: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const v = values[i];
    if (t >= minTime && t <= maxTime && Number.isFinite(v)) {
      inRange.push(v);
    }
  }
  if (!inRange.length) {
    return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  }
  const p98 = percentile(inRange, 0.98);
  const max = Number.isFinite(p98) && p98 > 0 ? p98 * 1.05 : 1;
  const min = 0;
  const span = Math.max(minSpan, max - min);
  const step = span / 4;
  const ticks: number[] = [];
  for (let i = 0; i <= 4; i++) {
    ticks.push(min + step * i);
  }
  return { min, max, ticks };
}
