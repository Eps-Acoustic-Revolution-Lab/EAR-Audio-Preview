import Ooura from "ooura";
import { EventType } from "../events";
import {
  AnalyzeSettingsProps,
  FftBackend,
  FrequencyScale,
  WindowType,
} from "./analyzeSettingsService";
import Service from "../service";
import {
  canvasYTopToLogPiecewiseYNorm,
  piecewiseLogAxisBoundaries,
  piecewiseYNormToHz,
} from "../spectrogramFrequencyLayout";

/* eslint-disable @typescript-eslint/naming-convention */
type EssentiaInstance = {
  arrayToVector(arr: Float32Array): unknown;
  vectorToArray(vec: unknown): Float32Array;
  // Essentia's API uses PascalCase method names; disable naming rule for this type
  Windowing(
    frame: unknown,
    normalized?: boolean,
    size?: number,
    type?: string,
    zeroPadding?: number,
    zeroPhase?: boolean,
  ): { frame: unknown };
  Spectrum(frame: unknown, size?: number): { spectrum: unknown };
  LoudnessEBUR128(
    left: unknown,
    right: unknown,
    hopSize?: number,
    sampleRate?: number,
    startAtZero?: boolean,
  ): {
    momentaryLoudness: unknown;
    shortTermLoudness: unknown;
    integratedLoudness: number;
    loudnessRange: number;
  };
  delete(): void;
  shutdown(): void;
};
/* eslint-enable @typescript-eslint/naming-convention */

// Map our WindowType enum to essentia's string identifiers (camelCase not required for string values)
const windowTypeMap: Record<WindowType, string> = {
  [WindowType.Hann]: "hann",
  [WindowType.Hamming]: "hamming",
  [WindowType.BlackmanHarris]: "blackmanharris62",
  [WindowType.Triangular]: "triangular",
};

export default class AnalyzeService extends Service {
  private _audioBuffer: AudioBuffer;
  private _essentia: EssentiaInstance | null = null;

  constructor(audioBuffer: AudioBuffer) {
    super();
    this._audioBuffer = audioBuffer;
  }

  public dispose(): void {
    const ess = this._essentia;
    if (ess) {
      try {
        ess.shutdown();
      } catch {
        /* ignore */
      }
      try {
        ess.delete();
      } catch {
        /* ignore */
      }
      this._essentia = null;
    }
    super.dispose();
  }

  public async initEssentia(): Promise<void> {
    if (this._essentia) {
      return;
    }
    try {
      // Use web-friendly async WASM load so main thread is not blocked
      // essentia-wasm.web.js exports EssentiaWASM as a factory function
      const essPkg = await import("essentia.js");
      /* eslint-disable @typescript-eslint/naming-convention */
      const essPkgUntyped = essPkg as unknown as {
        EssentiaWASM: () => Promise<unknown>;
        Essentia: new (wasm: unknown) => EssentiaInstance;
      };
      /* eslint-enable @typescript-eslint/naming-convention */
      const wasmModule = await essPkgUntyped.EssentiaWASM();
      this._essentia = new essPkgUntyped.Essentia(wasmModule);
    } catch {
      this._essentia = null;
    }
  }

  public get essentiaReady(): boolean {
    return this._essentia !== null;
  }

  public getLUFS(): number {
    if (!this._essentia) {
      return 0;
    }
    const numCh = this._audioBuffer.numberOfChannels;
    const leftData = this._audioBuffer.getChannelData(0);
    // EBU R128 needs stereo; mono files get the single channel duplicated
    const rightData =
      numCh >= 2 ? this._audioBuffer.getChannelData(1) : leftData;

    const leftVec = this._essentia.arrayToVector(leftData);
    const rightVec = this._essentia.arrayToVector(rightData);

    const result = this._essentia.LoudnessEBUR128(
      leftVec,
      rightVec,
      0.1,
      this._audioBuffer.sampleRate,
    );
    return result.integratedLoudness;
  }

  // round input value to the nearest nice number, which has the most significant digit of 1, 2, 5
  // return the number of decimal digits as well, for display purpose
  public static roundToNearestNiceNumber(input: number): [number, number] {
    const niceNumbers = [1.0, 2.0, 5.0, 10.0];

    if (input <= 0) {
      return [0, 0];
    } // this function only works for positive number

    // input = mantissa * 10^exponent
    const exponent = Math.floor(Math.log10(input));
    const mantissa = input / Math.pow(10, exponent);

    // find which number in niceNumbers is nearest
    const dist: number[] = niceNumbers.map((value) =>
      Math.abs(Math.log10(mantissa) - Math.log10(value)),
    );
    const niceNumber = niceNumbers[dist.indexOf(Math.min(...dist))];

    const rounded = niceNumber * Math.pow(10, exponent);
    let digit = niceNumber === 10.0 ? -exponent - 1 : -exponent;
    digit = digit <= 0 ? 0 : digit; // avoid -0

    return [rounded, digit];
  }

  private buildWindow(size: number, type: WindowType): Float32Array {
    const window = new Float32Array(size);
    switch (type) {
      case WindowType.Hann:
        for (let i = 0; i < size; i++) {
          window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
        }
        break;
      case WindowType.Hamming:
        for (let i = 0; i < size; i++) {
          window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / size);
        }
        break;
      case WindowType.BlackmanHarris:
        for (let i = 0; i < size; i++) {
          window[i] =
            0.35875 -
            0.48829 * Math.cos((2 * Math.PI * i) / size) +
            0.14128 * Math.cos((4 * Math.PI * i) / size) -
            0.01168 * Math.cos((6 * Math.PI * i) / size);
        }
        break;
      case WindowType.Triangular:
        for (let i = 0; i < size; i++) {
          window[i] = 1 - Math.abs((2 * i) / size - 1);
        }
        break;
    }
    return window;
  }

  public getSpectrogramColor(amp: number, low: number, high: number): string {
    if (amp === null || !Number.isFinite(amp)) {
      return "rgb(0,0,0)";
    }
    const classNum = 6;
    const range = high - low;
    if (range === 0) {
      return "rgb(0,0,0)";
    }
    // Map dB so low (quiet) → dark, high (loud, toward `high`) → bright (matches shader / user expectation).
    const a = Math.max(low, Math.min(high, amp));
    const pseudo = low + high - a;
    const classWidth = range / classNum;
    const ampClass = Math.min(
      classNum - 1,
      Math.max(0, Math.floor((pseudo - low) / classWidth)),
    );
    const classMinAmp = low + (ampClass + 1) * classWidth;
    const value = (pseudo - classMinAmp) / -classWidth;
    switch (ampClass) {
      case 0:
        return `rgb(255,255,${125 + Math.floor(value * 130)})`;
      case 1:
        return `rgb(255,${125 + Math.floor(value * 130)},125)`;
      case 2:
        return `rgb(255,${Math.floor(value * 125)},125)`;
      case 3:
        return `rgb(${125 + Math.floor(value * 130)},0,125)`;
      case 4:
        return `rgb(${Math.floor(value * 125)},0,125)`;
      case 5:
        return `rgb(0,0,${Math.floor(value * 125)})`;
      default:
        return `rgb(0,0,0)`;
    }
  }

  public analyze() {
    this.dispatchEvent(new CustomEvent(EventType.ANALYZE));
  }

  public getSpectrogram(ch: number, settings: AnalyzeSettingsProps) {
    if (this._essentia && settings.fftBackend === FftBackend.Essentia) {
      return this._getSpectrogramEssentia(ch, settings);
    }
    return this._getSpectrogramOoura(ch, settings);
  }

  private _getSpectrogramEssentia(
    ch: number,
    settings: AnalyzeSettingsProps,
  ): number[][] {
    const data = this._audioBuffer.getChannelData(ch);
    const sampleRate = this._audioBuffer.sampleRate;
    const windowSize = settings.windowSize;
    const df = sampleRate / windowSize;
    const minFreqIndex = Math.floor(settings.minFrequency / df);
    const maxFreqIndex = Math.min(
      Math.floor(settings.maxFrequency / df),
      windowSize / 2,
    );

    const startIndex = Math.floor(settings.minTime * sampleRate);
    const endIndex = Math.floor(settings.maxTime * sampleRate);

    const windowType = windowTypeMap[settings.windowType];
    let maxValue = Number.EPSILON;
    const spectrogram: number[][] = [];

    for (let i = startIndex; i < endIndex; i += settings.hopSize) {
      const s = i - windowSize / 2;
      const frame = new Float32Array(windowSize);
      for (let j = 0; j < windowSize; j++) {
        const idx = s + j;
        if (idx >= 0 && idx < data.length) {
          frame[j] = data[idx];
        }
      }

      const frameVec = this._essentia.arrayToVector(frame);
      // normalized=false to keep amplitude consistent with Ooura path
      const windowed = this._essentia.Windowing(
        frameVec,
        false,
        windowSize,
        windowType,
        0,
        false,
      );
      const specOut = this._essentia.Spectrum(windowed.frame, windowSize);
      const specArr = this._essentia.vectorToArray(specOut.spectrum);

      const ps: number[] = [];
      for (let j = minFreqIndex; j < maxFreqIndex; j++) {
        const v = specArr[j] * specArr[j];
        ps.push(v);
        if (maxValue < v) {
          maxValue = v;
        }
      }
      spectrogram.push(ps);
    }

    for (let i = 0; i < spectrogram.length; i++) {
      for (let j = 0; j < spectrogram[i].length; j++) {
        spectrogram[i][j] = 10 * Math.log10(spectrogram[i][j] / maxValue);
      }
    }
    return spectrogram;
  }

  private _getSpectrogramOoura(
    ch: number,
    settings: AnalyzeSettingsProps,
  ): number[][] {
    const data = this._audioBuffer.getChannelData(ch);
    const sampleRate = this._audioBuffer.sampleRate;

    const windowSize = settings.windowSize;
    const window = this.buildWindow(windowSize, settings.windowType);

    const startIndex = Math.floor(settings.minTime * sampleRate);
    const endIndex = Math.floor(settings.maxTime * sampleRate);

    const df = sampleRate / settings.windowSize;
    const minFreqIndex = Math.floor(settings.minFrequency / df);
    const maxFreqIndex = Math.min(
      Math.floor(settings.maxFrequency / df),
      Math.floor(windowSize / 2),
    );

    const ooura = new Ooura(windowSize, { type: "real", radix: 4 });

    let maxValue = Number.EPSILON;

    const spectrogram: number[][] = [];
    for (let i = startIndex; i < endIndex; i += settings.hopSize) {
      // i is center of the window
      const s = i - windowSize / 2,
        t = i + windowSize / 2;
      const ss = s > 0 ? s : 0,
        tt = t < data.length ? t : data.length;
      const d = ooura.scalarArrayFactory();
      for (let j = 0; j < d.length; j++) {
        if (s + j < ss) {
          continue;
        }
        if (tt < s + j) {
          continue;
        }
        d[j] = data[s + j] * window[j];
      }

      const re = ooura.vectorArrayFactory();
      const im = ooura.vectorArrayFactory();
      ooura.fft(d.buffer, re.buffer, im.buffer);

      const ps: number[] = [];
      for (let j = minFreqIndex; j < maxFreqIndex; j++) {
        const v = re[j] * re[j] + im[j] * im[j];
        ps.push(v);
        if (maxValue < v) {
          maxValue = v;
        }
      }

      spectrogram.push(ps);
    }

    for (let i = 0; i < spectrogram.length; i++) {
      for (let j = 0; j < spectrogram[i].length; j++) {
        spectrogram[i][j] = 10 * Math.log10(spectrogram[i][j] / maxValue);
      }
    }

    return spectrogram;
  }

  public getMelSpectrogram(ch: number, settings: AnalyzeSettingsProps) {
    if (this._essentia && settings.fftBackend === FftBackend.Essentia) {
      return this._getMelSpectrogramEssentia(ch, settings);
    }
    return this._getMelSpectrogramOoura(ch, settings);
  }

  private _getMelSpectrogramOoura(
    ch: number,
    settings: AnalyzeSettingsProps,
  ): number[][] {
    const data = this._audioBuffer.getChannelData(ch);
    const sampleRate = this._audioBuffer.sampleRate;

    const windowSize = settings.windowSize;
    const window = this.buildWindow(windowSize, settings.windowType);

    const startIndex = Math.floor(settings.minTime * sampleRate);
    const endIndex = Math.floor(settings.maxTime * sampleRate);

    const df = sampleRate / settings.windowSize;
    const minFreqIndex = Math.floor(
      AnalyzeService.hzToMel(settings.minFrequency) / df,
    );
    const maxFreqIndex = Math.floor(
      AnalyzeService.hzToMel(settings.maxFrequency) / df,
    );

    const ooura = new Ooura(windowSize, { type: "real", radix: 4 });

    const spectrogram: number[][] = [];
    for (let i = startIndex; i < endIndex; i += settings.hopSize) {
      // i is center of the window
      const s = i - windowSize / 2,
        t = i + windowSize / 2;
      const ss = s > 0 ? s : 0,
        tt = t < data.length ? t : data.length;

      const d = ooura.scalarArrayFactory();
      for (let j = 0; j < d.length; j++) {
        if (s + j < ss) {
          continue;
        }
        if (tt < s + j) {
          continue;
        }
        d[j] = data[s + j] * window[j];
      }

      const re = ooura.vectorArrayFactory();
      const im = ooura.vectorArrayFactory();
      ooura.fft(d.buffer, re.buffer, im.buffer);

      const spectrum: number[] = [];
      for (let j = 0; j < re.length; j++) {
        spectrum.push(re[j] * re[j] + im[j] * im[j]);
      }

      // Apply mel filter bank to the spectrum
      const melSpectrum = this.applyMelFilterBank(
        settings.melFilterNum,
        spectrum,
        sampleRate,
        minFreqIndex,
        maxFreqIndex,
      );

      spectrogram.push(melSpectrum);
    }

    let maxValue = Number.EPSILON;
    for (let i = 0; i < spectrogram.length; i++) {
      for (let j = 0; j < spectrogram[i].length; j++) {
        if (maxValue < spectrogram[i][j]) {
          maxValue = spectrogram[i][j];
        }
      }
    }

    for (let i = 0; i < spectrogram.length; i++) {
      for (let j = 0; j < spectrogram[i].length; j++) {
        spectrogram[i][j] = 10 * Math.log10(spectrogram[i][j] / maxValue);
      }
    }

    return spectrogram;
  }

  private _getMelSpectrogramEssentia(
    ch: number,
    settings: AnalyzeSettingsProps,
  ): number[][] {
    // Use essentia for the STFT part, then apply our JS Mel filter bank
    const data = this._audioBuffer.getChannelData(ch);
    const sampleRate = this._audioBuffer.sampleRate;
    const windowSize = settings.windowSize;
    const startIndex = Math.floor(settings.minTime * sampleRate);
    const endIndex = Math.floor(settings.maxTime * sampleRate);

    const df = sampleRate / windowSize;
    const minFreqIndex = Math.floor(
      AnalyzeService.hzToMel(settings.minFrequency) / df,
    );
    const maxFreqIndex = Math.floor(
      AnalyzeService.hzToMel(settings.maxFrequency) / df,
    );

    const windowType = windowTypeMap[settings.windowType];
    const spectrogram: number[][] = [];

    for (let i = startIndex; i < endIndex; i += settings.hopSize) {
      const s = i - windowSize / 2;
      const frame = new Float32Array(windowSize);
      for (let j = 0; j < windowSize; j++) {
        const idx = s + j;
        if (idx >= 0 && idx < data.length) {
          frame[j] = data[idx];
        }
      }

      const frameVec = this._essentia.arrayToVector(frame);
      const windowed = this._essentia.Windowing(
        frameVec,
        false,
        windowSize,
        windowType,
        0,
        false,
      );
      const specOut = this._essentia.Spectrum(windowed.frame, windowSize);
      const specArr = this._essentia.vectorToArray(specOut.spectrum);

      const spectrum: number[] = Array.from(specArr).map((v) => v * v);

      const melSpectrum = this.applyMelFilterBank(
        settings.melFilterNum,
        spectrum,
        sampleRate,
        minFreqIndex,
        maxFreqIndex,
      );
      spectrogram.push(melSpectrum);
    }

    let maxValue = Number.EPSILON;
    for (const frame of spectrogram) {
      for (const v of frame) {
        if (maxValue < v) {
          maxValue = v;
        }
      }
    }
    for (let i = 0; i < spectrogram.length; i++) {
      for (let j = 0; j < spectrogram[i].length; j++) {
        spectrogram[i][j] = 10 * Math.log10(spectrogram[i][j] / maxValue);
      }
    }
    return spectrogram;
  }

  private applyMelFilterBank(
    numFilters: number,
    spectrum: number[],
    sampleRate: number,
    minFreqIndex: number,
    maxFreqIndex: number,
  ) {
    const minMel = AnalyzeService.hzToMel(
      (minFreqIndex * sampleRate) / spectrum.length,
    );
    const maxMel = AnalyzeService.hzToMel(
      (maxFreqIndex * sampleRate) / spectrum.length,
    );
    const melStep = (maxMel - minMel) / (numFilters + 1);

    const filterBank: number[][] = [];
    for (let i = 0; i < numFilters; i++) {
      const filter: number[] = [];
      const startMel = minMel + i * melStep;
      const centerMel = minMel + (i + 1) * melStep;
      const endMel = minMel + (i + 2) * melStep;
      const startIndex = Math.round(
        (AnalyzeService.melToHz(startMel) * spectrum.length) / sampleRate,
      );
      const centerIndex = Math.round(
        (AnalyzeService.melToHz(centerMel) * spectrum.length) / sampleRate,
      );
      const endIndex = Math.round(
        (AnalyzeService.melToHz(endMel) * spectrum.length) / sampleRate,
      );
      for (let j = 0; j < spectrum.length; j++) {
        if (j < startIndex || j > endIndex) {
          filter.push(0);
        } else if (j < centerIndex) {
          filter.push((j - startIndex) / (centerIndex - startIndex));
        } else {
          filter.push((endIndex - j) / (endIndex - centerIndex));
        }
      }
      filterBank.push(filter);
    }

    const melSpectrum: number[] = [];
    for (let i = 0; i < numFilters; i++) {
      let sum = 0;
      for (let j = 0; j < spectrum.length; j++) {
        sum += spectrum[j] * filterBank[i][j];
      }
      melSpectrum.push(sum);
    }

    return melSpectrum;
  }

  public static hzToMel(hz: number) {
    return 2595 * Math.log10(1 + hz / 700);
  }

  public static melToHz(mel: number) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
  }

  /** Window bounds for cursor readout / true-peak (same as {@link windowRmsPeak}). */
  public static windowBounds(
    dataLength: number,
    centerSample: number,
    windowSamples: number,
  ): { start: number; end: number } {
    const n = dataLength;
    if (n < 1 || windowSamples < 1) {
      return { start: 0, end: 0 };
    }
    const take = Math.min(windowSamples, n);
    const half = Math.floor(take / 2);
    let start = Math.min(Math.max(0, centerSample - half), n - take);
    const end = Math.min(n, start + take);
    start = Math.max(0, end - take);
    return { start, end };
  }

  /** RMS and peak of `data` over `windowSamples` centered at `centerSample` (clamped to buffer). */
  public static windowRmsPeak(
    data: Float32Array,
    centerSample: number,
    windowSamples: number,
  ): { rms: number; peak: number } {
    const n = data.length;
    if (n < 1 || windowSamples < 1) {
      return { rms: 0, peak: 0 };
    }
    const { start, end } = AnalyzeService.windowBounds(
      n,
      centerSample,
      windowSamples,
    );
    let sumSq = 0;
    let peak = 0;
    const span = end - start;
    for (let i = start; i < end; i++) {
      const v = data[i];
      const a = Math.abs(v);
      if (peak < a) {
        peak = a;
      }
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, span));
    return { rms, peak };
  }

  /** Map spectrogram canvas Y (top = 0) to Hz; matches selection / axis logic. */
  public static spectrogramCursorYToHz(
    yFromTop: number,
    height: number,
    frequencyScale: FrequencyScale,
    minF: number,
    maxF: number,
  ): number {
    if (height <= 0) {
      return minF;
    }
    const y = Math.min(Math.max(0, yFromTop), height);
    switch (frequencyScale) {
      case FrequencyScale.Linear: {
        const range = maxF - minF;
        return (1 - y / height) * range + minF;
      }
      case FrequencyScale.Log: {
        const bounds = piecewiseLogAxisBoundaries(minF, maxF);
        const yNorm = canvasYTopToLogPiecewiseYNorm(y, height);
        return piecewiseYNormToHz(yNorm, bounds);
      }
      case FrequencyScale.Mel: {
        const melMin = AnalyzeService.hzToMel(minF);
        const melMax = AnalyzeService.hzToMel(maxF);
        const melSpan = melMax - melMin;
        const mel = melMin + (1 - y / height) * melSpan;
        return AnalyzeService.melToHz(mel);
      }
      default: {
        const range = maxF - minF;
        return (1 - y / height) * range + minF;
      }
    }
  }
}
