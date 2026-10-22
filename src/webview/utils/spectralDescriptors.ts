import Ooura from "ooura";

export interface SpectralDescriptors {
  centroidHz: number;
  spreadHz: number;
  rolloffHz: number;
}

/** Power-weighted descriptors, excluding DC. Null denotes silence/no valid data. */
export function describeSpectrum(
  power: Float64Array,
  binHz: number,
): SpectralDescriptors | null {
  if (!(binHz > 0) || !Number.isFinite(binHz)) {
    return null;
  }
  let sum = 0,
    moment = 0;
  for (let k = 1; k < power.length; k++) {
    const p = Number.isFinite(power[k]) ? Math.max(0, power[k]) : 0;
    sum += p;
    moment += p * k * binHz;
  }
  if (!(sum > 1e-20)) {
    return null;
  }
  const centroidHz = moment / sum;
  let variance = 0,
    cumulative = 0,
    rolloffHz = 0;
  for (let k = 1; k < power.length; k++) {
    const p = Number.isFinite(power[k]) ? Math.max(0, power[k]) : 0;
    variance += p * (k * binHz - centroidHz) ** 2;
    cumulative += p;
    if (!rolloffHz && cumulative >= sum * 0.85) {
      rolloffHz = k * binHz;
    }
  }
  return { centroidHz, spreadHz: Math.sqrt(variance / sum), rolloffHz };
}

/** Reusable Hann FFT. Stereo powers are summed, preserving opposite-phase energy. */
export class SpectralDescriptorAnalyzer {
  private _size = 0;
  private _fft: Ooura;
  private _input: Float64Array;
  private _real: Float64Array;
  private _imag: Float64Array;
  private _power: Float64Array;
  private _window: Float64Array;

  compute(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
  ): SpectralDescriptors | null {
    const length = Math.min(left.length, right.length, 32768);
    if (length < 4 || !(sampleRate > 0)) {
      return null;
    }
    const size = 2 ** Math.ceil(Math.log2(length));
    if (size !== this._size) {
      this._size = size;
      this._fft = new Ooura(size, { type: "real", radix: 4 });
      this._input = this._fft.scalarArrayFactory();
      this._real = this._fft.vectorArrayFactory();
      this._imag = this._fft.vectorArrayFactory();
      this._power = new Float64Array(size / 2 + 1);
      this._window = new Float64Array(size);
    }
    this._power.fill(0);
    for (let i = 0; i < length; i++) {
      this._window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
    }
    for (const channel of [left, right]) {
      this._input.fill(0);
      for (let i = 0; i < length; i++) {
        this._input[i] = Number.isFinite(channel[i])
          ? channel[i] * this._window[i]
          : 0;
      }
      this._fft.fft(this._input.buffer, this._real.buffer, this._imag.buffer);
      for (let k = 0; k < this._power.length; k++) {
        this._power[k] += this._real[k] ** 2 + this._imag[k] ** 2;
      }
    }
    return describeSpectrum(this._power, sampleRate / size);
  }
}
