/* eslint-disable @typescript-eslint/naming-convention */
import { loadEssentia, resetEssentiaLoaderForTests } from "./essentiaLoader";

const mockEssentiaInstance = {
  arrayToVector: (arr: Float32Array) => arr,
  vectorToArray: (v: unknown) => v as Float32Array,
  Windowing: (frame: unknown) => ({ frame }),
  Spectrum: () => ({ spectrum: new Float32Array(0) }),
  PitchYinFFT: () => ({ pitch: 440, pitchConfidence: 0.9 }),
  Flux: () => ({ flux: 0.1 }),
  LoudnessEBUR128: () => ({
    momentaryLoudness: [],
    shortTermLoudness: [],
    integratedLoudness: -14,
    loudnessRange: 5,
  }),
  shutdown: () => {},
  delete: () => {},
};

jest.mock(
  "essentia.js/dist/essentia.js-core.es.js",
  () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(function MockEssentia() {
      return mockEssentiaInstance;
    }),
  }),
  { virtual: true },
);

jest.mock(
  "essentia.js/dist/essentia-wasm.es.js",
  () => ({
    __esModule: true,
    EssentiaWASM: {},
  }),
  { virtual: true },
);

describe("essentiaLoader", () => {
  afterEach(() => {
    resetEssentiaLoaderForTests();
  });

  test("loads Essentia via ES module strategy", async () => {
    const instance = await loadEssentia();
    expect(instance).toBe(mockEssentiaInstance);
    expect(typeof instance?.PitchYinFFT).toBe("function");
  });

  test("returns cached instance on second call", async () => {
    const first = await loadEssentia();
    const second = await loadEssentia();
    expect(second).toBe(first);
  });
});
