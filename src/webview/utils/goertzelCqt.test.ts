import { buildCqtCache, cqtCacheValid, goertzelCqt } from "./goertzelCqt";
import type { CqtConfig } from "./goertzelCqt";

const baseCfg: CqtConfig = {
  numBins: 96,
  sampleRate: 44100,
  bufferLength: 32768,
  freqMin: 20,
  freqMax: 20000,
};

describe("buildCqtCache", () => {
  test("produces correct number of bins", () => {
    const cache = buildCqtCache(baseCfg);
    expect(cache.freqs.length).toBe(96);
    expect(cache.windowLengths.length).toBe(96);
    expect(cache.goertzelCoeffs.length).toBe(96);
    expect(cache.hannOffsets.length).toBe(96);
  });

  test("frequencies are geometrically spaced between freqMin and freqMax", () => {
    const cache = buildCqtCache(baseCfg);
    expect(cache.freqs[0]).toBeCloseTo(20, 0);
    expect(cache.freqs[95]).toBeCloseTo(20000, -1);
    const ratio0 = cache.freqs[1] / cache.freqs[0];
    const ratio50 = cache.freqs[51] / cache.freqs[50];
    expect(ratio0).toBeCloseTo(ratio50, 4);
  });

  test("window lengths follow Q * fs / f, capped at bufferLength", () => {
    const cache = buildCqtCache(baseCfg);
    expect(cache.windowLengths[0]).toBe(Math.round((10 * 44100) / 20));
    expect(cache.windowLengths[95]).toBe(Math.round((10 * 44100) / 20000));
    expect(cache.windowLengths[0]).toBeGreaterThan(cache.windowLengths[95]);
  });

  test("short buffer caps window lengths", () => {
    const cfg: CqtConfig = { ...baseCfg, bufferLength: 512 };
    const cache = buildCqtCache(cfg);
    for (let k = 0; k < cfg.numBins; k++) {
      expect(cache.windowLengths[k]).toBeLessThanOrEqual(512);
    }
  });

  test("Goertzel coefficients are 2*cos(2*pi*f/fs)", () => {
    const cache = buildCqtCache(baseCfg);
    for (let k = 0; k < baseCfg.numBins; k++) {
      const expected = 2 * Math.cos((2 * Math.PI * cache.freqs[k]) / 44100);
      expect(cache.goertzelCoeffs[k]).toBeCloseTo(expected, 10);
    }
  });

  test("frequencies span custom range [8, sr/2]", () => {
    const cfg: CqtConfig = {
      numBins: 96,
      sampleRate: 44100,
      bufferLength: 32768,
      freqMin: 8,
      freqMax: 22050,
    };
    const cache = buildCqtCache(cfg);
    expect(cache.freqs[0]).toBeCloseTo(8, 0);
    expect(cache.freqs[95]).toBeCloseTo(22050, -1);
    // Window for 8 Hz: Q*44100/8 = 55125, capped at 32768
    expect(cache.windowLengths[0]).toBe(32768);
  });
});

describe("cqtCacheValid", () => {
  test("returns true for identical config", () => {
    const cache = buildCqtCache(baseCfg);
    expect(cqtCacheValid(cache, baseCfg)).toBe(true);
  });

  test("returns false when numBins changes", () => {
    const cache = buildCqtCache(baseCfg);
    expect(cqtCacheValid(cache, { ...baseCfg, numBins: 48 })).toBe(false);
  });

  test("returns false when sampleRate changes", () => {
    const cache = buildCqtCache(baseCfg);
    expect(cqtCacheValid(cache, { ...baseCfg, sampleRate: 48000 })).toBe(false);
  });

  test("returns false for null cache", () => {
    expect(cqtCacheValid(null, baseCfg)).toBe(false);
  });
});

describe("goertzelCqt", () => {
  test("pure sine wave peaks at the correct bin", () => {
    const cache = buildCqtCache(baseCfg);
    const buf = new Float32Array(baseCfg.bufferLength);
    const freq = 440;
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.sin((2 * Math.PI * freq * i) / baseCfg.sampleRate);
    }
    const outDb = new Float32Array(baseCfg.numBins);
    goertzelCqt(buf, cache, outDb);

    let peakIdx = 0;
    for (let k = 1; k < baseCfg.numBins; k++) {
      if (outDb[k] > outDb[peakIdx]) {
        peakIdx = k;
      }
    }
    expect(cache.freqs[peakIdx]).toBeGreaterThan(400);
    expect(cache.freqs[peakIdx]).toBeLessThan(480);
    const distantBin = peakIdx > 50 ? 10 : baseCfg.numBins - 10;
    expect(outDb[peakIdx] - outDb[distantBin]).toBeGreaterThan(30);
  });

  test("silence produces very low dB values", () => {
    const cache = buildCqtCache(baseCfg);
    const buf = new Float32Array(baseCfg.bufferLength);
    const outDb = new Float32Array(baseCfg.numBins);
    goertzelCqt(buf, cache, outDb);

    for (let k = 0; k < baseCfg.numBins; k++) {
      expect(outDb[k]).toBeLessThan(-200);
    }
  });
});
