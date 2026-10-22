/** @jest-environment node */
import { Essentia, EssentiaWASM } from "essentia.js";
import { computeHarmonicFeatures } from "./harmonicFeatureCompute";

test.each([8000, 32000, 44100, 48000])(
  "real Essentia chroma A4 and predominant 440 Hz at %i Hz",
  async (sampleRate) => {
    const essentia = new Essentia(EssentiaWASM);
    try {
      const samples = Float32Array.from(
        { length: sampleRate },
        (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate),
      );
      const profile = await computeHarmonicFeatures(
        essentia,
        samples,
        sampleRate,
      );
      const middle = profile.chroma.slice(10 * 12, 11 * 12);
      expect(middle.indexOf(Math.max(...middle))).toBe(9);
      expect(middle[9]).toBeCloseTo(1, 2);
      const voiced = Array.from(profile.melodyHz).filter(Number.isFinite);
      expect(voiced.length).toBeGreaterThan(sampleRate / 128 / 2);
      expect(voiced[Math.floor(voiced.length / 2)]).toBeCloseTo(440, -1);
      expect(profile.melodyHopSec).toBe(128 / sampleRate);
      expect(profile.chromaTimeSec[0]).toBe(0);
    } finally {
      essentia.shutdown();
      essentia.delete();
    }
  },
);

test("real Essentia silence has no chroma energy and no voiced melody", async () => {
  const essentia = new Essentia(EssentiaWASM);
  try {
    const profile = await computeHarmonicFeatures(
      essentia,
      new Float32Array(44100),
      44100,
    );
    expect(Array.from(profile.chroma).every((v) => v === 0)).toBe(true);
    expect(Array.from(profile.melodyHz).every((v) => Number.isNaN(v))).toBe(
      true,
    );
  } finally {
    essentia.shutdown();
    essentia.delete();
  }
});

test("real dependency tiny nonzero input is rejected before native Empty vector input failure", async () => {
  const essentia = new Essentia(EssentiaWASM);
  try {
    await expect(
      computeHarmonicFeatures(essentia, Float32Array.of(0.5), 8000),
    ).rejects.toThrow(/0.1 seconds/);
  } finally {
    essentia.shutdown();
    essentia.delete();
  }
});
