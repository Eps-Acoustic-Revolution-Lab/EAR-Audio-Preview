/** Live meter / spectrum ballistics in dB/s (release rate when level falls). */

export const liveReleaseDbpsMin = 0.5;
export const liveReleaseDbpsMax = 36;
export const liveReleaseDbpsDefault = 8;
export const liveFrameRate = 60;

export function clampReleaseDbPerSec(value: number): number {
  const v = Number(value);
  if (!Number.isFinite(v)) {return liveReleaseDbpsDefault;}
  const clamped = Math.max(
    liveReleaseDbpsMin,
    Math.min(liveReleaseDbpsMax, v),
  );
  return Math.round(clamped * 2) / 2;
}

/**
 * Map legacy 0–100 smoothing pct to release dB/s (0 = fast, 100 = slow).
 * Log-spaced between {@link liveReleaseDbpsMax} and {@link liveReleaseDbpsMin}.
 */
export function migrateSmoothingPctToReleaseDbPerSec(pct: number): number {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const logMin = Math.log(liveReleaseDbpsMin);
  const logMax = Math.log(liveReleaseDbpsMax);
  return clampReleaseDbPerSec(Math.exp(logMax + (logMin - logMax) * t));
}

/**
 * Resolve stored release dB/s from new field or legacy pct cache keys.
 */
export function resolveReleaseDbPerSec(
  releaseDbPerSec: number | undefined,
  legacyPct: number | undefined,
  fallbackPct = 35,
): number {
  if (releaseDbPerSec !== undefined && Number.isFinite(releaseDbPerSec)) {
    return clampReleaseDbPerSec(releaseDbPerSec);
  }
  return migrateSmoothingPctToReleaseDbPerSec(legacyPct ?? fallbackPct);
}

/** EMA coefficient per frame for amplitude ballistics at given release rate. */
export function emaDecayFromReleaseDbPerSec(
  releaseDbPerSec: number,
  fps = liveFrameRate,
): number {
  const right = clampReleaseDbPerSec(releaseDbPerSec);
  const tau = 20 / (Math.LN10 * right);
  return Math.exp(-1 / (fps * tau));
}

/** Peak envelope fall in dB per animation frame. */
export function peakFallDbPerFrameFromRelease(
  releaseDbPerSec: number,
  fps = liveFrameRate,
): number {
  return clampReleaseDbPerSec(releaseDbPerSec) / fps;
}

/** Peak outline hold before dB/s decay, live spectrum (seconds). */
export const liveSpectrumPeakHoldSecMin = 0;
export const liveSpectrumPeakHoldSecMax = 3;

export function clampLiveSpectrumPeakHoldSec(value: number): number {
  const v = Number(value);
  if (!Number.isFinite(v)) {return 0;}
  const clamped = Math.max(
    liveSpectrumPeakHoldSecMin,
    Math.min(liveSpectrumPeakHoldSecMax, v),
  );
  return Math.round(clamped * 20) / 20;
}

/** Scatter / trail alpha multiplier per frame (amplitude-equivalent release). */
export function scatterAlphaDecayFromReleaseDbPerSec(
  releaseDbPerSec: number,
  fps = liveFrameRate,
): number {
  const right = clampReleaseDbPerSec(releaseDbPerSec);
  return Math.pow(10, -right / (20 * fps));
}

/** Overlay alpha for offscreen acc fade (1 − per-frame scatter decay). */
export function scatterFadeOverlayAlphaFromReleaseDbPerSec(
  releaseDbPerSec: number,
  fps = liveFrameRate,
): number {
  return 1 - scatterAlphaDecayFromReleaseDbPerSec(releaseDbPerSec, fps);
}

export function formatReleaseDbPerSecLabel(dbPerSec: number): string {
  return `${clampReleaseDbPerSec(dbPerSec).toFixed(1)} dB/s`;
}
