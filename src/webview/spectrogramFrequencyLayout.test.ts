import {
  clampFrequencyScaleHybridRatio,
  hybridHzFromNorm,
} from "./spectrogramFrequencyLayout";

describe("hybridHzFromNorm", () => {
  const minF = 20;
  const maxF = 20000;

  it("maps endpoints exactly for any ratio", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      expect(hybridHzFromNorm(0, minF, maxF, r)).toBeCloseTo(minF, 6);
      expect(hybridHzFromNorm(1, minF, maxF, r)).toBeCloseTo(maxF, 3);
    }
  });

  it("ratio 0 is pure linear", () => {
    expect(hybridHzFromNorm(0.5, 0, 1000, 0)).toBeCloseTo(500, 9);
  });

  it("ratio 1 is pure continuous log (geometric midpoint at 0.5)", () => {
    expect(hybridHzFromNorm(0.5, 100, 10000, 1)).toBeCloseTo(1000, 6);
  });

  it("is strictly monotonic for ratio 0.5", () => {
    let prev = Number.NEGATIVE_INFINITY;
    for (let i = 0; i <= 100; i++) {
      const hz = hybridHzFromNorm(i / 100, minF, maxF, 0.5);
      expect(hz).toBeGreaterThan(prev);
      prev = hz;
    }
  });

  it("blends exactly between the linear and log positions", () => {
    const lin = hybridHzFromNorm(0.3, minF, maxF, 0);
    const log = hybridHzFromNorm(0.3, minF, maxF, 1);
    const hyb = hybridHzFromNorm(0.3, minF, maxF, 0.5);
    expect(hyb).toBeCloseTo((lin + log) / 2, 6);
  });

  it("clamps yNorm into [0,1]", () => {
    expect(hybridHzFromNorm(-1, minF, maxF, 0.5)).toBeCloseTo(minF, 6);
    expect(hybridHzFromNorm(2, minF, maxF, 0.5)).toBeCloseTo(maxF, 3);
  });
});

describe("clampFrequencyScaleHybridRatio", () => {
  it("clamps to [0,1] and defaults non-finite to 0.5", () => {
    expect(clampFrequencyScaleHybridRatio(-0.5)).toBe(0);
    expect(clampFrequencyScaleHybridRatio(1.5)).toBe(1);
    expect(clampFrequencyScaleHybridRatio(0.3)).toBe(0.3);
    expect(clampFrequencyScaleHybridRatio(Number.NaN)).toBe(0.5);
  });
});
