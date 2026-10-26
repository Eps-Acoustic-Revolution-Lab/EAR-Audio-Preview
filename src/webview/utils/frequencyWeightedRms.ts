import Ooura from "ooura";

export type RmsWeighting = "Z" | "A" | "B" | "C";

/** Analogue frequency-response magnitudes, normalized exactly at 1 kHz.
 * A/C: IEC 61672 pole frequencies; B: legacy 158.5 Hz middle pole.
 * Applied to FFT power, not a claim of sound-level-meter conformance.
 */
function rawGain(f: number, weighting: RmsWeighting): number {
  const f2 = f * f;
  const common =
    (12194.217 ** 2 * f2) / ((f2 + 20.598997 ** 2) * (f2 + 12194.217 ** 2));
  if (weighting === "A") {
    return (
      (common * f2) / Math.sqrt((f2 + 107.65265 ** 2) * (f2 + 737.86223 ** 2))
    );
  }
  if (weighting === "B") {
    return (common * f) / Math.sqrt(f2 + 158.5 ** 2);
  }
  return common;
}

export function frequencyWeightingGain(
  frequencyHz: number,
  weighting: RmsWeighting,
): number {
  if (weighting === "Z") {
    return 1;
  }
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    return 0;
  }
  return rawGain(frequencyHz, weighting) / rawGain(1000, weighting);
}

/** Independent snapshot estimator: never carries filter history across overlapping taps.
 * Reuses FFT scratch and weights. A single instance can process both meter columns.
 */
export class FrequencyWeightedRms {
  private _fft: Ooura | null = null;
  private _data = new Float64Array(0);
  private _real = new Float64Array(0);
  private _imag = new Float64Array(0);
  private _window = new Float64Array(0);
  private _weights = new Float64Array(0);
  private _windowPower = 0;
  private _sampleRate = 0;
  private _weighting: RmsWeighting = "Z";

  compute(
    samples: Float32Array,
    sampleRate: number,
    weighting: RmsWeighting,
  ): number {
    const n = samples.length;
    if (!n || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      return 0;
    }
    if (weighting === "Z") {
      let power = 0;
      for (const sample of samples) {
        power += sample * sample;
      }
      return Math.sqrt(power / n);
    }
    if (n < 4 || (n & (n - 1)) !== 0) {
      return 0;
    }
    if (this._data.length !== n) {
      this._fft = new Ooura(n, { type: "real", radix: 4 });
      this._data = this._fft.scalarArrayFactory();
      this._real = this._fft.vectorArrayFactory();
      this._imag = this._fft.vectorArrayFactory();
      this._window = new Float64Array(n);
      this._weights = new Float64Array(n / 2 + 1);
      this._windowPower = 0;
      for (let i = 0; i < n; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
        this._window[i] = w;
        this._windowPower += w * w;
      }
      this._sampleRate = 0;
    }
    if (this._sampleRate !== sampleRate || this._weighting !== weighting) {
      for (let k = 0; k < this._weights.length; k++) {
        this._weights[k] =
          frequencyWeightingGain((k * sampleRate) / n, weighting) ** 2;
      }
      this._sampleRate = sampleRate;
      this._weighting = weighting;
    }
    // Remove DC before windowing to prevent leakage into weighted bins.
    let mean = 0;
    for (const sample of samples) {
      mean += sample;
    }
    mean /= n;
    for (let i = 0; i < n; i++) {
      this._data[i] = (samples[i] - mean) * this._window[i];
    }
    this._fft!.fft(this._data.buffer, this._real.buffer, this._imag.buffer);
    let power = 0;
    for (let k = 0; k <= n / 2; k++) {
      const multiplier = k === 0 || k === n / 2 ? 1 : 2;
      power +=
        multiplier *
        (this._real[k] ** 2 + this._imag[k] ** 2) *
        this._weights[k];
    }
    return Math.sqrt(power / (n * this._windowPower));
  }
}
