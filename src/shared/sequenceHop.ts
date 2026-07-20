/**
 * Adaptive hop for F0 / onset sequence analysis.
 * Targets enough frames for readable curves at any duration while capping compute cost.
 */
export function computeAdaptiveSequenceHopSec(
  durationSec: number,
  sampleRate: number,
): number {
  const targetPointsMin = 300;
  /** Cap ≈ 60 frames/s over two minutes; long tracks degrade gracefully. */
  const targetPointsMax = 7200;
  /** ~60 frames/s — matches the 60 Hz display granularity of the strips. */
  const pointsPerSec = 60;

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
