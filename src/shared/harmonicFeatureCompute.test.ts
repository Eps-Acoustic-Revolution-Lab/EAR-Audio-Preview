import {
  computeHarmonicFeatures,
  harmonicFromWire,
  harmonicToWire,
  harmonicUnavailableReason,
} from "./harmonicFeatureCompute";
import type { EssentiaInstance } from "./essentiaTypes";

test("wire conversion copies exact typed array windows including unvoiced gaps", () => {
  const base = new Float32Array([99, 440, NaN, 99]);
  const profile = {
    chroma: new Float32Array(12),
    chromaTimeSec: new Float32Array([0]),
    melodyHz: base.subarray(1, 3),
    melodyConfidence: new Float32Array([1, 0]),
    melodyHopSec: 128 / 44100,
  };
  const restored = harmonicFromWire(harmonicToWire(profile));
  base[1] = 220;
  expect(restored.melodyHz).toEqual(new Float32Array([440, NaN]));
  expect(restored.melodyHopSec).toBe(128 / 44100);
});

test("unsupported rates and oversized clips are rejected before entering WASM", async () => {
  const instance = {} as EssentiaInstance;
  expect(harmonicUnavailableReason(301, 44100)).toMatch(/5 minutes/);
  await expect(
    computeHarmonicFeatures(instance, new Float32Array(1), 96000),
  ).rejects.toThrow(/kHz/);
  await expect(
    computeHarmonicFeatures(instance, new Float32Array(4410).fill(NaN), 44100),
  ).rejects.toThrow(/finite/);
  await expect(
    computeHarmonicFeatures(
      instance,
      new Float32Array(4410).fill(1),
      44100,
      () => true,
    ),
  ).rejects.toThrow(/cancelled/);
});

test("frees WASM vectors when a downstream algorithm fails", async () => {
  const releaseInput = jest.fn();
  const releaseWindow = jest.fn();
  const instance = {
    arrayToVector: () => ({ delete: releaseInput }),
    Windowing: () => ({ frame: { delete: releaseWindow } }),
    Spectrum: () => {
      throw new Error("native failure");
    },
  } as unknown as EssentiaInstance;
  await expect(
    computeHarmonicFeatures(instance, new Float32Array(4410).fill(1), 44100),
  ).rejects.toThrow("native failure");
  expect(releaseInput).toHaveBeenCalledTimes(1);
  expect(releaseWindow).toHaveBeenCalledTimes(1);
});
