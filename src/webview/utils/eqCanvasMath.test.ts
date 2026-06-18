import {
  computeListenMatchDb,
  DEFAULT_DISPLAY_RANGE,
  freqToPlotX,
  gainToPlotY,
  getBandFrequencyResponseDb,
  plotXToFreq,
  plotYToGain,
} from "./eqCanvasMath";

describe("eqCanvasMath", () => {
  const minHz = 20;
  const maxHz = 20000;
  const plotW = 400;
  const plotH = 160;

  test("log frequency mapping round-trips", () => {
    const x = freqToPlotX(1000, plotW, minHz, maxHz);
    const back = plotXToFreq(x, plotW, minHz, maxHz);
    expect(back).toBeCloseTo(1000, 0);
  });

  test("asymmetric gain axis places 0 dB at one-third from top", () => {
    const y0 = gainToPlotY(0, plotH, DEFAULT_DISPLAY_RANGE);
    expect(y0).toBeCloseTo(plotH / 3, 1);
    expect(plotYToGain(y0, plotH, DEFAULT_DISPLAY_RANGE)).toBeCloseTo(0, 3);
  });

  test("peaking filter peaks near center frequency", () => {
    const band = {
      enabled: true,
      type: "peaking" as const,
      frequency: 1000,
      gainDb: 6,
      q: 1.2,
    };
    const atFc = getBandFrequencyResponseDb(1000, band);
    const off = getBandFrequencyResponseDb(100, band);
    expect(atFc).toBeGreaterThan(off + 3);
  });

  test("computeListenMatchDb is zero for flat unity chain", () => {
    expect(computeListenMatchDb(0, [])).toBeCloseTo(0, 1);
  });

  test("computeListenMatchDb compensates preamp attenuation", () => {
    const match = computeListenMatchDb(-6, []);
    expect(match).toBeCloseTo(6, 0);
  });

  test("computeListenMatchDb clamps extreme values", () => {
    const match = computeListenMatchDb(-24, []);
    expect(match).toBe(12);
  });
});
