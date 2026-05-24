import {
  computeRhoPerBin,
  normalizedCrossSpectrumReal,
  FrequencyPhaseCorrelationEngine,
} from "./frequencyPhaseCorrelation";

describe("normalizedCrossSpectrumReal", () => {
  test("in-phase complex bins yield +1", () => {
    expect(normalizedCrossSpectrumReal(1, 0, 1, 0)).toBeCloseTo(1, 5);
    expect(normalizedCrossSpectrumReal(0, 1, 0, 1)).toBeCloseTo(1, 5);
  });

  test("anti-phase complex bins yield -1", () => {
    expect(normalizedCrossSpectrumReal(1, 0, -1, 0)).toBeCloseTo(-1, 5);
  });

  test("orthogonal phases yield 0", () => {
    expect(normalizedCrossSpectrumReal(1, 0, 0, 1)).toBeCloseTo(0, 5);
  });

  test("near-zero magnitude yields 0", () => {
    expect(normalizedCrossSpectrumReal(1e-15, 0, 1, 0)).toBe(0);
  });
});

describe("computeRhoPerBin", () => {
  const sampleRate = 48000;
  const fftSize = 2048;
  const engine = new FrequencyPhaseCorrelationEngine();

  function sineFrame(
    freqHz: number,
    phaseRad: number,
    amplitude = 0.5,
  ): { mixL: Float32Array; mixR: Float32Array } {
    const mixL = new Float32Array(fftSize);
    const mixR = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const t = i / sampleRate;
      mixL[i] = amplitude * Math.sin(2 * Math.PI * freqHz * t);
      mixR[i] = amplitude * Math.sin(2 * Math.PI * freqHz * t + phaseRad);
    }
    return { mixL, mixR };
  }

  test("same-phase sine yields high rho near tone frequency", () => {
    const freq = 1000;
    const { mixL, mixR } = sineFrame(freq, 0);
    const { srcXs, srcYs, broadbandRho } = computeRhoPerBin(
      mixL,
      mixR,
      sampleRate,
      engine,
    );
    expect(srcXs.length).toBeGreaterThan(0);
    let bestRho = -2;
    for (let i = 0; i < srcXs.length; i++) {
      if (Math.abs(srcXs[i] - freq) < 120) {
        bestRho = Math.max(bestRho, srcYs[i]);
      }
    }
    expect(bestRho).toBeGreaterThan(0.85);
    expect(broadbandRho).toBeGreaterThan(0.5);
  });

  test("180° out-of-phase sine yields negative rho near tone frequency", () => {
    const freq = 1000;
    const { mixL, mixR } = sineFrame(freq, Math.PI);
    const { srcXs, srcYs } = computeRhoPerBin(
      mixL,
      mixR,
      sampleRate,
      engine,
    );
    let worstRho = 2;
    for (let i = 0; i < srcXs.length; i++) {
      if (Math.abs(srcXs[i] - freq) < 120) {
        worstRho = Math.min(worstRho, srcYs[i]);
      }
    }
    expect(worstRho).toBeLessThan(-0.85);
  });
});
