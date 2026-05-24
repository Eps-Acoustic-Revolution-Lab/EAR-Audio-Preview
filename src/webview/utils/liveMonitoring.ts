/** Stereo monitoring path for live meters / headphone matrix (linear). */
export type LiveMonitoringMode = "lr" | "swap" | "l" | "r" | "m" | "s";

/** Five octave-ish bands configurable via edges (see AnalyzeSettingsService). */
export type MonitorBandId = "sub" | "low" | "lowMid" | "highMid" | "high";

export const monitorBandIds: readonly MonitorBandId[] = [
  "sub",
  "low",
  "lowMid",
  "highMid",
  "high",
] as const;

export const monitorBandCount = monitorBandIds.length;

/** All five bits set (“every band”) or empty mask ⇒ no filtering (listen full bandwidth). */
export const monitorBandMaskAll = (1 << monitorBandCount) - 1;

export function populationCountBits(mask: number): number {
  let m = mask >>> 0;
  let n = 0;
  while (m) {
    n += m & 1;
    m >>>= 1;
  }
  return n;
}

export function monitorBandSoloBypassActive(mask: number): boolean {
  const m = (mask ?? 0) & monitorBandMaskAll;
  const c = populationCountBits(m);
  return c === 0 || c === monitorBandCount;
}

/**
 * Clamp / sort six ascending edges (Hz): band i spans [edges[i], edges[i+1]].
 * upper bound clamps to Nyquist-ish for Web Audio stability.
 */
export function sanitizeMonitorBandEdges(
  raw: readonly number[] | undefined,
  sampleRate: number,
): number[] {
  const nyHi = Math.max(22050, Math.min(sampleRate / 2, sampleRate * 0.496));
  const loLim = 10;
  const fallback = [20, 60, 240, 900, 5000, nyHi];
  const e: number[] = [];
  for (let i = 0; i < 6; i++) {
    const v = raw && raw.length > i ? Number(raw[i]) : fallback[i];
    e.push(Number.isFinite(v) ? v : fallback[i]);
  }
  for (let i = 0; i < 6; i++) {
    e[i] = Math.min(nyHi, Math.max(loLim, e[i]));
  }
  for (let i = 1; i < 6; i++) {
    if (e[i] <= e[i - 1]) {
      e[i] = Math.min(nyHi, e[i - 1] + 10);
    }
  }
  e[5] = Math.min(e[5], nyHi);
  if (e[5] <= e[4]) {
    e[5] = Math.min(nyHi, e[4] + 10);
  }
  return e;
}

export interface MonitoringGains {
  ll: number;
  lr: number;
  rl: number;
  rr: number;
}

/** Swap headphone L/R taps after solo/mode matrix (`outL ⇄ outR`). */
export function composeSwapAfter(base: MonitoringGains): MonitoringGains {
  return {
    ll: base.lr,
    lr: base.ll,
    rl: base.rr,
    rr: base.rl,
  };
}

export function monitoringGainsForMode(mode: LiveMonitoringMode): MonitoringGains {
  switch (mode) {
    case "l":
      return { ll: 1, lr: 1, rl: 0, rr: 0 };
    case "r":
      return { ll: 0, lr: 0, rl: 1, rr: 1 };
    case "m":
      return { ll: 0.5, lr: 0.5, rl: 0.5, rr: 0.5 };
    case "s":
      return { ll: 0.5, lr: -0.5, rl: -0.5, rr: 0.5 };
    case "swap":
      return composeSwapAfter({ ll: 1, lr: 0, rl: 0, rr: 1 });
    case "lr":
    default:
      return { ll: 1, lr: 0, rl: 0, rr: 1 };
  }
}

/**
 * Mix L/R samples into outL/outR using the same linear matrix as the audio graph.
 * Buffers may alias (e.g. outL === lBuf after in-place); use temporaries if needed.
 */
export function applyMonitoringToTimeDomain(
  mode: LiveMonitoringMode,
  lBuf: Float32Array,
  rBuf: Float32Array,
  outL: Float32Array,
  outR: Float32Array,
): void {
  const { ll, lr, rl, rr } = monitoringGainsForMode(mode);
  const n = lBuf.length;
  for (let i = 0; i < n; i++) {
    const left = lBuf[i];
    const right = rBuf[i];
    outL[i] = ll * left + rl * right;
    outR[i] = lr * left + rr * right;
  }
}

/**
 * Spectrum tilt / slope (e.g. SPAN-style): add `slope * log2(f / fRef)` dB to the trace.
 * Positive slope boosts higher frequencies so pink noise (~−3 dB/oct physical) can read flat at 3 dB/oct.
 */
export function spectrumTiltDb(
  fHz: number,
  slopeDbPerOct: number,
  fRefHz: number = 1000,
): number {
  if (slopeDbPerOct === 0 || !Number.isFinite(fHz) || fHz <= 0) {return 0;}
  return slopeDbPerOct * (Math.log(fHz / fRefHz) / Math.LN2);
}

/**
 * Same tilt as {@link spectrumTiltDb}, scaled to zero at the noise floor so a
 * constant silent spectrum (e.g. −90 dBFS in every bin) does not become a sloped line.
 *
 * @param rawDb  Measured band level in dB **before** tilt (typically ≤ 0).
 * @param floorDb  Analyzer floor used as “no signal” (same as plot floor, e.g. −90).
 * @param blendDb  How many dB above `floorDb` until tilt reaches full strength.
 */
export function spectrumTiltDbAboveFloor(
  fHz: number,
  slopeDbPerOct: number,
  rawDb: number,
  floorDb: number = -90,
  blendDb: number = 18,
  fRefHz: number = 1000,
): number {
  const t = spectrumTiltDb(fHz, slopeDbPerOct, fRefHz);
  if (t === 0) {return 0;}
  const w = Math.max(0, Math.min(1, (rawDb - floorDb) / Math.max(1e-6, blendDb)));
  return t * w;
}

/** Mid / Side from interleaved stereo time domain (same length buffers). */
export function encodeMidSideTimeDomain(
  lBuf: Float32Array,
  rBuf: Float32Array,
  outM: Float32Array,
  outS: Float32Array,
): void {
  const n = lBuf.length;
  for (let i = 0; i < n; i++) {
    const left = lBuf[i];
    const right = rBuf[i];
    outM[i] = 0.5 * (left + right);
    outS[i] = 0.5 * (left - right);
  }
}
