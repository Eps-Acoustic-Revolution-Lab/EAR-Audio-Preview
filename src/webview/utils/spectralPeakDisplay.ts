/**
 * Smooth the drawn live-spectrum peak outline toward {@link peakLogical}
 * without changing the ballistic/hold semantics of {@link peakLogical}.
 *
 * Rises snap to logical; falls chase logical at ≥ {@link peakFallDbPerFrame} dB/frame.
 */

export const spectralPeakDisplayChaseK = 2.5;

export function stepSpectralPeakDisplay(
  peakLogical: number,
  peakDisplayPrev: number,
  peakFallDbPerFrame: number,
  chaseK: number = spectralPeakDisplayChaseK,
): number {
  if (!Number.isFinite(peakLogical)) {
    return peakDisplayPrev;
  }
  if (!Number.isFinite(peakDisplayPrev)) {
    return peakLogical;
  }
  if (peakLogical >= peakDisplayPrev) {
    return peakLogical;
  }
  const chaseDb = peakFallDbPerFrame * chaseK;
  return Math.max(peakLogical, peakDisplayPrev - chaseDb);
}

/** Linear magnitude floor for Polar Level display stepping (matches spectrum dB chase in log domain). */
const polarPeakLinEps = 1e-18;

/**
 * Polar Level outer outline: convert linear magnitudes to dBFS, apply
 * {@link stepSpectralPeakDisplay}, convert back — same fall chase as live spectrum.
 */
export function stepPolarPeakDisplayLinear(
  peakLogicalLin: number,
  peakDisplayPrevLin: number,
  peakFallDbPerFrame: number,
  chaseK?: number,
): number {
  if (!Number.isFinite(peakLogicalLin)) {
    return peakDisplayPrevLin;
  }
  if (!Number.isFinite(peakDisplayPrevLin)) {
    return peakLogicalLin;
  }
  const logicalDb = 20 * Math.log10(Math.max(peakLogicalLin, polarPeakLinEps));
  const prevDb = 20 * Math.log10(Math.max(peakDisplayPrevLin, polarPeakLinEps));
  const nextDb = stepSpectralPeakDisplay(
    logicalDb,
    prevDb,
    peakFallDbPerFrame,
    chaseK,
  );
  return Math.pow(10, nextDb / 20);
}

/**
 * One-pass narrow 3-tap smoothing along frequency bins only (lightly reduces
 * neighboring-bin phase mismatch without washing out narrow peaks).
 */
export function smoothPeakDisplayAlongBinsInto(
  src: Float32Array,
  dst: Float32Array,
  n: number,
): void {
  const wEdge = 0.12;
  const wCtr = 1 - 2 * wEdge;
  if (n < 2) {
    if (n === 1) {
      dst[0] = src[0];
    }
    return;
  }
  dst[0] = (1 - wEdge) * src[0] + wEdge * src[1];
  for (let i = 1; i < n - 1; i++) {
    dst[i] = wEdge * src[i - 1] + wCtr * src[i] + wEdge * src[i + 1];
  }
  dst[n - 1] = wEdge * src[n - 2] + (1 - wEdge) * src[n - 1];
}

/**
 * Same weights as {@link smoothPeakDisplayAlongBinsInto} but wrap indices
 * (Polar Level closed polygon on angular bins).
 */
export function smoothPeakDisplayCircularBinsInto(
  src: Float32Array,
  dst: Float32Array,
  n: number,
): void {
  const wEdge = 0.12;
  const wCtr = 1 - 2 * wEdge;
  if (n < 2) {
    if (n === 1) {
      dst[0] = src[0];
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    const im = (i - 1 + n) % n;
    const ip = (i + 1) % n;
    dst[i] = wEdge * src[im] + wCtr * src[i] + wEdge * src[ip];
  }
}
