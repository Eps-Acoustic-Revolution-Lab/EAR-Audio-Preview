/** Sound-field display modes (iZotope Insight 2 Sound Field). */
export type SoundFieldMode = "polarSample" | "polarLevel" | "lissajous";

import { quinticBSplineSmooth } from "./quinticBSpline";
import {
  clampReleaseDbPerSec,
  emaDecayFromReleaseDbPerSec,
  liveReleaseDbpsMin,
  peakFallDbPerFrameFromRelease,
} from "./liveBallistics";

/** Insight-style azimuth: M at π/2, in-phase L/R at 3π/4 and π/4, anti-phase at π and 0. */
export function stereoFieldAngleRad(l: number, r: number): number {
  const theta = Math.PI / 2 + Math.atan2(l - r, l + r + 1e-12);
  return Math.max(0, Math.min(Math.PI, theta));
}

/** Sample energy magnitude (linear). */
export function stereoFieldMagnitude(l: number, r: number): number {
  return Math.hypot(l, r);
}

export function isInPhaseStereoAngle(theta: number): boolean {
  const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return t >= Math.PI / 4 && t <= (3 * Math.PI) / 4;
}

/** Canvas position on semicircle sound field (origin at bottom center, θ CCW from +x). */
export function polarFieldCanvasXY(
  cx: number,
  cy: number,
  fieldRadius: number,
  theta: number,
  radialNorm: number,
): { x: number; y: number } {
  const len = radialNorm * fieldRadius;
  return {
    x: cx + len * Math.cos(theta),
    y: cy - len * Math.sin(theta),
  };
}

/** Map bin index to ray angle (radians) spanning [0, π] (anti-phase wings at 0 and π). */
export function polarBinToAngleRad(binIndex: number, numBins: number): number {
  return Math.PI * (1 - (binIndex + 0.5) / numBins);
}

/** Linear interp of smoothed RMS bins at semicircle angle θ ∈ [0, π]. */
export function interpolatePolarRmsAtAngle(
  bins: Float32Array,
  theta: number,
): number {
  const n = bins.length;
  if (n < 2) {
    return n === 1 ? bins[0] : 0;
  }
  const t = Math.max(0, Math.min(Math.PI, theta));
  const f = (1 - t / Math.PI) * n - 0.5;
  const i0 = Math.max(0, Math.min(n - 2, Math.floor(f)));
  const frac = f - i0;
  return bins[i0] * (1 - frac) + bins[i0 + 1] * frac;
}

function binIndexForAngle(theta: number, numBins: number): number {
  return Math.min(
    numBins - 1,
    Math.max(0, Math.floor((theta / Math.PI) * numBins)),
  );
}

/**
 * Spread energy into neighboring bins (partial directionality).
 * Polar Level uses neighborMix=0; Polar Sample / display may use small values.
 */
export function depositPolarBinEnergy(
  bins: Float32Array,
  idx: number,
  energy: number,
  neighborMix = 0.18,
): void {
  const keep = 1 - neighborMix;
  bins[idx] += energy * keep;
  if (idx > 0) {
    bins[idx - 1] += energy * (neighborMix * 0.5);
  }
  if (idx < bins.length - 1) {
    bins[idx + 1] += energy * (neighborMix * 0.5);
  }
}

/**
 * Per-frame RMS magnitude per angular bin (linear).
 * Uses bin RMS instead of peak-hold for smoother ballistics input.
 */
export function computeInstantPolarBins(
  lBuf: Float32Array,
  rBuf: Float32Array,
  out: Float32Array,
  stride = 4,
  neighborMix = 0,
): void {
  out.fill(0);
  const n = lBuf.length;
  const numBins = out.length;
  const sumSq = new Float32Array(numBins);
  const counts = new Uint16Array(numBins);
  for (let i = 0; i < n; i += stride) {
    const left = lBuf[i];
    const right = rBuf[i];
    const mag = stereoFieldMagnitude(left, right);
    if (mag < 1e-9) {
      continue;
    }
    const theta = stereoFieldAngleRad(left, right);
    const idx = binIndexForAngle(theta, numBins);
    sumSq[idx] += mag * mag;
    counts[idx]++;
  }
  for (let i = 0; i < numBins; i++) {
    if (counts[i] > 0) {
      out[i] = Math.sqrt(sumSq[i] / counts[i]);
    }
  }
  if (neighborMix <= 0) {
    return;
  }
  const scratch = new Float32Array(numBins);
  for (let i = 0; i < numBins; i++) {
    if (out[i] <= 0) {
      continue;
    }
    depositPolarBinEnergy(scratch, i, out[i], neighborMix);
  }
  for (let i = 0; i < numBins; i++) {
    out[i] = Math.max(out[i], scratch[i]);
  }
}

/**
 * Polar Sample: collect (angle, radius) dots for semicircle scatter.
 */
export function collectPolarSamplePoints(
  lBuf: Float32Array,
  rBuf: Float32Array,
  outTheta: number[],
  outRadius: number[],
  stride = 6,
  radiusGamma = 1,
): void {
  const n = lBuf.length;
  for (let i = 0; i < n; i += stride) {
    const left = lBuf[i];
    const right = rBuf[i];
    const mag = stereoFieldMagnitude(left, right);
    if (mag < 1e-9) {
      continue;
    }
    outTheta.push(stereoFieldAngleRad(left, right));
    outRadius.push(polarSampleDisplayRadius(mag, radiusGamma));
  }
}

export const polarSampleRadiusGammaMin = 0.1;
export const polarSampleRadiusGammaMax = 1;
export const polarSampleRadiusGammaDefault = 0.5;

export const polarSampleFillBrightnessPctMin = 0;
export const polarSampleFillBrightnessPctMax = 50;
export const polarSampleFillBrightnessPctDefault = 10;

export function clampPolarSampleRadiusGamma(gamma: number): number {
  const v = Number(gamma);
  if (!Number.isFinite(v)) {
    return polarSampleRadiusGammaDefault;
  }
  const clamped = Math.max(
    polarSampleRadiusGammaMin,
    Math.min(polarSampleRadiusGammaMax, v),
  );
  return Math.round(clamped * 20) / 20;
}

export function clampPolarSampleFillBrightnessPct(pct: number): number {
  const v = Number(pct);
  if (!Number.isFinite(v)) {
    return polarSampleFillBrightnessPctDefault;
  }
  return Math.max(
    polarSampleFillBrightnessPctMin,
    Math.min(polarSampleFillBrightnessPctMax, Math.round(v)),
  );
}

/** Scale scatter/fill alpha by brightness pct (0 = unchanged, 10 = +10%). */
export function polarSampleFillAlpha(
  base: number,
  brightnessPct: number,
): number {
  const boost = 1 + clampPolarSampleFillBrightnessPct(brightnessPct) / 100;
  return Math.min(1, base * boost);
}

/** Polar Sample radial mapping: min(1, mag^gamma). gamma=1 linear; <1 expands, >1 compresses. */
export function polarSampleDisplayRadius(mag: number, gamma = 1): number {
  const g = clampPolarSampleRadiusGamma(gamma);
  return Math.min(1, Math.pow(Math.min(1, mag), g));
}

/**
 * Zero bins below a fraction of the peak (directional gate — suppresses non-prominent lobes).
 * floorRatio 0 = off; 1 = keep peak bin only.
 */
export function applyPolarDirectionalGate(
  bins: Float32Array,
  floorRatio = 0.28,
): void {
  if (floorRatio <= 0) {
    return;
  }
  let max = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] > max) {
      max = bins[i];
    }
  }
  if (max < 1e-9) {
    return;
  }
  const floor = max * floorRatio;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] < floor) {
      bins[i] = 0;
    }
  }
}

/**
 * Spectrum-style pre-ballistics shaping: smooth → gate → smooth on angular bins.
 * Gate after the first smooth pass avoids hard per-frame cutoffs on raw bins.
 */
export function shapePolarInstantForBallistics(
  instant: Float32Array,
  scratch: Float32Array,
  gateFloorRatio = 0.28,
): void {
  scratch.set(quinticBSplineSmooth(instant));
  applyPolarDirectionalGate(scratch, gateFloorRatio);
  instant.set(quinticBSplineSmooth(scratch));
}

export function polarFieldPeakFallDbPerFrame(releaseDbPerSec: number): number {
  return peakFallDbPerFrameFromRelease(releaseDbPerSec);
}

/**
 * Spectrum-style ballistics: same smoothed instant v feeds peak and RMS.
 * Peak fall is proportional in linear amplitude (dB-domain equivalent).
 */
export function updatePolarRmsPeak(
  instant: Float32Array,
  rms: Float32Array,
  peak: Float32Array,
  rmsDecay: number,
  peakFallDbPerFrame: number,
): void {
  const fallScale =
    peakFallDbPerFrame > 0 ? 1 - Math.pow(10, -peakFallDbPerFrame / 20) : 0;
  for (let i = 0; i < instant.length; i++) {
    const v = instant[i];
    const pk = peak[i];
    if (v >= pk) {
      peak[i] = v;
    } else {
      const linearFall = pk * fallScale;
      peak[i] = Math.max(v, pk - linearFall);
    }
    rms[i] = rmsDecay * rms[i] + (1 - rmsDecay) * v;
  }
}

/** Max linear magnitude across bins (shared peak/rms scale). */
export function polarDisplayMax(rms: Float32Array, peak: Float32Array): number {
  let m = 0;
  for (let i = 0; i < rms.length; i++) {
    if (rms[i] > m) {
      m = rms[i];
    }
    if (peak[i] > m) {
      m = peak[i];
    }
  }
  return m;
}

/** Max linear magnitude across bins for normalization (shared peak/rms scale). */
export function polarDisplayNorm(
  rms: Float32Array,
  peak: Float32Array,
): number {
  const m = polarDisplayMax(rms, peak);
  return m > 1e-8 ? 1 / m : 0;
}

/** Theoretical max hypot(L,R) for normalized stereo peaks. */
export const polarLevelDisplayHeadroom = Math.SQRT2;

/**
 * EMA decay for Polar Level **display zoom** only: slower than per-bin ballistics
 * so global norm does not pump when `polarDisplayMax` spikes frame-to-frame.
 */
export const polarLevelScaleReleaseRatio = 0.22;

export function polarLevelDisplayScaleDecay(releaseDbPerSec: number): number {
  const right = Math.max(
    liveReleaseDbpsMin,
    clampReleaseDbPerSec(releaseDbPerSec) * polarLevelScaleReleaseRatio,
  );
  return emaDecayFromReleaseDbPerSec(right);
}

/**
 * Draw normalization for Polar Level (smoothed global scale + headroom).
 * Uses only {@link smoothedScale} so zoom is not hard-coupled to instantaneous
 * `max(rms, peak)` (which caused violent radial pumping on level jumps).
 */
export function polarLevelDrawNorm(smoothedScale: number): number {
  if (!Number.isFinite(smoothedScale) || smoothedScale <= 1e-8) {
    return 0;
  }
  return 1 / (smoothedScale * polarLevelDisplayHeadroom);
}

/** Map ballistics value to unit semicircle radius in [0, 1]. */
export function polarLevelDrawLength(value: number, norm: number): number {
  return Math.min(1, Math.max(0, value * norm));
}

/**
 * EMA-smoothed display scale toward `polarDisplayMax(rms, peak)`.
 * Polar Level passes a slower decay via {@link polarLevelDisplayScaleDecay}.
 */
export function updatePolarDisplayScale(
  scale: number,
  rms: Float32Array,
  peak: Float32Array,
  scaleDecay: number,
): number {
  const m = polarDisplayMax(rms, peak);
  if (m <= 1e-8) {
    return scaleDecay * scale;
  }
  return scaleDecay * scale + (1 - scaleDecay) * m;
}

export function polarFieldRmsDecay(releaseDbPerSec: number): number {
  return emaDecayFromReleaseDbPerSec(releaseDbPerSec);
}

export function polarFieldPeakFall(releaseDbPerSec: number): number {
  return polarFieldPeakFallDbPerFrame(releaseDbPerSec);
}

/** Clip canvas drawing to the upper semicircle (chord on baseline). */
export function clipUpperSemicircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.arc(cx, cy, radius, Math.PI, 0);
  ctx.lineTo(cx + radius, cy);
  ctx.closePath();
  ctx.clip();
}

/** Clip to centered circle (Lissajous M/S). */
export function clipCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
}

/** Clip to centered square (legacy). */
export function clipCenteredSquare(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number,
): void {
  ctx.beginPath();
  ctx.rect(cx - half, cy - half, half * 2, half * 2);
  ctx.clip();
}
