import {
  emaDecayFromReleaseDbPerSec,
  peakFallDbPerFrameFromRelease,
  scatterAlphaDecayFromReleaseDbPerSec,
  scatterFadeOverlayAlphaFromReleaseDbPerSec,
} from "./liveBallistics";
import {
  applyPolarDirectionalGate,
  clampPolarSampleFillBrightnessPct,
  computeInstantPolarBins,
  interpolatePolarRmsAtAngle,
  isInPhaseStereoAngle,
  polarBinToAngleRad,
  polarFieldCanvasXY,
  polarDisplayNorm,
  polarLevelDisplayScaleDecay,
  polarLevelDrawLength,
  polarLevelDrawNorm,
  polarSampleDisplayRadius,
  polarSampleFillAlpha,
  shapePolarInstantForBallistics,
  stereoFieldAngleRad,
  stereoFieldMagnitude,
  updatePolarDisplayScale,
  updatePolarRmsPeak,
} from "./stereoPolarField";

describe("stereoPolarField", () => {
  test("stereoFieldAngleRad maps in-phase L/R to ±45° from M", () => {
    expect(stereoFieldAngleRad(1, 0)).toBeCloseTo((3 * Math.PI) / 4, 5);
    expect(stereoFieldAngleRad(0, 1)).toBeCloseTo(Math.PI / 4, 5);
    expect(stereoFieldAngleRad(1, 1)).toBeCloseTo(Math.PI / 2, 5);
  });

  test("stereoFieldAngleRad maps anti-phase to baseline wings", () => {
    expect(stereoFieldAngleRad(1, -1)).toBeCloseTo(Math.PI, 5);
    expect(stereoFieldAngleRad(-1, 1)).toBeCloseTo(0, 5);
  });

  test("stereoFieldMagnitude", () => {
    expect(stereoFieldMagnitude(1, 0)).toBeCloseTo(1, 5);
    expect(stereoFieldMagnitude(1, 1)).toBeCloseTo(Math.SQRT2, 5);
  });

  test("isInPhaseStereoAngle uses ±45° from vertical", () => {
    expect(isInPhaseStereoAngle(Math.PI / 2)).toBe(true);
    expect(isInPhaseStereoAngle(Math.PI / 4)).toBe(true);
    expect(isInPhaseStereoAngle((3 * Math.PI) / 4)).toBe(true);
    expect(isInPhaseStereoAngle(Math.PI / 8)).toBe(false);
    expect(isInPhaseStereoAngle(stereoFieldAngleRad(1, -1))).toBe(false);
  });

  test("polarBinToAngleRad spans left to right", () => {
    expect(polarBinToAngleRad(0, 4)).toBeCloseTo((7 * Math.PI) / 8, 5);
    expect(polarBinToAngleRad(3, 4)).toBeCloseTo(Math.PI / 8, 5);
  });

  test("computeInstantPolarBins places pure L in left bins", () => {
    const bins = new Float32Array(8);
    const l = new Float32Array([1, 1, 1]);
    const r = new Float32Array([0, 0, 0]);
    computeInstantPolarBins(l, r, bins, 1, 0);
    const leftSum = bins.slice(4).reduce((a, b) => a + b, 0);
    const rightSum = bins.slice(0, 4).reduce((a, b) => a + b, 0);
    expect(leftSum).toBeGreaterThan(rightSum);
  });

  test("computeInstantPolarBins with neighborMix=0 has no side lobes for single bin spike", () => {
    const numBins = 120;
    const bins = new Float32Array(numBins);
    const monoIdx = Math.floor(numBins / 2);
    const l = new Float32Array([1]);
    const r = new Float32Array([1]);
    computeInstantPolarBins(l, r, bins, 1, 0);
    for (let i = 0; i < numBins; i++) {
      if (i === monoIdx) {
        expect(bins[i]).toBeGreaterThan(0);
      } else {
        expect(bins[i]).toBe(0);
      }
    }
  });

  test("polarFieldCanvasXY maps in-phase L/R to ±45° rays", () => {
    const cx = 100;
    const cy = 200;
    const r = 80;
    const l = polarFieldCanvasXY(cx, cy, r, (3 * Math.PI) / 4, 1);
    expect(l.x).toBeCloseTo(cx - r * Math.SQRT1_2, 4);
    expect(l.y).toBeCloseTo(cy - r * Math.SQRT1_2, 4);
    const rt = polarFieldCanvasXY(cx, cy, r, Math.PI / 4, 1);
    expect(rt.x).toBeCloseTo(cx + r * Math.SQRT1_2, 4);
    expect(rt.y).toBeCloseTo(cy - r * Math.SQRT1_2, 4);
  });

  test("polarSampleDisplayRadius gamma=1 is linear", () => {
    expect(polarSampleDisplayRadius(0.8, 1)).toBeCloseTo(0.8, 5);
    expect(polarSampleDisplayRadius(1.2, 1)).toBe(1);
  });

  test("polarSampleDisplayRadius gamma below 1 expands radius", () => {
    expect(polarSampleDisplayRadius(0.5, 0.5)).toBeGreaterThan(0.5);
  });

  test("polarSampleDisplayRadius gamma above 1 compresses radius", () => {
    expect(polarSampleDisplayRadius(0.9, 1.5)).toBeLessThan(0.9);
  });

  test("polarSampleFillAlpha boosts alpha by brightness pct", () => {
    expect(polarSampleFillAlpha(0.78, 0)).toBeCloseTo(0.78, 5);
    expect(polarSampleFillAlpha(0.78, 10)).toBeCloseTo(0.858, 3);
    expect(polarSampleFillAlpha(0.95, 10)).toBe(1);
  });

  test("clampPolarSampleFillBrightnessPct clamps and defaults", () => {
    expect(clampPolarSampleFillBrightnessPct(10)).toBe(10);
    expect(clampPolarSampleFillBrightnessPct(99)).toBe(50);
    expect(clampPolarSampleFillBrightnessPct(Number.NaN)).toBe(10);
  });

  test("polarLevelDrawNorm is zero until smoothed scale is established", () => {
    expect(polarLevelDrawNorm(0)).toBe(0);
    expect(polarLevelDrawLength(0.5, polarLevelDrawNorm(0))).toBe(0);
  });

  test("polarLevelDrawNorm uses smoothed scale only (no instant max coupling)", () => {
    const norm = polarLevelDrawNorm(0.3);
    expect(polarLevelDrawLength(0.3, norm)).toBeCloseTo(1 / Math.SQRT2, 3);
    expect(polarLevelDrawLength(1, norm)).toBe(1);
  });

  test("polarLevelDisplayScaleDecay is slower EMA than ballistics at same release", () => {
    const right = 8;
    const dBall = emaDecayFromReleaseDbPerSec(right);
    const dScale = polarLevelDisplayScaleDecay(right);
    expect(dScale).toBeGreaterThan(dBall);
  });

  test("updatePolarDisplayScale smooths scale changes", () => {
    const rms = new Float32Array([0.5, 0.2]);
    const peak = new Float32Array([0.8, 0.1]);
    const s0 = updatePolarDisplayScale(0, rms, peak, 0.9);
    expect(s0).toBeCloseTo(0.08, 3);
    const rms2 = new Float32Array([0.9, 0.2]);
    const peak2 = new Float32Array([0.95, 0.1]);
    const s1 = updatePolarDisplayScale(s0, rms2, peak2, 0.9);
    expect(s1).toBeGreaterThan(s0);
    expect(s1).toBeLessThan(0.95);
  });

  test("applyPolarDirectionalGate zeros weak bins", () => {
    const bins = new Float32Array([0.1, 0.9, 0.2, 0.05]);
    applyPolarDirectionalGate(bins, 0.28);
    expect(bins[1]).toBeCloseTo(0.9, 5);
    expect(bins[0]).toBe(0);
    expect(bins[2]).toBe(0);
    expect(bins[3]).toBe(0);
  });

  test("applyPolarDirectionalGate with floorRatio 0 is no-op", () => {
    const bins = new Float32Array([0.1, 0.9]);
    applyPolarDirectionalGate(bins, 0);
    expect(bins[0]).toBeCloseTo(0.1, 5);
  });

  test("shapePolarInstantForBallistics smooths angular profile", () => {
    const instant = new Float32Array(8);
    instant[3] = 1;
    instant[4] = 0.8;
    const scratch = new Float32Array(8);
    shapePolarInstantForBallistics(instant, scratch);
    expect(instant[3]).toBeGreaterThan(instant[0]);
    expect(instant[4]).toBeGreaterThan(0);
    expect(instant[0]).toBeLessThan(0.05);
  });

  test("updatePolarRmsPeak steady state: peak equals rms when v is constant", () => {
    const instant = new Float32Array([0.8, 0, 0.5]);
    const rms = new Float32Array(3);
    const peak = new Float32Array(3);
    const rmsDecay = 0.95;
    const peakFallDb = 0.01;
    for (let frame = 0; frame < 200; frame++) {
      updatePolarRmsPeak(instant, rms, peak, rmsDecay, peakFallDb);
    }
    for (let i = 0; i < instant.length; i++) {
      if (instant[i] > 0) {
        expect(peak[i]).toBeCloseTo(rms[i], 4);
        expect(peak[i]).toBeCloseTo(instant[i], 4);
      }
    }
  });

  test("updatePolarRmsPeak keeps peak >= rms during attack", () => {
    const instant = new Float32Array([1, 0]);
    const rms = new Float32Array(2);
    const peak = new Float32Array(2);
    updatePolarRmsPeak(
      instant,
      rms,
      peak,
      emaDecayFromReleaseDbPerSec(8),
      peakFallDbPerFrameFromRelease(8),
    );
    expect(peak[0]).toBeGreaterThanOrEqual(rms[0]);
    expect(rms[0]).toBeGreaterThan(0);
  });

  test("polarDisplayNorm uses unified max of rms and peak", () => {
    const rms = new Float32Array([0.3, 0.5, 0.2]);
    const peak = new Float32Array([0.4, 0.6, 0.1]);
    expect(polarDisplayNorm(rms, peak)).toBeCloseTo(1 / 0.6, 5);
  });

  test("interpolatePolarRmsAtAngle at bin centers", () => {
    const bins = new Float32Array(4);
    bins[0] = 0.2;
    bins[1] = 0.6;
    bins[2] = 0.8;
    bins[3] = 0.4;
    const thetaMid = polarBinToAngleRad(1, 4);
    expect(interpolatePolarRmsAtAngle(bins, thetaMid)).toBeCloseTo(0.6, 5);
    expect(interpolatePolarRmsAtAngle(bins, Math.PI / 2)).toBeGreaterThan(0);
    expect(interpolatePolarRmsAtAngle(bins, (3 * Math.PI) / 4)).toBeGreaterThan(
      0,
    );
  });

  test("interpolatePolarRmsAtAngle linear between adjacent bins", () => {
    const bins = new Float32Array([0, 1, 0]);
    const t0 = polarBinToAngleRad(0, 3);
    const t1 = polarBinToAngleRad(1, 3);
    const mid = (t0 + t1) / 2;
    const v = interpolatePolarRmsAtAngle(bins, mid);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  test("scatterFadeOverlayAlpha complements scatter decay", () => {
    const release = 8;
    const decay = scatterAlphaDecayFromReleaseDbPerSec(release);
    const fade = scatterFadeOverlayAlphaFromReleaseDbPerSec(release);
    expect(decay + fade).toBeCloseTo(1, 10);
  });
});
