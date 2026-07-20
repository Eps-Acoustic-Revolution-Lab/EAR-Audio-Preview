import {
  quinticBSplineSmooth,
  quinticBSplineSmoothInto,
} from "./quinticBSpline";

describe("quinticBSplineSmooth", () => {
  test("returns empty array for empty input", () => {
    expect(quinticBSplineSmooth([]).length).toBe(0);
  });

  test("output has same length as input", () => {
    const data = Array.from({ length: 50 }, (_, i) => Math.sin(i * 0.2));
    const out = quinticBSplineSmooth(data);
    expect(out.length).toBe(50);
  });

  test("constant signal is preserved", () => {
    const data = new Float32Array(20).fill(3.14);
    const out = quinticBSplineSmooth(data);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeCloseTo(3.14, 4);
    }
  });

  test("output is smoother than input (reduces high-frequency noise)", () => {
    // Alternating +1/-1 is the highest-frequency signal possible;
    // the B-spline should strongly attenuate it.
    const data = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const out = quinticBSplineSmooth(data);
    const rmsIn = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
    const rmsOut = Math.sqrt(
      Array.from(out).reduce((s, v) => s + v * v, 0) / out.length,
    );
    // Smoothed RMS should be substantially lower than input RMS.
    expect(rmsOut).toBeLessThan(rmsIn * 0.5);
  });
});

describe("quinticBSplineSmoothInto", () => {
  test("matches the allocating variant element-for-element", () => {
    const data = Array.from({ length: 33 }, (_, i) => Math.sin(i * 0.37) * 5);
    const out = new Float32Array(data.length);
    quinticBSplineSmoothInto(data, out);
    expect(Array.from(out)).toEqual(Array.from(quinticBSplineSmooth(data)));
  });
});
