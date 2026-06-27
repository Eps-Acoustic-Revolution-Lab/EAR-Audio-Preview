/** Shared log-frequency axis for live spectrum and phase-correlation plots. */

export const logPoints = 300;
export const freqMin = 20;
export const freqMax = 20000;

/** Spectrum analyzer frequency grid ticks (1-2-5 decade sequence). */
export const spectrumFreqTicks = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

/** CQT mode frequency ticks — ISO 266 octave centers, matching PAZ Analyzer. */
export const cqtSpectrumFreqTicks = [
  20, 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000,
];

/** Phase-correlation plot ticks (Metric AB Plot style). */
export const phaseCorrFreqTicks = [
  20, 40, 80, 200, 400, 800, 2000, 4000, 8000, 20000,
];

function logFreqPoints(): Float64Array {
  const pts = new Float64Array(logPoints);
  const lo = Math.log10(freqMin);
  const hi = Math.log10(freqMax);
  for (let i = 0; i < logPoints; i++) {
    pts[i] = Math.pow(10, lo + (i / (logPoints - 1)) * (hi - lo));
  }
  return pts;
}

export const logFreqs = logFreqPoints();

export function freqToCanvasX(f: number, padL: number, drawW: number): number {
  return (
    padL +
    ((Math.log10(f) - Math.log10(freqMin)) /
      (Math.log10(freqMax) - Math.log10(freqMin))) *
      drawW
  );
}

export function hzFromCanvasX(x: number, padL: number, drawW: number): number {
  const t = (x - padL) / drawW;
  const tl = Math.max(0, Math.min(1, t));
  const lo = Math.log10(freqMin);
  const hi = Math.log10(freqMax);
  return Math.pow(10, lo + tl * (hi - lo));
}

export function logIndexFromHz(hz: number): number {
  const lo = Math.log10(freqMin);
  const hi = Math.log10(freqMax);
  return (
    ((Math.log10(Math.max(hz, freqMin)) - lo) / (hi - lo)) * (logPoints - 1)
  );
}

export function lerpF32(arr: Float32Array, idx: number, fallback = 0): number {
  const n = arr.length;
  if (n < 2) {
    return n === 1 ? arr[0] : fallback;
  }
  const i = Math.max(0, Math.min(n - 2, Math.floor(idx)));
  const f = idx - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}

export function fmtHzLive(hz: number): string {
  if (!Number.isFinite(hz)) {
    return "—";
  }
  if (hz >= 10000) {
    return `${(hz / 1000).toFixed(2)} kHz`;
  }
  if (hz >= 1000) {
    return `${(hz / 1000).toFixed(3)} kHz`;
  }
  return `${hz.toFixed(1)} Hz`;
}

export function formatFreqTickLabel(f: number): string {
  if (f >= 1000) {
    const k = f / 1000;
    return Number.isInteger(k) ? `${k}k` : `${Math.round(k)}k`;
  }
  return String(f);
}

/* ── Parameterized variants (explicit axis bounds) ─────────────── */

/** Like freqToCanvasX but with explicit axis bounds. */
export function freqToCanvasXParam(
  f: number,
  padL: number,
  drawW: number,
  fMin: number,
  fMax: number,
): number {
  return (
    padL +
    ((Math.log10(f) - Math.log10(fMin)) /
      (Math.log10(fMax) - Math.log10(fMin))) *
      drawW
  );
}

/** Like hzFromCanvasX but with explicit axis bounds. */
export function hzFromCanvasXParam(
  x: number,
  padL: number,
  drawW: number,
  fMin: number,
  fMax: number,
): number {
  const t = Math.max(0, Math.min(1, (x - padL) / drawW));
  const lo = Math.log10(fMin);
  const hi = Math.log10(fMax);
  return Math.pow(10, lo + t * (hi - lo));
}

/** Like logIndexFromHz but with explicit axis bounds and point count. */
export function logIndexFromHzParam(
  hz: number,
  fMin: number,
  fMax: number,
  numPoints: number,
): number {
  const lo = Math.log10(fMin);
  const hi = Math.log10(fMax);
  return ((Math.log10(Math.max(hz, fMin)) - lo) / (hi - lo)) * (numPoints - 1);
}

/** Generate log-spaced frequency array for arbitrary range and count. */
export function logFreqPointsParam(
  fMin: number,
  fMax: number,
  n: number,
): Float64Array {
  const pts = new Float64Array(n);
  const lo = Math.log10(fMin);
  const hi = Math.log10(fMax);
  for (let i = 0; i < n; i++) {
    pts[i] = Math.pow(10, lo + (i / (n - 1)) * (hi - lo));
  }
  return pts;
}

/* ── Dynamic tick generators ───────────────────────────────────── */

/** FFT mode ticks: 1-2-5 decade sequence + sr/2, bounded to [10, nyquist]. */
export function fftSpectrumFreqTicksForSr(sr: number): number[] {
  const nyquist = sr / 2;
  const base = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const ticks = base.filter((f) => f <= nyquist);
  if (ticks[ticks.length - 1] !== nyquist) {
    ticks.push(nyquist);
  }
  return ticks;
}

/** CQT mode ticks: ISO 266 octave centers + sr/2, bounded to [8, nyquist]. */
export function cqtSpectrumFreqTicksForSr(sr: number): number[] {
  const nyquist = sr / 2;
  const base = [8, 16, 31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const ticks = base.filter((f) => f <= nyquist);
  if (ticks[ticks.length - 1] !== nyquist) {
    ticks.push(nyquist);
  }
  return ticks;
}
