import { SpectralDescriptorAnalyzer } from "./spectralDescriptors";

test("DC offsets do not hide a quiet AC tone or create false spectral energy", () => {
  const n = 2048;
  const tone = Float32Array.from(
    { length: n },
    (_, i) => 0.01 * Math.sin((2 * Math.PI * 3000 * i) / 48000),
  );
  const analyzer = new SpectralDescriptorAnalyzer();
  const expected = analyzer.compute(tone, tone, 48000)!;
  const left = Float32Array.from(tone, (value) => value + 0.5);
  const right = Float32Array.from(tone, (value) => -value - 0.25);
  const actual = analyzer.compute(left, right, 48000)!;
  expect(actual.centroidHz).toBeCloseTo(expected.centroidHz, 2);
  expect(actual.spreadHz).toBeCloseTo(expected.spreadHz, 2);
  expect(actual.rolloffHz).toBe(expected.rolloffHz);
  expect(
    analyzer.compute(
      new Float32Array(n).fill(0.5),
      new Float32Array(n).fill(-0.25),
      48000,
    ),
  ).toBeNull();
});

test("finite-frame DC removal preserves an off-bin low tone with an offset", () => {
  const tone = Float32Array.from(
    { length: 3001 },
    (_, i) => 0.2 * Math.sin((2 * Math.PI * 137 * i) / 48000),
  );
  const analyzer = new SpectralDescriptorAnalyzer();
  const expected = analyzer.compute(tone, tone, 48000)!;
  const offset = Float32Array.from(tone, (value) => value + 0.5);
  const actual = analyzer.compute(offset, offset, 48000)!;
  expect(expected.centroidHz).toBeGreaterThan(120);
  expect(expected.centroidHz).toBeLessThan(150);
  expect(actual.centroidHz).toBeCloseTo(expected.centroidHz, 2);
  expect(actual.spreadHz).toBeCloseTo(expected.spreadHz, 2);
  expect(actual.rolloffHz).toBe(expected.rolloffHz);
});
