import {
  ebur128TruePeakMono,
  isEbur128Available,
  resetEbur128LoaderForTests,
  resolveEbur128Api,
} from "./ebur128Loader";

const mono = jest.fn(() => -1);
const stereo = jest.fn(() => -0.5);

function apiShape() {
  return {
    ["ebur128_true_peak_mono"]: mono,
    ["ebur128_true_peak_stereo"]: stereo,
  };
}

describe("ebur128Loader", () => {
  beforeEach(() => {
    resetEbur128LoaderForTests();
    mono.mockClear();
    stereo.mockClear();
  });

  test("resolves top-level ebur128 exports", () => {
    const api = resolveEbur128Api(apiShape());
    expect(api?.truePeakMono(48000, new Float32Array([1]))).toBe(-1);
    expect(
      api?.truePeakStereo(
        48000,
        new Float32Array([1]),
        new Float32Array([0.5]),
      ),
    ).toBe(-0.5);
  });

  test("resolves default-wrapped ebur128 exports", () => {
    const api = resolveEbur128Api({ default: apiShape() });
    expect(api?.truePeakMono(48000, new Float32Array([1]))).toBe(-1);
  });

  test("returns null for missing true-peak exports", () => {
    expect(resolveEbur128Api({ default: {} })).toBeNull();
  });

  test("true peak helper returns NaN instead of throwing before load", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(ebur128TruePeakMono(48000, new Float32Array([1]))).toBeNaN();
    expect(isEbur128Available()).toBe(false);
    warnSpy.mockRestore();
  });
});
