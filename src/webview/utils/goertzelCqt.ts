/**
 * Goertzel-based Constant-Q Transform for the live spectrum analyzer.
 *
 * Each frequency bin uses an independently-sized analysis window
 * (N_k = Q * fs / f_k), matching the wavelet / constant-Q technique
 * used by Waves PAZ Analyzer. Pre-computed Hann windows and Goertzel
 * coefficients are cached per configuration.
 */

const CQT_Q = 10;
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
