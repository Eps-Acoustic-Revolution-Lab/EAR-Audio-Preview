import { buildModifiedAkima, akimaResample } from "./modifiedAkima";

describe("buildModifiedAkima", () => {
  test("throws with fewer than 2 points", () => {
    expect(() => buildModifiedAkima([1], [1])).toThrow();
  });

  test("exact interpolation at knot positions", () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [0, 2, 1, 3, 2];
    const interp = buildModifiedAkima(xs, ys);
    for (let i = 0; i < xs.length; i++) {
      expect(interp.evaluate(xs[i])).toBeCloseTo(ys[i], 8);
    }
  });

  test("clamps below lower bound", () => {
    const interp = buildModifiedAkima([0, 1, 2], [10, 20, 30]);
    expect(interp.evaluate(-5)).toBe(10);
  });

  test("clamps above upper bound", () => {
    const interp = buildModifiedAkima([0, 1, 2], [10, 20, 30]);
    expect(interp.evaluate(99)).toBe(30);
  });

  test("interpolates linearly between two points", () => {
    const interp = buildModifiedAkima([0, 1], [0, 1]);
    expect(interp.evaluate(0.5)).toBeCloseTo(0.5, 5);
  });

  test("interpolates a linear ramp exactly", () => {
    const xs = [0, 1, 2, 3, 4, 5];
    const ys = xs.map((x) => 2 * x + 1);
    const interp = buildModifiedAkima(xs, ys);
    for (let x = 0; x <= 5; x += 0.25) {
      expect(interp.evaluate(x)).toBeCloseTo(2 * x + 1, 5);
    }
  });
});

describe("akimaResample", () => {
  test("resamples from coarse to fine grid", () => {
    const srcXs = [0, 1, 2, 3, 4];
    const srcYs = [0, 1, 0, -1, 0];
    const dstXs = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
    const out = akimaResample(srcXs, srcYs, dstXs);
    // Verify knots are reproduced exactly
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(1, 5);
    expect(out[4]).toBeCloseTo(0, 5);
    expect(out[6]).toBeCloseTo(-1, 5);
    expect(out[8]).toBeCloseTo(0, 5);
  });

  test("output length matches dstXs length", () => {
    const out = akimaResample([0, 1, 2], [3, 1, 2], [0, 0.1, 0.2, 1.5, 2]);
    expect(out.length).toBe(5);
  });
});
