import type { EssentiaInstance } from "./essentiaTypes";

export interface StftSettingsWire {
  windowSize: number;
  windowType: string;
  hopSize: number;
  minTime: number;
  maxTime: number;
  minFrequency: number;
  maxFrequency: number;
}

export interface StftSpectrogramWire {
  frameCount: number;
  binCount: number;
  /** Row-major dB values (normalized to max frame power). */
  dbValues: ArrayBuffer;
}

export type StftAnalysisProgress = (percent: number) => void;

const yieldEveryFrames = 32;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function computeEssentiaStftSpectrogram(
  essentia: EssentiaInstance,
  channelData: Float32Array,
  sampleRate: number,
  settings: StftSettingsWire,
  onProgress?: StftAnalysisProgress,
): Promise<StftSpectrogramWire> {
  const { windowSize, windowType, hopSize } = settings;
  const minFreqIndex = 0;
  const maxFreqIndex = Math.floor(windowSize / 2);
  const binCount = maxFreqIndex - minFreqIndex;

  const startIndex = Math.floor(settings.minTime * sampleRate);
  const endIndex = Math.floor(settings.maxTime * sampleRate);

  const frameCenters: number[] = [];
  for (let i = startIndex; i < endIndex; i += hopSize) {
    frameCenters.push(i);
  }
  const frameCount = frameCenters.length;

  const powerFlat = new Float32Array(frameCount * binCount);
  let maxValue = Number.EPSILON;
  let frameIdx = 0;

  for (const center of frameCenters) {
    if (frameIdx > 0 && frameIdx % yieldEveryFrames === 0) {
      onProgress?.(Math.min(99, (frameIdx / Math.max(1, frameCount)) * 100));
      await yieldToMain();
    }

    const s = center - windowSize / 2;
    const frame = new Float32Array(windowSize);
    for (let j = 0; j < windowSize; j++) {
      const idx = s + j;
      if (idx >= 0 && idx < channelData.length) {
        frame[j] = channelData[idx];
      }
    }

    const frameVec = essentia.arrayToVector(frame);
    const windowed = essentia.Windowing(
      frameVec,
      false,
      windowSize,
      windowType,
      0,
      false,
    );
    const specOut = essentia.Spectrum(windowed.frame, windowSize);
    const specArr = essentia.vectorToArray(specOut.spectrum);

    const rowOff = frameIdx * binCount;
    for (let j = minFreqIndex; j < maxFreqIndex; j++) {
      const v = specArr[j] * specArr[j];
      powerFlat[rowOff + (j - minFreqIndex)] = v;
      if (maxValue < v) {
        maxValue = v;
      }
    }
    frameIdx++;
  }

  const dbFlat = new Float32Array(powerFlat.length);
  for (let i = 0; i < powerFlat.length; i++) {
    dbFlat[i] = 10 * Math.log10(powerFlat[i] / maxValue);
  }

  onProgress?.(100);

  return {
    frameCount,
    binCount,
    dbValues: dbFlat.buffer.slice(
      dbFlat.byteOffset,
      dbFlat.byteOffset + dbFlat.byteLength,
    ),
  };
}

export function stftWireToSpectrogram(wire: StftSpectrogramWire): number[][] {
  const db = new Float32Array(wire.dbValues);
  const out: number[][] = [];
  for (let f = 0; f < wire.frameCount; f++) {
    const row: number[] = [];
    const off = f * wire.binCount;
    for (let b = 0; b < wire.binCount; b++) {
      row.push(db[off + b]);
    }
    out.push(row);
  }
  return out;
}

/** Slice full-spectrum STFT rows to the configured frequency band (dB). */
export function sliceStftFrequencyBand(
  fullSpectrogram: number[][],
  sampleRate: number,
  windowSize: number,
  minFrequency: number,
  maxFrequency: number,
): number[][] {
  const df = sampleRate / windowSize;
  const minIdx = Math.floor(minFrequency / df);
  const maxIdx = Math.min(
    Math.floor(maxFrequency / df),
    Math.floor(windowSize / 2),
  );
  return fullSpectrogram.map((row) => row.slice(minIdx, maxIdx));
}

/** Map WindowType enum index to essentia window name. */
export const essentiaWindowNames = [
  "hann",
  "hamming",
  "blackmanharris62",
  "triangular",
] as const;
