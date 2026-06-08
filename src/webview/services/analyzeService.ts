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
import EssentiaHostClient, {
  type StftSettingsWire,
} from "./essentiaHostClient";
import {
  essentiaWindowNames,
  sliceStftFrequencyBand,
} from "../../shared/stftEssentiaCompute";

export default class AnalyzeService extends Service {
  private _audioBuffer: AudioBuffer;
  private _essentiaHostClient: EssentiaHostClient | null = null;

  constructor(audioBuffer: AudioBuffer) {
    super();
    this._audioBuffer = audioBuffer;
  }

  public attachEssentiaHostClient(client: EssentiaHostClient): void {
    this._essentiaHostClient = client;
  }

  public shareHostClientWith(other: AnalyzeService): void {
    if (this._essentiaHostClient) {
      other.attachEssentiaHostClient(this._essentiaHostClient);
    }
  }

  public dispose(): void {
    this._essentiaHostClient = null;
    super.dispose();
  }

  /** @deprecated Essentia runs in Extension Host; no webview init required. */
  public async initEssentia(): Promise<void> {
    return;
  }

  public get essentiaReady(): boolean {
    return this._essentiaHostClient !== null;
  }

  public get audioBuffer(): AudioBuffer {
    return this._audioBuffer;
  }

  private _stftWireFromSettings(
    settings: AnalyzeSettingsProps,
  ): StftSettingsWire {
    return {
      windowSize: settings.windowSize,
      windowType: essentiaWindowNames[settings.windowType] ?? "hann",
      hopSize: settings.hopSize,
      minTime: settings.minTime,
      maxTime: settings.maxTime,
      minFrequency: settings.minFrequency,
      maxFrequency: settings.maxFrequency,
    };
  }

  /** Pre-fetch Essentia STFT from Extension Host (required before getSpectrogram when fftBackend=Essentia). */
  public async ensureHostStftReady(
    ch: number,
    settings: AnalyzeSettingsProps,
  ): Promise<void> {
    if (
      settings.fftBackend !== FftBackend.Essentia ||
      !this._essentiaHostClient
    ) {
      return;
    }
    const wire = this._stftWireFromSettings(settings);
    if (
      this._essentiaHostClient.getCached(
        ch,
        this._audioBuffer.sampleRate,
        this._audioBuffer.length,
        wire,
      )
    ) {
      return;
    }
    const data = this._audioBuffer.getChannelData(ch);
    await this._essentiaHostClient.requestStft(
      ch,
      data,
      this._audioBuffer.sampleRate,
      wire,
    );
  }

  private _getHostFullSpectrogram(
    ch: number,
    settings: AnalyzeSettingsProps,
  ): number[][] | null {
    if (!this._essentiaHostClient) {
      return null;
    }
    const wire = this._stftWireFromSettings(settings);
    return (
      this._essentiaHostClient.getCached(
        ch,
        this._audioBuffer.sampleRate,
        this._audioBuffer.length,
        wire,
      ) ?? null
    );
  }

  public getLUFS(): number {
    return 0;
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
    if (settings.fftBackend === FftBackend.Essentia) {
      const full = this._getHostFullSpectrogram(ch, settings);
      if (!full?.length) {
        return [];
      }
      return sliceStftFrequencyBand(
        full,
        this._audioBuffer.sampleRate,
        settings.windowSize,
        settings.minFrequency,
        settings.maxFrequency,
      );
    }
    return this._getSpectrogramOoura(ch, settings);
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
    if (settings.fftBackend === FftBackend.Essentia) {
      return this._getMelSpectrogramFromHost(ch, settings);
    }
    return this._getMelSpectrogramOoura(ch, settings);
  }

  private _getMelSpectrogramFromHost(
    ch: number,
    settings: AnalyzeSettingsProps,
  ): number[][] {
    const full = this._getHostFullSpectrogram(ch, settings);
    if (!full?.length) {
      return [];
    }
    const sampleRate = this._audioBuffer.sampleRate;
    const df = sampleRate / settings.windowSize;
    const minFreqIndex = Math.floor(
      AnalyzeService.hzToMel(settings.minFrequency) / df,
    );
    const maxFreqIndex = Math.floor(
      AnalyzeService.hzToMel(settings.maxFrequency) / df,
    );

    const spectrogram: number[][] = [];
    for (const row of full) {
      const spectrum: number[] = row.map((db) => {
        const linear = Math.pow(10, db / 10);
        return linear;
      });
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
