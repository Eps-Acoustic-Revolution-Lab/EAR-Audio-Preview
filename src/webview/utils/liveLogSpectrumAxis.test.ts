import {
  logPoints,
  freqMin,
  freqMax,
  logFreqs,
  freqToCanvasX,
  hzFromCanvasX,
  logIndexFromHz,
  lerpF32,
  formatFreqTickLabel,
  fftSpectrumFreqTicksForSr,
  cqtSpectrumFreqTicksForSr,
  freqToCanvasXParam,
  hzFromCanvasXParam,
} from "./liveLogSpectrumAxis";

/**
 * Behavior anchors for the shared log-frequency axis: tick conventions
 * (1-2-5 decade / ISO 266 octave + Nyquist), bijective canvas mapping and
 * index clamping. These lock the visual frequency contract of the analyzer.
 */

describe("axis constants", () => {
  test("axis spans 20 Hz – 20 kHz over 300 log points", () => {
    expect(freqMin).toBe(20);
    expect(freqMax).toBe(20000);
    expect(logPoints).toBe(300);
    expect(logFreqs.length).toBe(logPoints);
    expect(logFreqs[0]).toBeCloseTo(freqMin, 6);
    expect(logFreqs[logPoints - 1]).toBeCloseTo(freqMax, 4);
  });
});

describe("fftSpectrumFreqTicksForSr", () => {
  test("48 kHz: 1-2-5 decade ticks bounded to Nyquist, sr/2 appended", () => {
    const ticks = fftSpectrumFreqTicksForSr(48000);
    expect(ticks[0]).toBe(10);
    expect(ticks).toContain(20000);
    expect(ticks[ticks.length - 1]).toBe(24000);
  });

  test("32 kHz: no duplicate when Nyquist already is a base tick", () => {
    const ticks = fftSpectrumFreqTicksForSr(32000);
    expect(ticks[ticks.length - 1]).toBe(16000);
    expect(ticks.filter((t) => t === 16000).length).toBe(1);
  });
});

describe("cqtSpectrumFreqTicksForSr", () => {
  test("48 kHz: ISO 266 octave centers from lfRes, Nyquist appended", () => {
    const ticks = cqtSpectrumFreqTicksForSr(48000, 8);
    expect(ticks[0]).toBe(8);
    expect(ticks).toContain(1000);
    expect(ticks[ticks.length - 1]).toBe(24000);
  });

  test("lfResHz filters lower octave centers", () => {
    const ticks = cqtSpectrumFreqTicksForSr(48000, 31);
    expect(ticks[0]).toBe(31);
    expect(ticks).not.toContain(16);
  });
});

describe("freqToCanvasX / hzFromCanvasX", () => {
  const padL = 40;
  const drawW = 800;

  test("mappings are mutual inverses across the audible band", () => {
    for (const hz of [20, 100, 1000, 8000, 20000]) {
      const x = freqToCanvasX(hz, padL, drawW);
      expect(hzFromCanvasX(x, padL, drawW)).toBeCloseTo(hz, 4);
    }
  });

  test("endpoints land on plot edges", () => {
    expect(freqToCanvasX(freqMin, padL, drawW)).toBeCloseTo(padL, 6);
    expect(freqToCanvasX(freqMax, padL, drawW)).toBeCloseTo(padL + drawW, 6);
  });

  test("hzFromCanvasX clamps outside the plot area", () => {
    expect(hzFromCanvasX(padL - 100, padL, drawW)).toBeCloseTo(freqMin, 6);
    expect(hzFromCanvasX(padL + drawW + 100, padL, drawW)).toBeCloseTo(
      freqMax,
      4,
    );
  });

  test("parameterized variants agree with the default-axis versions", () => {
    const x = freqToCanvasXParam(1000, padL, drawW, freqMin, freqMax);
    expect(x).toBeCloseTo(freqToCanvasX(1000, padL, drawW), 9);
    expect(hzFromCanvasXParam(x, padL, drawW, freqMin, freqMax)).toBeCloseTo(
      1000,
      6,
    );
  });
});

describe("logIndexFromHz", () => {
  test("axis endpoints map to first/last indices; below-min clamps to 0", () => {
    expect(logIndexFromHz(freqMin)).toBeCloseTo(0, 9);
    expect(logIndexFromHz(freqMax)).toBeCloseTo(logPoints - 1, 6);
    expect(logIndexFromHz(1)).toBeCloseTo(0, 9);
  });
});

describe("lerpF32", () => {
  test("interpolates between neighbours and clamps the base index", () => {
    const arr = new Float32Array([0, 10, 20]);
    expect(lerpF32(arr, 0.5)).toBeCloseTo(5, 6);
    expect(lerpF32(arr, 5)).toBeCloseTo(20 + 3 * 10, 6); // extrapolates from last pair
    expect(lerpF32(new Float32Array([7]), 3)).toBe(7);
    expect(lerpF32(new Float32Array(0), 3, -1)).toBe(-1);
  });
});

describe("formatFreqTickLabel", () => {
  test("kHz labels collapse to Nk, sub-kHz keep plain numbers", () => {
    expect(formatFreqTickLabel(20000)).toBe("20k");
    expect(formatFreqTickLabel(1000)).toBe("1k");
    expect(formatFreqTickLabel(500)).toBe("500");
    expect(formatFreqTickLabel(31)).toBe("31");
  });
});
