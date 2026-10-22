import {
  describeSpectrum,
  SpectralDescriptorAnalyzer,
} from "./spectralDescriptors";

describe("spectral descriptors", () => {
  it("computes exact power moments and cumulative rolloff, excluding DC", () => {
    expect(describeSpectrum(new Float64Array([999, 1, 0, 3]), 100)).toEqual({
      centroidHz: 250,
      spreadHz: Math.sqrt(7500),
      rolloffHz: 300,
    });
  });
  it("rejects silence, invalid bins and invalid frequency scale", () => {
    expect(describeSpectrum(new Float64Array([3, NaN, -2]), 100)).toBeNull();
    expect(describeSpectrum(new Float64Array([0, 1]), Infinity)).toBeNull();
  });
  it.each([44100, 48000, 96000])(
    "measures a tone at native sample rate %i without stereo cancellation",
    (sr) => {
      const n = 4096,
        frequency = (64 * sr) / n;
      const left = Float32Array.from({ length: n }, (_, i) =>
        Math.sin((2 * Math.PI * frequency * i) / sr),
      );
      const right = Float32Array.from(left, (v) => -v);
      const analyzer = new SpectralDescriptorAnalyzer();
      const result = analyzer.compute(left, right, sr)!;
      expect(result.centroidHz).toBeCloseTo(frequency, 1);
      expect(result.rolloffHz).toBeGreaterThanOrEqual(frequency);
      expect(result.rolloffHz).toBeLessThan(frequency + (2 * sr) / n);
      expect(
        analyzer.compute(new Float32Array(n), new Float32Array(n), sr),
      ).toBeNull();
    },
  );
  it("pads non-power-of-two comparison frames and responds to changed content", () => {
    const analyzer = new SpectralDescriptorAnalyzer();
    const tone = (f: number) =>
      Float32Array.from({ length: 3001 }, (_, i) =>
        Math.sin((2 * Math.PI * f * i) / 48000),
      );
    expect(
      analyzer.compute(tone(1000), tone(1000), 48000)!.centroidHz,
    ).toBeCloseTo(1000, 0);
    expect(
      analyzer.compute(tone(3000), tone(3000), 48000)!.centroidHz,
    ).toBeCloseTo(3000, 0);
  });
});
