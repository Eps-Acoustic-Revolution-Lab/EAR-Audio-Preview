import { type EssentiaInstance, freeEssentiaVector } from "./essentiaTypes";

/** Frame-major chroma, in C, C#, … B order; melody has its own 128-sample clock. */
export interface HarmonicProfile {
  chroma: Float32Array;
  chromaTimeSec: Float32Array;
  melodyHz: Float32Array;
  melodyConfidence: Float32Array;
  melodyHopSec: number;
}
export interface HarmonicProfileWire {
  chroma: ArrayBuffer;
  chromaTimeSec: ArrayBuffer;
  melodyHz: ArrayBuffer;
  melodyConfidence: ArrayBuffer;
  melodyHopSec: number;
}

/* eslint-disable @typescript-eslint/naming-convention */
type HarmonicEssentia = EssentiaInstance & {
  SpectralPeaks(
    spectrum: unknown,
    magnitudeThreshold?: number,
    maxFrequency?: number,
    maxPeaks?: number,
    minFrequency?: number,
    orderBy?: string,
    sampleRate?: number,
  ): { frequencies: unknown; magnitudes: unknown };
  HPCP(
    frequencies: unknown,
    magnitudes: unknown,
    bandPreset?: boolean,
    bandSplitFrequency?: number,
    harmonics?: number,
    maxFrequency?: number,
    maxShifted?: boolean,
    minFrequency?: number,
    nonLinear?: boolean,
    normalized?: string,
    referenceFrequency?: number,
    sampleRate?: number,
    size?: number,
  ): { hpcp: unknown };
  PredominantPitchMelodia(
    signal: unknown,
    ...options: (number | boolean | undefined)[]
  ): { pitch: unknown; pitchConfidence: unknown };
  EqualLoudness(signal: unknown, sampleRate?: number): { signal: unknown };
};
/* eslint-enable @typescript-eslint/naming-convention */

export const harmonicMaxDurationSec = 300;
const supportedRates = [8000, 32000, 44100, 48000];

export function harmonicUnavailableReason(
  duration: number,
  sampleRate: number,
): string | null {
  if (!supportedRates.includes(sampleRate)) {
    return "Harmonic analysis supports 8, 32, 44.1 and 48 kHz audio.";
  }
  if (
    !Number.isFinite(duration) ||
    duration < 0.1 ||
    duration > harmonicMaxDurationSec
  ) {
    return "Harmonic analysis supports clips from 0.1 seconds up to 5 minutes.";
  }
  return null;
}

export function harmonicToWire(profile: HarmonicProfile): HarmonicProfileWire {
  const copy = (a: Float32Array) => a.slice().buffer;
  return {
    chroma: copy(profile.chroma),
    chromaTimeSec: copy(profile.chromaTimeSec),
    melodyHz: copy(profile.melodyHz),
    melodyConfidence: copy(profile.melodyConfidence),
    melodyHopSec: profile.melodyHopSec,
  };
}
export function harmonicFromWire(
  profile: HarmonicProfileWire,
): HarmonicProfile {
  return {
    chroma: new Float32Array(profile.chroma),
    chromaTimeSec: new Float32Array(profile.chromaTimeSec),
    melodyHz: new Float32Array(profile.melodyHz),
    melodyConfidence: new Float32Array(profile.melodyConfidence),
    melodyHopSec: profile.melodyHopSec,
  };
}

/** On-demand host analysis. Melodia returns ONE predominant melodic line, not transcription. */
export async function computeHarmonicFeatures(
  instance: EssentiaInstance,
  samples: Float32Array,
  sampleRate: number,
  shouldCancel?: () => boolean,
): Promise<HarmonicProfile> {
  const reason = harmonicUnavailableReason(
    samples.length / sampleRate,
    sampleRate,
  );
  if (reason) {
    throw new Error(reason);
  }
  const essentia = instance as HarmonicEssentia;
  const checkCancelled = () => {
    if (shouldCancel?.()) {
      throw new Error("Harmonic analysis cancelled");
    }
  };
  checkCancelled();
  const size = 4096;
  const hop = Math.max(1, Math.round(sampleRate * 0.05));
  const count = Math.ceil(samples.length / hop);
  const chroma = new Float32Array(count * 12);
  const chromaTimeSec = new Float32Array(count);
  let peak = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) {
      throw new Error("Harmonic analysis requires finite samples");
    }
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak === 0) {
    for (let i = 0; i < count; i++) {
      chromaTimeSec[i] = (i * hop) / sampleRate;
    }
    const melodyLength = Math.ceil(samples.length / 128) + 1;
    return {
      chroma,
      chromaTimeSec,
      melodyHz: new Float32Array(melodyLength).fill(NaN),
      melodyConfidence: new Float32Array(melodyLength),
      melodyHopSec: 128 / sampleRate,
    };
  }
  const frame = new Float32Array(size);
  for (let index = 0; index < count; index++) {
    if (index % 16 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      checkCancelled();
    }
    const center = index * hop;
    chromaTimeSec[index] = center / sampleRate;
    for (let j = 0; j < size; j++) {
      frame[j] = samples[center - size / 2 + j] ?? 0;
    }
    const vectors: unknown[] = [];
    try {
      const input = essentia.arrayToVector(frame);
      vectors.push(input);
      const window = essentia.Windowing(
        input,
        false,
        size,
        "hann",
        0,
        false,
      ).frame;
      vectors.push(window);
      const spectrum = essentia.Spectrum(window, size).spectrum;
      vectors.push(spectrum);
      const maxFrequency = Math.min(5000, sampleRate / 2 - 1);
      const peaks = essentia.SpectralPeaks(
        spectrum,
        0.00001,
        maxFrequency,
        100,
        40,
        "frequency",
        sampleRate,
      );
      vectors.push(peaks.frequencies, peaks.magnitudes);
      if (essentia.vectorToArray(peaks.frequencies).length === 0) {
        continue;
      }
      const result = essentia.HPCP(
        peaks.frequencies,
        peaks.magnitudes,
        false,
        500,
        0,
        maxFrequency,
        false,
        40,
        false,
        "unitMax",
        440,
        sampleRate,
        12,
      ).hpcp;
      vectors.push(result);
      const values = essentia.vectorToArray(result);
      // Essentia starts at A; rotate three semitones to start at C.
      for (let bin = 0; bin < 12; bin++) {
        chroma[index * 12 + bin] = values[(bin + 3) % 12] || 0;
      }
    } finally {
      vectors.forEach(freeEssentiaVector);
    }
  }
  checkCancelled();
  const vectors: unknown[] = [];
  try {
    const signal = essentia.arrayToVector(samples);
    vectors.push(signal);
    const filtered = essentia.EqualLoudness(signal, sampleRate).signal;
    vectors.push(filtered);
    // Keep the library's contour parameters and 128-sample hop. Time zero is the
    // first zero-centred frame; chroma and melody therefore use distinct clocks.
    const result = essentia.PredominantPitchMelodia(
      filtered,
      undefined,
      undefined,
      undefined,
      false,
      undefined,
      128,
      undefined,
      undefined,
      Math.min(20000, sampleRate / 2 - 1),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      sampleRate,
    );
    vectors.push(result.pitch, result.pitchConfidence);
    checkCancelled();
    const melodyHz = essentia.vectorToArray(result.pitch).slice();
    const melodyConfidence = essentia
      .vectorToArray(result.pitchConfidence)
      .slice();
    for (let i = 0; i < melodyHz.length; i++) {
      if (!(melodyHz[i] > 0) || !(melodyConfidence[i] > 0)) {
        melodyHz[i] = NaN;
      }
    }
    return {
      chroma,
      chromaTimeSec,
      melodyHz,
      melodyConfidence,
      melodyHopSec: 128 / sampleRate,
    };
  } finally {
    vectors.forEach(freeEssentiaVector);
  }
}
