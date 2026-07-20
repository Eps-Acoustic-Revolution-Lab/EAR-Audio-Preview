import {
  computeEssentiaStftSpectrogram,
  stftWireToSpectrogram,
  sliceStftFrequencyBand,
  essentiaWindowNames,
  StftSettingsWire,
} from "./stftEssentiaCompute";
import type { EssentiaInstance } from "./essentiaTypes";

/**
 * Behavior anchors for the Essentia STFT pipeline: frame/bin layout,
 * dB normalization against the max frame power, and frequency-band slicing.
 */

function makeEssentia(spectra: Float32Array[]): EssentiaInstance {
  let call = 0;
  return {
    arrayToVector: (arr: Float32Array) => arr,
    vectorToArray: (vec: unknown) => vec as Float32Array,
    Windowing: (frame: unknown) => ({ frame }),
    Spectrum: () => ({ spectrum: spectra[call++ % spectra.length] }),
    PitchYinFFT: () => ({ pitch: 0, pitchConfidence: 0 }),
    Flux: () => ({ flux: 0 }),
    delete: () => undefined,
    shutdown: () => undefined,
  };
}

describe("computeEssentiaStftSpectrogram", () => {
  const settings: StftSettingsWire = {
    windowSize: 8,
    windowType: "hann",
    hopSize: 4,
    minTime: 0,
    maxTime: 1,
    minFrequency: 0,
    maxFrequency: 4,
  };
  const sampleRate = 8;

  test("layout: dbValues holds frameCount * binCount floats (binCount = windowSize/2)", async () => {
    const spec = new Float32Array(5).fill(1);
    const wire = await computeEssentiaStftSpectrogram(
      makeEssentia([spec]),
      new Float32Array(8),
      sampleRate,
      settings,
    );
    // centers 0 and 4 → 2 frames; binCount = 8/2 = 4
    expect(wire.frameCount).toBe(2);
    expect(wire.binCount).toBe(4);
    expect(wire.dbValues.byteLength).toBe(2 * 4 * 4);
  });

  test("dB values are 10*log10(power / maxFramePower), 0 dB at the global max", async () => {
    // frame 0: magnitude 1 → power 1; frame 1: magnitude 2 at bin 0 → power 4 (max)
    const spec0 = new Float32Array([1, 1, 1, 1, 1]);
    const spec1 = new Float32Array([2, 0, 0, 0, 0]);
    const wire = await computeEssentiaStftSpectrogram(
      makeEssentia([spec0, spec1]),
      new Float32Array(8),
      sampleRate,
      settings,
    );
    const db = new Float32Array(wire.dbValues);
    expect(db[0]).toBeCloseTo(10 * Math.log10(1 / 4), 4); // ≈ −6.02 dB
    expect(db[4]).toBeCloseTo(0, 6); // frame 1, bin 0 is the max
    expect(db[5]).toBe(-Infinity); // zero power → −Inf dB by convention
  });

  test("stftWireToSpectrogram restores row-major frame rows", async () => {
    const spec0 = new Float32Array([1, 1, 1, 1, 1]);
    const spec1 = new Float32Array([2, 0, 0, 0, 0]);
    const wire = await computeEssentiaStftSpectrogram(
      makeEssentia([spec0, spec1]),
      new Float32Array(8),
      sampleRate,
      settings,
    );
    const rows = stftWireToSpectrogram(wire);
    expect(rows.length).toBe(2);
    expect(rows[0].length).toBe(4);
    expect(rows[1][0]).toBeCloseTo(0, 6);
  });
});

describe("sliceStftFrequencyBand", () => {
  test("bin indices follow df = sampleRate/windowSize with floor()", () => {
    const sampleRate = 48000;
    const windowSize = 4096;
    const df = sampleRate / windowSize; // 11.71875
    const binCount = windowSize / 2;
    const row = Array.from({ length: binCount }, (_, i) => i);
    const sliced = sliceStftFrequencyBand(
      [row],
      sampleRate,
      windowSize,
      100,
      20000,
    );
    const minIdx = Math.floor(100 / df); // 8
    const maxIdx = Math.floor(20000 / df); // 1706
    expect(sliced[0][0]).toBe(minIdx);
    expect(sliced[0].length).toBe(maxIdx - minIdx);
  });

  test("maxFrequency at/above Nyquist clamps to windowSize/2", () => {
    const row = Array.from({ length: 16 }, (_, i) => i);
    const sliced = sliceStftFrequencyBand([row], 32, 32, 0, 100000);
    expect(sliced[0].length).toBe(16);
    expect(sliced[0][0]).toBe(0);
  });
});

describe("essentiaWindowNames", () => {
  test("WindowType enum order is locked", () => {
    expect(essentiaWindowNames).toEqual([
      "hann",
      "hamming",
      "blackmanharris62",
      "triangular",
    ]);
  });
});
