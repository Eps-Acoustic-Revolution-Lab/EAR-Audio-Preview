import Ooura from "ooura";
import { freqMin, freqMax } from "./liveLogSpectrumAxis";

const energyFloor = 1e-12;

export interface RhoPerBinResult {
  /** Center frequency (Hz) per FFT bin, length = binCount. */
  srcXs: Float64Array;
  /** Normalized cross-spectrum real part ρ ∈ [-1, 1], length = binCount. */
  srcYs: Float64Array;
  binCount: number;
  /** Power-weighted broadband correlation. */
  broadbandRho: number;
}

function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  if (n <= 1) {
    if (n === 1) {
      w[0] = 1;
    }
    return w;
  }
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

/** Re(F_L · conj(F_R)) / (|F_L| |F_R|), clamped to [-1, 1]. */
export function normalizedCrossSpectrumReal(
  lRe: number,
  lIm: number,
  rRe: number,
  rIm: number,
): number {
  const crossRe = lRe * rRe + lIm * rIm;
  const magProd = Math.hypot(lRe, lIm) * Math.hypot(rRe, rIm);
  if (magProd < energyFloor) {
    return 0;
  }
  return Math.max(-1, Math.min(1, crossRe / magProd));
}

/**
 * Stateful engine: dual real FFT on monitoring-mixed L/R buffers → per-bin ρ.
 * Window: Hann (Metric AB / analyzer-style STFT convention).
 */
export class FrequencyPhaseCorrelationEngine {
  private _ooura: Ooura | null = null;
  private _fftSize = 0;
  private _hann: Float64Array | null = null;
  private _srcXs = new Float64Array(0);
  private _srcYs = new Float64Array(0);

  ensureFftSize(fftSize: number): void {
    if (this._fftSize === fftSize) {
      return;
    }
    this._fftSize = fftSize;
    this._ooura = new Ooura(fftSize, { type: "real", radix: 4 });
    this._hann = hannWindow(fftSize);
    const binCount = Math.floor(fftSize / 2);
    this._srcXs = new Float64Array(binCount);
    this._srcYs = new Float64Array(binCount);
  }

  computeRhoPerBin(
    mixL: Float32Array,
    mixR: Float32Array,
    sampleRate: number,
  ): RhoPerBinResult {
    const fftSize = mixL.length;
    this.ensureFftSize(fftSize);

    const ooura = this._ooura!;
    const hann = this._hann!;
    const binCount = this._srcXs.length;
    const binHz = sampleRate / fftSize;

    const dL = ooura.scalarArrayFactory();
    const dR = ooura.scalarArrayFactory();
    for (let i = 0; i < fftSize; i++) {
      dL[i] = mixL[i] * hann[i];
      dR[i] = mixR[i] * hann[i];
    }

    const reL = ooura.vectorArrayFactory();
    const imL = ooura.vectorArrayFactory();
    const reR = ooura.vectorArrayFactory();
    const imR = ooura.vectorArrayFactory();
    ooura.fft(dL.buffer, reL.buffer, imL.buffer);
    ooura.fft(dR.buffer, reR.buffer, imR.buffer);

    let weightSum = 0;
    let rhoWeighted = 0;
    let outCount = 0;

    for (let k = 0; k < binCount; k++) {
      const f = (k + 0.5) * binHz;
      if (f < freqMin || f > Math.min(freqMax, sampleRate / 2)) {
        continue;
      }
      const rho = normalizedCrossSpectrumReal(reL[k], imL[k], reR[k], imR[k]);
      const w = Math.hypot(reL[k], imL[k]) * Math.hypot(reR[k], imR[k]);
      this._srcXs[outCount] = f;
      this._srcYs[outCount] = rho;
      outCount++;
      if (w > energyFloor) {
        rhoWeighted += rho * w;
        weightSum += w;
      }
    }

    const broadbandRho = weightSum > energyFloor ? rhoWeighted / weightSum : 0;

    return {
      srcXs: this._srcXs.subarray(0, outCount),
      srcYs: this._srcYs.subarray(0, outCount),
      binCount: outCount,
      broadbandRho,
    };
  }
}

/** Convenience for tests: one-shot ρ from synthetic buffers. */
export function computeRhoPerBin(
  mixL: Float32Array,
  mixR: Float32Array,
  sampleRate: number,
  engine = new FrequencyPhaseCorrelationEngine(),
): RhoPerBinResult {
  return engine.computeRhoPerBin(mixL, mixR, sampleRate);
}
