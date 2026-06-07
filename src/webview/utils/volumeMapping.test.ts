import {
  GAIN_AT_MAX,
  GAIN_AT_UNITY,
  gainToKnobPercent,
  initialKnobPercentFromSettings,
  KNOB_VOLUME_MAX,
  KNOB_VOLUME_UNITY,
  knobPercentToGain,
} from "./volumeMapping";

describe("volumeMapping", () => {
  test("knob 100 is unity gain (file直出)", () => {
    expect(knobPercentToGain(KNOB_VOLUME_UNITY)).toBe(GAIN_AT_UNITY);
  });

  test("knob 120 is 120% of unity", () => {
    expect(knobPercentToGain(KNOB_VOLUME_MAX)).toBeCloseTo(GAIN_AT_MAX, 5);
  });

  test("knob 0 is silence", () => {
    expect(knobPercentToGain(0)).toBe(0);
  });

  test("gainToKnobPercent inverts unity and max", () => {
    expect(gainToKnobPercent(GAIN_AT_UNITY)).toBe(100);
    expect(gainToKnobPercent(GAIN_AT_MAX)).toBe(120);
  });

  test("initialKnobPercentFromSettings unity linear maps to 100", () => {
    expect(initialKnobPercentFromSettings(false, 100, 0)).toBe(100);
  });

  test("initialKnobPercentFromSettings linear 50 maps to 50", () => {
    expect(initialKnobPercentFromSettings(false, 50, 0)).toBe(50);
  });
});
