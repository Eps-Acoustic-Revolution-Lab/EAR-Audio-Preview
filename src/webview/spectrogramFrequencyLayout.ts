/**
 * Shared frequency-axis layout for log-scale spectrogram (Canvas2D + WebGL + hit-testing).
 * Vertical space is split into equal pixel segments between boundary frequencies; within each
 * segment, frequency maps logarithmically. Boundaries: minHz, then 100/200/400… in range, then maxHz.
 */

/** 0 Hz (if min<=0), then 100, 200, 400, … Hz for log-axis labels / segment corners. */
export function logScaleGridHz(minF: number, maxF: number): number[] {
  const ticks: number[] = [];
  if (minF <= 0) {
    ticks.push(0);
  }
  let x = 100;
  while (x <= maxF + 1e-9) {
    if (x + 1e-9 >= minF) {
      ticks.push(x);
    }
    x *= 2;
  }
  return [...new Set(ticks)].sort((a, b) => a - b);
}

/** Sorted unique Hz boundaries: always [minF, …grid points in (minF,maxF), maxF]. */
export function piecewiseLogAxisBoundaries(
  minF: number,
  maxF: number,
): number[] {
  const s = new Set<number>();
  s.add(minF);
  s.add(maxF);
  for (const t of logScaleGridHz(minF, maxF)) {
    if (t > minF + 1e-9 && t < maxF - 1e-9) {
      s.add(t);
    }
  }
  return [...s].sort((a, b) => a - b);
}

/** Map Hz to canvas y (top=0, down=+); bottom = min boundary, top = max boundary. */
export function hzToPiecewiseEqualSegmentY(
  hz: number,
  bounds: number[],
  height: number,
): number {
  const n = bounds.length;
  if (n < 2) {
    return height / 2;
  }
  const segPx = height / (n - 1);
  let i = 0;
  while (i < n - 2 && hz > bounds[i + 1] + 1e-9) {
    i++;
  }
  const b0 = bounds[i];
  const b1 = bounds[i + 1];
  const clamped = Math.min(Math.max(hz, b0), b1);
  if (clamped <= 0) {
    return height - i * segPx;
  }
  const l0 = Math.log10(Math.max(b0, 1e-6));
  const l1 = Math.log10(Math.max(b1, 1e-6));
  const lh = Math.log10(Math.max(clamped, 1e-6));
  const frac = l1 > l0 + 1e-15 ? (lh - l0) / (l1 - l0) : 0;
  return height - i * segPx - frac * segPx;
}

/**
 * Inverse: yNorm = 0 bottom → min Hz, yNorm = 1 top → max Hz (piecewise log segments).
 */
export function piecewiseYNormToHz(yNorm: number, bounds: number[]): number {
  const n = bounds.length;
  if (n < 2) {
    return bounds[0] ?? 0;
  }
  const span = n - 1;
  const pos = Math.min(Math.max(yNorm * span, 0), span - 1e-12);
  const i = Math.min(Math.floor(pos), n - 2);
  const frac = pos - i;
  const b0 = bounds[i];
  const b1 = bounds[i + 1];
  const l0 = Math.log10(Math.max(b0, 1e-6));
  const l1 = Math.log10(Math.max(b1, 1e-6));
  const lh = l0 + frac * (l1 - l0);
  return Math.pow(10, lh);
}

/** yNorm from canvas pixel (origin top): yFromTop in [0,height]. */
export function canvasYTopToLogPiecewiseYNorm(
  yFromTop: number,
  height: number,
): number {
  return 1 - yFromTop / height;
}
