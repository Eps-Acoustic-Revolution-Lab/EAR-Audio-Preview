import {
  buildCqtCache,
  cqtCacheValid,
  goertzelCqt,
  buildPazBandLayout,
  buildCqtCacheFromLayout,
  pazCacheValid,
  CQT_AXIS_START_HZ,
} from "./goertzelCqt";
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

describe("buildPazBandLayout", () => {
  test("40 Hz LF res produces expected bin count for 44100 Hz", () => {
    const layout = buildPazBandLayout(40, 22050);
    expect(layout.numBins).toBeGreaterThanOrEqual(50);
    expect(layout.numBins).toBeLessThanOrEqual(60);
    expect(layout.freqs[0]).toBeCloseTo(40, 0);
    expect(layout.freqs[layout.numBins - 1]).toBeCloseTo(22050, -1);
    expect(layout.qPerBin[0]).toBeCloseTo(3.85, 1);
    expect(layout.qPerBin[layout.numBins - 1]).toBeCloseTo(10, 0);
    expect(layout.leftEdges.length).toBe(layout.numBins);
  });

  test("leftEdges[0] equals CQT_AXIS_START_HZ (6)", () => {
    const layout = buildPazBandLayout(40, 22050);
    expect(layout.leftEdges[0]).toBe(CQT_AXIS_START_HZ);
  });

  test("leftEdges[k] = sqrt(freqs[k-1] * freqs[k]) for k > 0", () => {
    const layout = buildPazBandLayout(40, 22050);
    for (let k = 1; k < layout.numBins; k++) {
      const expected = Math.sqrt(layout.freqs[k - 1] * layout.freqs[k]);
      expect(layout.leftEdges[k]).toBeCloseTo(expected, 6);
    }
  });

  test("leftEdges are monotonically increasing for all LF res values", () => {
    for (const lfRes of [40, 20, 10]) {
      const layout = buildPazBandLayout(lfRes, 22050);
      for (let k = 1; k < layout.numBins; k++) {
        expect(layout.leftEdges[k]).toBeGreaterThan(layout.leftEdges[k - 1]);
      }
    }
  });

  test("10 Hz LF res produces more bins than 40 Hz", () => {
    const lo = buildPazBandLayout(40, 22050);
    const hi = buildPazBandLayout(10, 22050);
    expect(hi.numBins).toBeGreaterThan(lo.numBins);
    expect(hi.freqs[0]).toBeCloseTo(10, 0);
  });

  test("frequencies are monotonically increasing across crossover", () => {
    const layout = buildPazBandLayout(40, 22050);
    for (let k = 1; k < layout.numBins; k++) {
      expect(layout.freqs[k]).toBeGreaterThan(layout.freqs[k - 1]);
    }
  });
});

describe("buildCqtCacheFromLayout", () => {
  test("produces valid cache with variable window lengths", () => {
    const layout = buildPazBandLayout(40, 22050);
    const cache = buildCqtCacheFromLayout(layout, 44100, 32768);
    expect(cache.windowLengths.length).toBe(layout.numBins);
    const lfWin = cache.windowLengths[0];
    const hfWin = cache.windowLengths[layout.numBins - 1];
    expect(lfWin).toBeGreaterThan(hfWin);
  });

  test("Goertzel with PAZ layout detects 440 Hz sine", () => {
    const layout = buildPazBandLayout(40, 22050);
    const cache = buildCqtCacheFromLayout(layout, 44100, 32768);
    const buf = new Float32Array(32768);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    const outDb = new Float32Array(layout.numBins);
    goertzelCqt(buf, cache, outDb);
    let peakIdx = 0;
    for (let k = 1; k < layout.numBins; k++) {
      if (outDb[k] > outDb[peakIdx]) {
        peakIdx = k;
      }
    }
    expect(layout.freqs[peakIdx]).toBeGreaterThan(400);
    expect(layout.freqs[peakIdx]).toBeLessThan(480);
  });
});

describe("pazCacheValid", () => {
  test("returns true for matching layout and params", () => {
    const layout = buildPazBandLayout(40, 22050);
    const cache = buildCqtCacheFromLayout(layout, 44100, 32768);
    expect(pazCacheValid(cache, layout, 44100, 32768)).toBe(true);
  });

  test("returns false when sampleRate changes", () => {
    const layout = buildPazBandLayout(40, 22050);
    const cache = buildCqtCacheFromLayout(layout, 44100, 32768);
    expect(pazCacheValid(cache, layout, 48000, 32768)).toBe(false);
  });

  test("returns false for null cache", () => {
    const layout = buildPazBandLayout(40, 22050);
    expect(pazCacheValid(null, layout, 44100, 32768)).toBe(false);
  });
});
