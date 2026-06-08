/**
 * Adaptive hop for F0 / onset sequence analysis.
 * Targets enough frames for readable curves at any duration while capping compute cost.
 */
export function computeAdaptiveSequenceHopSec(
  durationSec: number,
  sampleRate: number,
): number {
  const targetPointsMin = 250;
  const targetPointsMax = 3500;
  /** ~45 frames/s for short clips; capped for long tracks. */
  const pointsPerSec = 45;

  const safeDuration = Math.max(0.01, durationSec);
  const targetPoints = Math.min(
    targetPointsMax,
    Math.max(targetPointsMin, Math.round(safeDuration * pointsPerSec)),
  );

  const minHopSamples = 256;
  const minHopSec = minHopSamples / Math.max(1, sampleRate);

  let hopSec = safeDuration / targetPoints;
  hopSec = Math.max(minHopSec, hopSec);
  return hopSec;
}
