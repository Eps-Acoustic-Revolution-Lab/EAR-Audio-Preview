/** @jest-environment node */
import { Essentia, EssentiaWASM } from "essentia.js";
import { computeHarmonicFeatures } from "./harmonicFeatureCompute";

test.each(["impulse", "quiet tone", "tone then silence"])(
  "real Essentia handles empty spectral peaks in %s without losing analysis",
  async (kind) => {
    const essentia = new Essentia(EssentiaWASM);
    const samples = new Float32Array(48000);
    if (kind === "impulse") {
      samples[24000] = 0.5;
    } else {
      for (let i = 0; i < samples.length; i++) {
        samples[i] =
          (kind === "quiet tone" ? 1e-15 : i < 24000 ? 0.5 : 0) *
          Math.sin((2 * Math.PI * 440 * i) / 48000);
      }
    }
    try {
      const result = await computeHarmonicFeatures(essentia, samples, 48000);
      expect(result.chroma.length).toBe(20 * 12);
      expect(result.chromaTimeSec.length).toBe(20);
      if (kind === "tone then silence") {
        expect(Array.from(result.chroma).some((x) => x > 0)).toBe(true);
        expect(
          Array.from(result.chroma.slice(15 * 12)).every((x) => x === 0),
        ).toBe(true);
      } else {
        expect(Array.from(result.chroma).every((x) => x === 0)).toBe(true);
      }
      expect(result.melodyHz.length).toBe(Math.ceil(samples.length / 128) + 1);
      if (kind === "impulse") {
        expect(Array.from(result.melodyHz).every(Number.isNaN)).toBe(true);
        expect(Array.from(result.melodyConfidence).every((x) => x === 0)).toBe(
          true,
        );
      } else {
        // Very quiet periodic audio still has a native melodic estimate.
        // Do not replace the dependency's result with an unvoiced fallback.
        const voiced = Array.from(result.melodyHz).filter(Number.isFinite);
        expect(voiced.length).toBeGreaterThan(
          kind === "quiet tone" ? 300 : 150,
        );
        expect(voiced[Math.floor(voiced.length / 2)]).toBeCloseTo(440, -1);
      }
      expect(result.melodyHopSec).toBe(128 / 48000);
    } finally {
      essentia.shutdown();
      essentia.delete();
    }
  },
);

test("unrelated Melodia failures still propagate", async () => {
  const essentia = new Essentia(EssentiaWASM);
  const failure = new Error("runtime failure");
  const spy = jest
    .spyOn(essentia, "PredominantPitchMelodia")
    .mockImplementation(() => {
      throw failure;
    });
  try {
    const samples = Float32Array.from({ length: 4800 }, (_, i) =>
      Math.sin((2 * Math.PI * 440 * i) / 48000),
    );
    await expect(
      computeHarmonicFeatures(essentia, samples, 48000),
    ).rejects.toBe(failure);
  } finally {
    spy.mockRestore();
    essentia.shutdown();
    essentia.delete();
  }
});
