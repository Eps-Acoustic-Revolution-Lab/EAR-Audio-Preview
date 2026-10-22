import {
  FrequencyWeightedRms,
  frequencyWeightingGain,
  RmsWeighting,
} from "./frequencyWeightedRms";

const db = (gain: number) => 20 * Math.log10(gain);
const tone = (n: number, sr: number, hz: number, amplitude = 1) =>
  Float32Array.from(
    { length: n },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / sr),
  );

describe("frequency-weighted RMS", () => {
  test.each(["A", "B", "C"] as RmsWeighting[])(
    "%s reference calibration and DC rejection",
    (weighting) => {
      expect(frequencyWeightingGain(1000, weighting)).toBe(1);
      expect(frequencyWeightingGain(0, weighting)).toBe(0);
    },
  );
  test.each([
    [100, "A", -19.1],
    [100, "B", -5.6],
    [100, "C", -0.3],
    [10000, "A", -2.5],
    [10000, "B", -4.3],
    [10000, "C", -4.4],
  ] as [number, RmsWeighting, number][])(
    "reference response %d Hz %s",
    (hz, weighting, expected) => {
      expect(
        Math.abs(db(frequencyWeightingGain(hz, weighting)) - expected),
      ).toBeLessThan(0.1);
    },
  );
  test.each([32000, 44100, 48000, 96000])(
    "tone power at %d Hz sample rate",
    (sr) => {
      const engine = new FrequencyWeightedRms();
      for (const weighting of ["A", "B", "C"] as RmsWeighting[]) {
        for (const hz of [100, 1000, 10000]) {
          const measured = engine.compute(
            tone(32768, sr, hz, 0.5),
            sr,
            weighting,
          );
          const expected =
            (0.5 / Math.sqrt(2)) * frequencyWeightingGain(hz, weighting);
          expect(Math.abs(db(measured / expected))).toBeLessThan(0.03);
        }
      }
    },
  );
  test("flat RMS preserves DC and Parseval energy; silence is zero", () => {
    const engine = new FrequencyWeightedRms();
    expect(engine.compute(new Float32Array(2048).fill(0.25), 48000, "Z")).toBe(
      0.25,
    );
    expect(engine.compute(tone(2048, 48000, 1500), 48000, "Z")).toBeCloseTo(
      Math.SQRT1_2,
      6,
    );
    for (const w of ["Z", "A", "B", "C"] as RmsWeighting[]) {
      expect(engine.compute(new Float32Array(2048), 48000, w)).toBe(0);
    }
  });
  test("independent channels and repeat overlapping snapshots do not retain signal history", () => {
    const engine = new FrequencyWeightedRms();
    const left = tone(2048, 48000, 1500);
    const first = engine.compute(left, 48000, "A");
    expect(engine.compute(new Float32Array(2048), 48000, "A")).toBe(0);
    expect(engine.compute(left, 48000, "A")).toBe(first);
    expect(
      engine.compute(
        left.map((v) => -v / 2),
        48000,
        "A",
      ),
    ).toBeCloseTo(first / 2, 8);
  });
});

test("constant DC is rejected before windowing for A/B/C", () => {
  const engine = new FrequencyWeightedRms();
  for (const w of ["A", "B", "C"] as RmsWeighting[]) {
    expect(engine.compute(new Float32Array(2048).fill(0.5), 48000, w)).toBe(0);
  }
});

test("live-sized taps stay calibrated and rebuild weights on rate/size changes", () => {
  const engine = new FrequencyWeightedRms();
  for (const sr of [48000, 96000, 44100]) {
    for (const n of [2048, 1024, 2048]) {
      for (const w of ["A", "B", "C"] as RmsWeighting[]) {
        const measured = engine.compute(tone(n, sr, 1000), sr, w);
        expect(Math.abs(db(measured / Math.SQRT1_2))).toBeLessThan(0.04);
      }
    }
  }
});

test("Nyquist power is counted once", () => {
  const engine = new FrequencyWeightedRms();
  const signal = Float32Array.from({ length: 2048 }, (_, i) =>
    i % 2 ? -1 : 1,
  );
  const measured = engine.compute(signal, 48000, "C");
  expect(
    Math.abs(db(measured / frequencyWeightingGain(24000, "C"))),
  ).toBeLessThan(0.02);
});
