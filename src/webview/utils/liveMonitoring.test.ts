import {
  encodeMidSideTimeDomain,
  spectrumTiltDb,
  spectrumTiltDbAboveFloor,
  sanitizeMonitorBandEdges,
  monitorBandSoloBypassActive,
  monitoringGainsForMode,
  applyMonitoringToTimeDomain,
} from "./liveMonitoring";

describe("spectrumTiltDb", () => {
  test("adds +slope dB per octave above reference (one octave up doubles frequency)", () => {
    expect(spectrumTiltDb(1000, 3)).toBeCloseTo(0, 5);
    expect(spectrumTiltDb(2000, 3)).toBeCloseTo(3, 5);
    expect(spectrumTiltDb(500, 3)).toBeCloseTo(-3, 5);
  });
});

describe("encodeMidSideTimeDomain", () => {
  test("M/S diagonal on stereo impulse", () => {
    const left = new Float32Array([1, 0, 1]);
    const right = new Float32Array([1, 0, -1]);
    const mid = new Float32Array(3);
    const side = new Float32Array(3);
    encodeMidSideTimeDomain(left, right, mid, side);
    expect(mid[0]).toBeCloseTo(1);
    expect(side[0]).toBeCloseTo(0);
    expect(mid[2]).toBeCloseTo(0);
    expect(side[2]).toBeCloseTo(1);
  });
});

describe("spectrumTiltDbAboveFloor", () => {
  test("adds no tilt when level is at the floor (flat silence)", () => {
    expect(spectrumTiltDbAboveFloor(20000, 4.5, -90, -90, 18)).toBeCloseTo(0, 5);
    expect(spectrumTiltDbAboveFloor(40, 4.5, -90, -90, 18)).toBeCloseTo(0, 5);
  });

  test("reaches full tilt when level is blendDb above floor", () => {
    const raw = -90 + 18;
    expect(spectrumTiltDbAboveFloor(2000, 3, raw, -90, 18)).toBeCloseTo(
      spectrumTiltDb(2000, 3),
      5,
    );
  });
});

describe("sanitizeMonitorBandEdges", () => {
  test("fixes order and clamps toward Nyquist", () => {
    const e = sanitizeMonitorBandEdges([900, 120, 20, 50, 30, 100000], 44100);
    for (let i = 1; i < e.length; i++) {
      expect(e[i]).toBeGreaterThan(e[i - 1]);
    }
    expect(e[e.length - 1]).toBeLessThanOrEqual(44100 / 2 + 50);
  });
});

describe("monitorBandSoloBypassActive", () => {
  test("full bandwidth when zero or all five bits lit", () => {
    expect(monitorBandSoloBypassActive(0)).toBe(true);
    expect(monitorBandSoloBypassActive(0b11111)).toBe(true);
    expect(monitorBandSoloBypassActive(3)).toBe(false);
  });
});

describe("monitoringGainsForMode", () => {
  test('"swap" maps stereo taps to opposite outputs', () => {
    const g = monitoringGainsForMode("swap");
    expect(g.ll).toBeCloseTo(0);
    expect(g.rr).toBeCloseTo(0);
    expect(g.lr).toBeCloseTo(1);
    expect(g.rl).toBeCloseTo(1);
  });

  test("known modes are stable", () => {
    const modes = ["lr", "swap", "l", "r", "m", "s"] as const;
    for (const m of modes) {
      expect(monitoringGainsForMode(m)).toBeDefined();
    }
  });
});

describe("applyMonitoringToTimeDomain", () => {
  test('"swap" mode swaps L/R taps like the headphone matrix', () => {
    const left = new Float32Array([1, -0.25]);
    const right = new Float32Array([-1, 4]);
    const oL = new Float32Array(2);
    const oR = new Float32Array(2);
    applyMonitoringToTimeDomain("swap", left, right, oL, oR);
    expect(oL[0]).toBeCloseTo(-1);
    expect(oR[0]).toBeCloseTo(1);
    expect(oL[1]).toBeCloseTo(4);
    expect(oR[1]).toBeCloseTo(-0.25);
  });
});
