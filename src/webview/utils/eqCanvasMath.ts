import type { EqFilterBand } from "../types/headphoneEq";
import { formatFreqTickLabel } from "./liveLogSpectrumAxis";

export const PLOT_PAD_L = 44;
export const PLOT_PAD_R = 36;
export const PLOT_PAD_B = 22;
export const PLOT_PAD_T = 8;
export const DEFAULT_DISPLAY_RANGE = 12;

export const FREQ_TICKS = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

export function freqToPlotX(
  freq: number,
  plotW: number,
  minHz: number,
  maxHz: number,
): number {
  const lo = Math.log10(minHz);
  const hi = Math.log10(maxHz);
  const t = (Math.log10(Math.max(minHz, freq)) - lo) / Math.max(1e-9, hi - lo);
  return t * plotW;
}

export function plotXToFreq(
  x: number,
  plotW: number,
  minHz: number,
  maxHz: number,
): number {
  const lo = Math.log10(minHz);
  const hi = Math.log10(maxHz);
  const t = Math.max(0, Math.min(1, x / Math.max(1, plotW)));
  return Math.pow(10, lo + t * (hi - lo));
}

export function gainToPlotY(
  gainDb: number,
  plotH: number,
  displayRange = DEFAULT_DISPLAY_RANGE,
): number {
  const minG = -displayRange * 2;
  const maxG = displayRange;
  return plotH - ((gainDb - minG) / (maxG - minG)) * plotH;
}

export function plotYToGain(
  y: number,
  plotH: number,
  displayRange = DEFAULT_DISPLAY_RANGE,
): number {
  const minG = -displayRange * 2;
  const maxG = displayRange;
  const t = 1 - Math.max(0, Math.min(1, y / Math.max(1, plotH)));
  return minG + t * (maxG - minG);
}

export function dbGridStep(displayRange: number): number {
  if (displayRange <= 6) {
    return 1;
  }
  if (displayRange <= 12) {
    return 3;
  }
  return 6;
}

export function dbGridLines(displayRange: number): number[] {
  const step = dbGridStep(displayRange);
  const lines: number[] = [];
  const minG = -displayRange * 2;
  const maxG = displayRange;
  for (let g = maxG; g >= minG; g -= step) {
    lines.push(g);
  }
  return lines;
}

export function bandColorForIndex(index: number): string {
  const hue = (index * 47) % 360;
  return `hsl(${hue} 70% 58%)`;
}

export function bandColorAlpha(index: number, alpha: number): string {
  const hue = (index * 47) % 360;
  return `hsla(${hue} 70% 58% / ${alpha})`;
}

/** Analytic biquad magnitude (peaking / shelf) for per-band contour drawing. */
export function getBandFrequencyResponseDb(
  freq: number,
  band: EqFilterBand,
): number {
  if (!band.enabled) {
    return 0;
  }
  const w = freq / Math.max(1e-6, band.frequency);
  const w2 = w * w;
  const Q = Math.max(0.05, band.q);

  if (band.type === "peaking") {
    const A = Math.pow(10, band.gainDb / 40);
    const num = Math.pow(1 - w2, 2) + Math.pow((w * A) / Q, 2);
    const den = Math.pow(1 - w2, 2) + Math.pow(w / (A * Q), 2);
    return 10 * Math.log10(Math.max(1e-10, num / den));
  }

  const A = Math.pow(10, band.gainDb / 40);
  const q = Q / Math.SQRT2;

  if (band.type === "lowshelf") {
    const num = Math.pow(A - w2, 2) + (A / (q * q)) * w2;
    const den = Math.pow(1 - A * w2, 2) + (A / (q * q)) * w2;
    return 10 * Math.log10(Math.max(1e-10, A * A * (num / den)));
  }

  const wInv2 = 1 / Math.max(1e-10, w2);
  const num = Math.pow(A - wInv2, 2) + (A / (q * q)) * wInv2;
  const den = Math.pow(1 - A * wInv2, 2) + (A / (q * q)) * wInv2;
  return 10 * Math.log10(Math.max(1e-10, A * A * (num / den)));
}

export function formatFreqAxisLabel(hz: number): string {
  return formatFreqTickLabel(hz);
}

export const LISTEN_MATCH_CLAMP_DB = 12;

export function getTotalEqResponseDb(
  freq: number,
  preampDb: number,
  filters: EqFilterBand[],
): number {
  let total = preampDb;
  for (const band of filters) {
    total += getBandFrequencyResponseDb(freq, band);
  }
  return total;
}

/**
 * Broadband gain (dB) to apply after the PEQ chain so wet level ≈ dry for bypass A/B.
 * Log-spaced power average of the full transfer function including preamp.
 */
export function computeListenMatchDb(
  preampDb: number,
  filters: EqFilterBand[],
  opts?: { minHz?: number; maxHz?: number; points?: number },
): number {
  const minHz = opts?.minHz ?? 20;
  const maxHz = opts?.maxHz ?? 20000;
  const points = opts?.points ?? 96;
  if (points < 2) {
    return 0;
  }
  let sumPower = 0;
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const freq = minHz * Math.pow(maxHz / minHz, t);
    const db = getTotalEqResponseDb(freq, preampDb, filters);
    sumPower += Math.pow(10, db / 10);
  }
  const meanPower = sumPower / points;
  const excessDb = 10 * Math.log10(Math.max(1e-20, meanPower));
  const matchDb = -excessDb;
  return Math.max(
    -LISTEN_MATCH_CLAMP_DB,
    Math.min(LISTEN_MATCH_CLAMP_DB, matchDb),
  );
}
