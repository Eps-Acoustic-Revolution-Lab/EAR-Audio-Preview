import {
  dynamicLinearRange,
  dynamicLogHzRange,
  logHzTicks,
  percentile,
} from "./timelineStripChart";

describe("timelineStripChart", () => {
  test("percentile interpolates between sorted values", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBeCloseTo(3, 5);
  });

  test("logHzTicks covers decade multiples", () => {
    const ticks = logHzTicks(100, 1000);
    expect(ticks).toContain(100);
    expect(ticks).toContain(200);
    expect(ticks).toContain(500);
    expect(ticks).toContain(1000);
  });

  test("dynamicLogHzRange uses voiced samples in window", () => {
    const times = new Float32Array([0, 1, 2, 3]);
    const values = new Float32Array([NaN, 200, 400, NaN]);
    const range = dynamicLogHzRange(times, values, 0, 3);
    expect(range.minHz).toBeGreaterThanOrEqual(80);
    expect(range.maxHz).toBeLessThanOrEqual(4000);
    expect(range.ticks.length).toBeGreaterThan(0);
  });

  test("dynamicLinearRange scales to visible flux peak", () => {
    const times = new Float32Array([0, 1, 2]);
    const values = new Float32Array([0, 0.2, 1.0]);
    const range = dynamicLinearRange(times, values, 0, 2);
    expect(range.min).toBe(0);
    expect(range.max).toBeGreaterThan(0.9);
  });
});
