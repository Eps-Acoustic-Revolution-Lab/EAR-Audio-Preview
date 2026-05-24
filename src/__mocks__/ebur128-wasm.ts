/* eslint-disable @typescript-eslint/naming-convention */
// This file mocks the ebur128-wasm package which exports snake_case function names.

function samplePeakDbTp(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) {
      peak = a;
    }
  }
  if (peak <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  return 20 * Math.log10(peak);
}

export function ebur128_true_peak_mono(
  _sampleRate: number,
  samples: Float32Array,
): number {
  return samplePeakDbTp(samples);
}

export function ebur128_true_peak_stereo(
  _sampleRate: number,
  left: Float32Array,
  right: Float32Array,
): number {
  return Math.max(samplePeakDbTp(left), samplePeakDbTp(right));
}

export function ebur128_integrated_mono(): number {
  return -23;
}

export function ebur128_integrated_stereo(): number {
  return -23;
}
