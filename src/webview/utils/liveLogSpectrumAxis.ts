/** Shared log-frequency axis for live spectrum and phase-correlation plots. */

export const LOG_POINTS = 300;
export const FREQ_MIN = 20;
export const FREQ_MAX = 20000;

/** Spectrum analyzer frequency grid ticks. */
export const SPECTRUM_FREQ_TICKS = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

/** Phase-correlation plot ticks (Metric AB Plot style). */
export const PHASE_CORR_FREQ_TICKS = [
  20, 40, 80, 200, 400, 800, 2000, 4000, 8000, 20000,
];

function logFreqPoints(): Float64Array {
  const pts = new Float64Array(LOG_POINTS);
  const lo = Math.log10(FREQ_MIN);
  const hi = Math.log10(FREQ_MAX);
  for (let i = 0; i < LOG_POINTS; i++) {
    pts[i] = Math.pow(10, lo + (i / (LOG_POINTS - 1)) * (hi - lo));
  }
  return pts;
}

export const LOG_FREQS = logFreqPoints();

export function freqToCanvasX(
  f: number,
  padL: number,
  drawW: number,
): number {
  return (
    padL +
    ((Math.log10(f) - Math.log10(FREQ_MIN)) /
      (Math.log10(FREQ_MAX) - Math.log10(FREQ_MIN))) *
      drawW
  );
}

export function hzFromCanvasX(x: number, padL: number, drawW: number): number {
  const t = (x - padL) / drawW;
  const tl = Math.max(0, Math.min(1, t));
  const lo = Math.log10(FREQ_MIN);
  const hi = Math.log10(FREQ_MAX);
  return Math.pow(10, lo + tl * (hi - lo));
}

export function logIndexFromHz(hz: number): number {
  const lo = Math.log10(FREQ_MIN);
  const hi = Math.log10(FREQ_MAX);
  return (
    ((Math.log10(Math.max(hz, FREQ_MIN)) - lo) / (hi - lo)) * (LOG_POINTS - 1)
  );
}

export function lerpF32(arr: Float32Array, idx: number, fallback = 0): number {
  const n = arr.length;
  if (n < 2) {return n === 1 ? arr[0] : fallback;}
  const i = Math.max(0, Math.min(n - 2, Math.floor(idx)));
  const f = idx - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

export function fmtHzLive(hz: number): string {
  if (!Number.isFinite(hz)) {return "—";}
  if (hz >= 10000) {return `${(hz / 1000).toFixed(2)} kHz`;}
  if (hz >= 1000) {return `${(hz / 1000).toFixed(3)} kHz`;}
  return `${hz.toFixed(1)} Hz`;
}

export function formatFreqTickLabel(f: number): string {
  return f >= 1000 ? `${f / 1000}k` : String(f);
}
