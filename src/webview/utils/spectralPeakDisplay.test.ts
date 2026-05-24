import {
  spectralPeakDisplayChaseK,
  smoothPeakDisplayAlongBinsInto,
  smoothPeakDisplayCircularBinsInto,
  stepPolarPeakDisplayLinear,
  stepSpectralPeakDisplay,
} from "./spectralPeakDisplay";

describe("spectralPeakDisplay", () => {
  test("rise snaps display to logical", () => {
    expect(stepSpectralPeakDisplay(-10, -60, 0.1)).toBe(-10);
    expect(stepSpectralPeakDisplay(0, -3, 0.1)).toBe(0);
  });

  test("fall chases logical down at chaseK * peakFall per frame", () => {
    const df = 0.1;
    const k = spectralPeakDisplayChaseK;
    expect(stepSpectralPeakDisplay(-60, -10, df)).toBe(
      Math.max(-60, -10 - df * k),
    );
    const next = stepSpectralPeakDisplay(-60, -10 - df * k, df);
    expect(next).toBeGreaterThan(-60);
    expect(next).toBeLessThan(-10 - df * k);
  });

  test("non-finite logical leaves display unchanged", () => {
    expect(stepSpectralPeakDisplay(Number.NaN, -12, 0.1)).toBe(-12);
  });

  test("non-finite prev falls back to logical", () => {
    expect(stepSpectralPeakDisplay(-5, Number.NaN, 0.1)).toBe(-5);
  });

  test("smoothPeakDisplayAlongBinsInto preserves uniform row", () => {
    const n = 5;
    const src = new Float32Array(n).fill(-20);
    const dst = new Float32Array(n);
    smoothPeakDisplayAlongBinsInto(src, dst, n);
    for (let i = 0; i < n; i++) {
      expect(dst[i]).toBeCloseTo(-20, 6);
    }
  });

  test("smoothPeakDisplayAlongBinsInto softens notch", () => {
    const src = new Float32Array([0, -40, 0]);
    const dst = new Float32Array(3);
    smoothPeakDisplayAlongBinsInto(src, dst, 3);
    expect(dst[1]).toBeGreaterThan(-40);
    expect(dst[1]).toBeLessThan(0);
  });

  test("stepPolarPeakDisplayLinear snaps up to logical amplitude", () => {
    expect(stepPolarPeakDisplayLinear(1, 0.01, 0.2)).toBe(1);
    expect(stepPolarPeakDisplayLinear(0.5, 0.05, 0.2)).toBe(0.5);
  });

  test("stepPolarPeakDisplayLinear chases downward in log domain", () => {
    const df = 0.2;
    const prev = stepPolarPeakDisplayLinear(1e-3, 1, df);
    expect(prev).toBeGreaterThan(1e-3);
    expect(prev).toBeLessThan(1);
    const next = stepPolarPeakDisplayLinear(1e-3, prev, df);
    expect(next).toBeGreaterThan(1e-3);
    expect(next).not.toBe(prev);
    expect(next).toBeLessThanOrEqual(prev);
  });

  test("smoothPeakDisplayCircularBinsInto preserves constant ring", () => {
    const n = 6;
    const src = new Float32Array(n).fill(0.4);
    const dst = new Float32Array(n);
    smoothPeakDisplayCircularBinsInto(src, dst, n);
    for (let i = 0; i < n; i++) {
      expect(dst[i]).toBeCloseTo(0.4, 6);
    }
  });

  test("smoothPeakDisplayCircularBinsInto wraps first and last bins", () => {
    const n = 120;
    const src = new Float32Array(n);
    src[0] = 1;
    const dst = new Float32Array(n);
    smoothPeakDisplayCircularBinsInto(src, dst, n);
    expect(dst[0]).toBeGreaterThan(0);
    expect(dst[0]).toBeLessThan(1);
    expect(dst[n - 1]).toBeGreaterThan(0);
    expect(dst[1]).toBeGreaterThan(0);
  });
});
