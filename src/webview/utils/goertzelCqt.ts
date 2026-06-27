/**
 * Goertzel-based Constant-Q Transform for the live spectrum analyzer.
 *
 * Each frequency bin uses an independently-sized analysis window
 * (N_k = Q * fs / f_k), matching the wavelet / constant-Q technique
 * used by Waves PAZ Analyzer. Pre-computed Hann windows and Goertzel
 * coefficients are cached per configuration.
 */

const CQT_Q = 10;
const CQT_CROSSOVER_HZ = 250;
export const CQT_AXIS_START_HZ = 6;
// eslint-disable-next-line @typescript-eslint/naming-convention
const PAZ_Q_LOW: Record<number, number> = { 40: 3.85, 20: 5.07, 10: 6.97 };
const EPSILON = 1e-15;

export interface CqtConfig {
  /** Number of geometrically-spaced frequency bins. */
  numBins: number;
  /** Sample rate (Hz). */
  sampleRate: number;
  /** Available time-domain buffer length (samples). */
  bufferLength: number;
  /** Lower frequency bound (Hz). */
  freqMin: number;
  /** Upper frequency bound (Hz). */
  freqMax: number;
}

export interface CqtCache {
  config: CqtConfig;
  /** Center frequency of each bin (Hz). */
  freqs: Float64Array;
  /** Window length for each bin (samples). */
  windowLengths: Uint32Array;
  /** Pre-computed Goertzel coefficient 2*cos(2π*f_k/fs) per bin. */
  goertzelCoeffs: Float64Array;
  /** Flattened Hann window coefficients for all bins. */
  hannWindows: Float32Array;
  /** Starting offset into hannWindows for each bin. */
  hannOffsets: Uint32Array;
}

/** Build frequency grid, window lengths, Goertzel coefficients, and Hann windows. */
export function buildCqtCache(cfg: CqtConfig): CqtCache {
  const { numBins, sampleRate, bufferLength, freqMin, freqMax } = cfg;
  const freqs = new Float64Array(numBins);
  const windowLengths = new Uint32Array(numBins);
  const goertzelCoeffs = new Float64Array(numBins);
  const hannOffsets = new Uint32Array(numBins);

  const logMin = Math.log(freqMin);
  const logMax = Math.log(freqMax);

  let totalHannSamples = 0;
  for (let k = 0; k < numBins; k++) {
    const f = Math.exp(logMin + (k / (numBins - 1)) * (logMax - logMin));
    freqs[k] = f;
    const idealN = Math.round((CQT_Q * sampleRate) / f);
    const n = Math.min(bufferLength, Math.max(2, idealN));
    windowLengths[k] = n;
    goertzelCoeffs[k] = 2 * Math.cos((2 * Math.PI * f) / sampleRate);
    hannOffsets[k] = totalHannSamples;
    totalHannSamples += n;
  }

  const hannWindows = new Float32Array(totalHannSamples);
  for (let k = 0; k < numBins; k++) {
    const n = windowLengths[k];
    const off = hannOffsets[k];
    const denom = n - 1 || 1;
    for (let i = 0; i < n; i++) {
      hannWindows[off + i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
    }
  }

  return {
    config: cfg,
    freqs,
    windowLengths,
    goertzelCoeffs,
    hannWindows,
    hannOffsets,
  };
}

/** Check whether an existing cache matches a new config. */
export function cqtCacheValid(cache: CqtCache | null, cfg: CqtConfig): boolean {
  if (!cache) {
    return false;
  }
  const c = cache.config;
  return (
    c.numBins === cfg.numBins &&
    c.sampleRate === cfg.sampleRate &&
    c.bufferLength === cfg.bufferLength &&
    c.freqMin === cfg.freqMin &&
    c.freqMax === cfg.freqMax
  );
}

/**
 * Run Goertzel CQT on a time-domain buffer, writing dB magnitudes into outDb.
 */
export function goertzelCqt(
  timeBuf: Float32Array,
  cache: CqtCache,
  outDb: Float32Array,
): void {
  const { numBins } = cache.config;
  const { windowLengths, goertzelCoeffs, hannWindows, hannOffsets } = cache;
  const bufLen = timeBuf.length;

  for (let k = 0; k < numBins; k++) {
    const n = windowLengths[k];
    const coeff = goertzelCoeffs[k];
    const hannOff = hannOffsets[k];
    const startSample = Math.max(0, Math.floor((bufLen - n) / 2));

    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const s =
        timeBuf[startSample + i] * hannWindows[hannOff + i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s;
    }

    const magSq = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    const mag = Math.sqrt(Math.max(0, magSq)) / (n / 2);
    outDb[k] = 20 * Math.log10(mag + EPSILON);
  }
}

/* ── PAZ-style variable-Q band layout ─────────────────────────── */

export interface PazBandLayout {
  freqs: Float64Array;
  leftEdges: Float64Array;
  qPerBin: Float64Array;
  numBins: number;
  crossoverIdx: number;
}

/**
 * Generate PAZ-style frequency centers and per-bin Q values.
 * Below 250 Hz: sparser bins with lower Q (matching PAZ's psychoacoustic model).
 * Above 250 Hz: denser bins with Q≈10 (~7 bins/octave).
 */
export function buildPazBandLayout(
  lfResHz: number,
  freqMax: number,
): PazBandLayout {
  const qLow = PAZ_Q_LOW[lfResHz] ?? PAZ_Q_LOW[40];
  const qHigh = CQT_Q;
  const cross = CQT_CROSSOVER_HZ;

  const binsLow = Math.max(
    1,
    Math.round(Math.log(cross / lfResHz) / Math.log(1 + 1 / qLow)),
  );
  const binsHigh = Math.max(
    1,
    Math.round(Math.log(freqMax / cross) / Math.log(1 + 1 / qHigh)),
  );

  const numBins = binsLow + binsHigh;
  const freqs = new Float64Array(numBins);
  const qPerBin = new Float64Array(numBins);

  for (let k = 0; k < binsLow; k++) {
    freqs[k] = lfResHz * Math.pow(cross / lfResHz, k / binsLow);
    qPerBin[k] = qLow;
  }
  for (let k = 0; k < binsHigh; k++) {
    freqs[binsLow + k] =
      cross * Math.pow(freqMax / cross, k / (binsHigh - 1 || 1));
    qPerBin[binsLow + k] = qHigh;
  }

  const leftEdges = new Float64Array(numBins);
  leftEdges[0] = CQT_AXIS_START_HZ;
  for (let k = 1; k < numBins; k++) {
    leftEdges[k] = Math.sqrt(freqs[k - 1] * freqs[k]);
  }

  return { freqs, leftEdges, qPerBin, numBins, crossoverIdx: binsLow };
}

/** Build CQT cache from an explicit PAZ band layout (variable Q per bin). */
export function buildCqtCacheFromLayout(
  layout: PazBandLayout,
  sampleRate: number,
  bufferLength: number,
): CqtCache {
  const { freqs, qPerBin, numBins } = layout;
  const windowLengths = new Uint32Array(numBins);
  const goertzelCoeffs = new Float64Array(numBins);
  const hannOffsets = new Uint32Array(numBins);

  let totalHannSamples = 0;
  for (let k = 0; k < numBins; k++) {
    const idealN = Math.round((qPerBin[k] * sampleRate) / freqs[k]);
    const n = Math.min(bufferLength, Math.max(2, idealN));
    windowLengths[k] = n;
    goertzelCoeffs[k] = 2 * Math.cos((2 * Math.PI * freqs[k]) / sampleRate);
    hannOffsets[k] = totalHannSamples;
    totalHannSamples += n;
  }

  const hannWindows = new Float32Array(totalHannSamples);
  for (let k = 0; k < numBins; k++) {
    const n = windowLengths[k];
    const off = hannOffsets[k];
    const denom = n - 1 || 1;
    for (let i = 0; i < n; i++) {
      hannWindows[off + i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
    }
  }

  const config: CqtConfig = {
    numBins,
    sampleRate,
    bufferLength,
    freqMin: freqs[0],
    freqMax: freqs[numBins - 1],
  };

  return {
    config,
    freqs,
    windowLengths,
    goertzelCoeffs,
    hannWindows,
    hannOffsets,
  };
}

/** Check whether an existing cache matches a PAZ layout + audio params. */
export function pazCacheValid(
  cache: CqtCache | null,
  layout: PazBandLayout,
  sampleRate: number,
  bufferLength: number,
): boolean {
  if (!cache) {
    return false;
  }
  const c = cache.config;
  return (
    c.numBins === layout.numBins &&
    c.sampleRate === sampleRate &&
    c.bufferLength === bufferLength &&
    c.freqMin === layout.freqs[0] &&
    c.freqMax === layout.freqs[layout.numBins - 1]
  );
}
