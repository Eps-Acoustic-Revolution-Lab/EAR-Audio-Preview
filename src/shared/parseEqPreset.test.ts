/* eslint-disable @typescript-eslint/naming-convention */
import { parseEqPresetFile, sanitizePresetFileName } from "./parseEqPreset";

describe("parseEqPresetFile", () => {
  test("parses AutoEq equalize JSON response", () => {
    const profile = parseEqPresetFile(
      JSON.stringify({
        parametric_eq: {
          preamp: -4,
          filters: [
            { type: "PEAKING", fc: 1000, q: 1.1, gain: 2.5, enabled: true },
          ],
        },
      }),
      "HD650.json",
    );
    expect(profile.filters).toHaveLength(1);
    expect(profile.preampDb).toBe(-4);
    expect(profile.meta.origin).toBe("imported");
    expect(profile.displayName).toBe("HD650");
  });

  test("parses EqualizerAPO txt preset", () => {
    const txt = `Preamp: -6.2 dB
Filter 1: ON PK Fc 100 Hz Gain -2.3 dB Q 1.41
Filter 2: ON LS Fc 105 Hz Gain 3.0 dB Q 0.70`;
    const profile = parseEqPresetFile(txt, "my-eq.txt");
    expect(profile.filters).toHaveLength(2);
    expect(profile.filters[0].type).toBe("peaking");
    expect(profile.filters[1].type).toBe("lowshelf");
    expect(profile.preampDb).toBeCloseTo(-6.2);
  });

  test("sanitizePresetFileName strips unsafe chars", () => {
    expect(sanitizePresetFileName("My Headphone · Harman")).toBe(
      "My-Headphone-Harman.json",
    );
  });
});
