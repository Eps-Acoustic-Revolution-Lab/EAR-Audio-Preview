import "../../styles/figure.css";
import AnalyzeService from "../../services/analyzeService";
import {
  FrequencyScale,
  AnalyzeSettingsProps,
} from "../../services/analyzeSettingsService";
import {
  SpectrogramRenderer,
  isWebGL2Supported,
  padLogBounds,
} from "./spectrogramRenderer";
import {
  hzToPiecewiseEqualSegmentY,
  piecewiseLogAxisBoundaries,
} from "../../spectrogramFrequencyLayout";

export default class WaveFormComponent {
  private _analyzeService: AnalyzeService;

  constructor(
    componentRootSelector: string,
    width: number,
    height: number,
    analyzeService: AnalyzeService,
    settings: AnalyzeSettingsProps,
    sampleRate: number,
    ch: number,
    numOfCh: number,
  ) {
    const componentRoot = document.querySelector(componentRootSelector);
    this._analyzeService = analyzeService;

    const canvas = document.createElement("canvas");
    canvas.className = "mainCanvas";
    canvas.width = width;
    canvas.height = height;
    componentRoot.appendChild(canvas);

    const axisCanvas = document.createElement("canvas");
    axisCanvas.className = "axisCanvas";
    axisCanvas.width = width;
    axisCanvas.height = height;
    componentRoot.appendChild(axisCanvas);

    switch (settings.frequencyScale) {
      case FrequencyScale.Linear:
        this.drawLinearAxis(axisCanvas, settings, ch, numOfCh);
        if (isWebGL2Supported(canvas)) {
          this.drawSpectrogramWebGL(
            canvas,
            sampleRate,
            settings,
            ch,
            FrequencyScale.Linear,
          );
        } else {
          this.drawLinearSpectrogram(canvas, sampleRate, settings, ch);
        }
        break;
      case FrequencyScale.Log:
        this.drawLogAxis(axisCanvas, settings, ch, numOfCh);
        if (isWebGL2Supported(canvas)) {
          this.drawSpectrogramWebGL(
            canvas,
            sampleRate,
            settings,
            ch,
            FrequencyScale.Log,
          );
        } else {
          this.drawLogSpectrogram(canvas, sampleRate, settings, ch);
        }
        break;
      case FrequencyScale.Mel:
        this.drawMelAxis(axisCanvas, settings, ch, numOfCh);
        if (isWebGL2Supported(canvas)) {
          this.drawSpectrogramWebGL(
            canvas,
            sampleRate,
            settings,
            ch,
            FrequencyScale.Mel,
          );
        } else {
          this.drawMelSpectrogram(canvas, sampleRate, settings, ch);
        }
        break;
    }
  }

  private drawSpectrogramWebGL(
    canvas: HTMLCanvasElement,
    sampleRate: number,
    settings: AnalyzeSettingsProps,
    ch: number,
    scale: FrequencyScale,
  ) {
    const spectrogram =
      scale === FrequencyScale.Mel
        ? this._analyzeService.getMelSpectrogram(ch, settings)
        : this._analyzeService.getSpectrogram(ch, settings);

    const fMin = settings.minFrequency;
    const fMax = settings.maxFrequency;
    const eps = 1e-6;
    const logMin = Math.log10(Math.max(fMin, eps));
    const logMax = Math.log10(Math.max(fMax, 1e-6));
    const melMin = AnalyzeService.hzToMel(fMin);
    const melMax = AnalyzeService.hzToMel(fMax);
    const freqMode =
      scale === FrequencyScale.Log ? 1 : scale === FrequencyScale.Mel ? 2 : 0;
    const logBounds = piecewiseLogAxisBoundaries(fMin, fMax);
    const { count: logBoundCount, padded: logBoundsPadded } =
      padLogBounds(logBounds);

    try {
      const renderer = new SpectrogramRenderer(canvas);
      renderer.render(
        spectrogram,
        settings.spectrogramAmplitudeLow,
        settings.spectrogramAmplitudeHigh,
        freqMode,
        fMin,
        fMax,
        logMin,
        logMax,
        melMin,
        melMax,
        logBoundCount,
        logBoundsPadded,
      );
      renderer.dispose();
    } catch {
      // WebGL2 init failed at runtime – fall back to Canvas2D
      if (scale === FrequencyScale.Linear) {
        this.drawLinearSpectrogram(canvas, sampleRate, settings, ch);
      } else if (scale === FrequencyScale.Log) {
        this.drawLogSpectrogram(canvas, sampleRate, settings, ch);
      } else {
        this.drawMelSpectrogram(canvas, sampleRate, settings, ch);
      }
    }
  }

  private drawLinearAxis(
    axisCanvas: HTMLCanvasElement,
    settings: AnalyzeSettingsProps,
    ch: number,
    numOfCh: number,
  ) {
    // draw horizontal axis
    this.drawTimeAxis(axisCanvas, settings);

    // draw vertical axis
    const axisContext = axisCanvas.getContext("2d");
    const width = axisCanvas.width;
    const height = axisCanvas.height;
    axisContext.font = `20px Arial`;

    const minFreq = settings.minFrequency;
    const maxFreq = settings.maxFrequency;
    const scale = (maxFreq - minFreq) / height;
    const numAxes = Math.round(10 * settings.spectrogramVerticalScale);
    for (let i = 0; i < numAxes; i++) {
      axisContext.fillStyle = "rgb(245,130,32)";
      const freq = minFreq + (i * (maxFreq - minFreq)) / numAxes;
      const y = height - (freq - minFreq) / scale;
      axisContext.fillText(`${Math.trunc(freq)}`, 4, y - 4);

      axisContext.fillStyle = "rgb(180,120,20)";
      for (let j = 0; j < width; j++) {
        axisContext.fillRect(j, y, 2, 2);
      }
    }

    // draw channel label
    this.drawChannelLabel(axisCanvas, ch, numOfCh);
  }

  private drawLinearSpectrogram(
    canvas: HTMLCanvasElement,
    sampleRate: number,
    settings: AnalyzeSettingsProps,
    ch: number,
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    const spectrogram = this._analyzeService.getSpectrogram(ch, settings);
    const width = canvas.width;
    const height = canvas.height;

    const wholeSampleNum = (settings.maxTime - settings.minTime) * sampleRate;
    const rectWidth = (width * settings.hopSize) / wholeSampleNum;
    const rectHeight = height / spectrogram[0].length;

    for (let i = 0; i < spectrogram.length; i++) {
      const x = i * rectWidth;
      for (let j = 0; j < spectrogram[i].length; j++) {
        const y = height - (j + 1) * rectHeight;
        const value = spectrogram[i][j];
        context.fillStyle = this._analyzeService.getSpectrogramColor(
          value,
          settings.spectrogramAmplitudeLow,
          settings.spectrogramAmplitudeHigh,
        );
        context.fillRect(x, y, rectWidth, rectHeight);
      }
    }
  }

  private drawLogAxis(
    axisCanvas: HTMLCanvasElement,
    settings: AnalyzeSettingsProps,
    ch: number,
    numOfCh: number,
  ) {
    // draw horizontal axis
    this.drawTimeAxis(axisCanvas, settings);

    // Vertical axis: endpoints fixed at settings min/max Hz; ticks 0 (if allowed), 100, 200, 400, …
    const axisContext = axisCanvas.getContext("2d");
    const width = axisCanvas.width;
    const height = axisCanvas.height;
    axisContext.font = `20px Arial`;

    const minF = settings.minFrequency;
    const maxF = settings.maxFrequency;
    const bounds = piecewiseLogAxisBoundaries(minF, maxF);
    const n = bounds.length;
    const segH = n > 1 ? height / (n - 1) : height;
    for (let k = 0; k < n; k++) {
      const y = height - k * segH;
      axisContext.fillStyle = "rgb(245,130,32)";
      axisContext.fillText(`${Math.trunc(bounds[k])}`, 4, y - 4);

      axisContext.fillStyle = "rgb(180,120,20)";
      for (let j = 0; j < width; j++) {
        axisContext.fillRect(j, y, 2, 2);
      }
    }

    // draw channel label
    this.drawChannelLabel(axisCanvas, ch, numOfCh);
  }

  private drawLogSpectrogram(
    canvas: HTMLCanvasElement,
    sampleRate: number,
    settings: AnalyzeSettingsProps,
    ch: number,
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    const spectrogram = this._analyzeService.getSpectrogram(ch, settings);
    const width = canvas.width;
    const height = canvas.height;

    const wholeSampleNum = (settings.maxTime - settings.minTime) * sampleRate;
    const rectWidth = (width * settings.hopSize) / wholeSampleNum;

    const df = sampleRate / settings.windowSize;
    const minF = settings.minFrequency;
    const maxF = settings.maxFrequency;
    const bounds = piecewiseLogAxisBoundaries(minF, maxF);

    const minFreqIndex = Math.floor(settings.minFrequency / df);

    for (let i = 0; i < spectrogram.length; i++) {
      const x = i * rectWidth;
      for (let j = 0; j < spectrogram[i].length; j++) {
        const absJ = j + minFreqIndex;
        const freq = absJ * df;
        const prevFreq = Math.max(1e-6, (absJ - 1) * df);
        const y0 = hzToPiecewiseEqualSegmentY(freq, bounds, height);
        const y1 = hzToPiecewiseEqualSegmentY(prevFreq, bounds, height);
        const top = Math.min(y0, y1);
        const rectHeight = Math.max(1, Math.abs(y1 - y0));

        const value = spectrogram[i][j];
        context.fillStyle = this._analyzeService.getSpectrogramColor(
          value,
          settings.spectrogramAmplitudeLow,
          settings.spectrogramAmplitudeHigh,
        );
        context.fillRect(x, top, rectWidth, rectHeight);
      }
    }
  }

  private drawMelAxis(
    axisCanvas: HTMLCanvasElement,
    settings: AnalyzeSettingsProps,
    ch: number,
    numOfCh: number,
  ) {
    // draw horizontal axis
    this.drawTimeAxis(axisCanvas, settings);

    // draw vertical axis
    const axisContext = axisCanvas.getContext("2d");
    const width = axisCanvas.width;
    const height = axisCanvas.height;
    axisContext.font = `20px Arial`;

    const numAxes = Math.round(10 * settings.spectrogramVerticalScale);
    const minMel = AnalyzeService.hzToMel(settings.minFrequency);
    const maxMel = AnalyzeService.hzToMel(settings.maxFrequency);
    const melSpan = maxMel - minMel;
    if (melSpan <= 0) {
      this.drawChannelLabel(axisCanvas, ch, numOfCh);
      return;
    }
    for (let i = 0; i <= numAxes; i++) {
      const mel = minMel + (i * melSpan) / numAxes;
      const f = AnalyzeService.melToHz(mel);
      const y = height - ((mel - minMel) / melSpan) * height;

      axisContext.fillStyle = "rgb(245,130,32)";
      axisContext.fillText(`${Math.trunc(f)}`, 4, y - 4);

      axisContext.fillStyle = "rgb(180,120,20)";
      for (let j = 0; j < width; j++) {
        axisContext.fillRect(j, y, 2, 2);
      }
    }

    // draw channel label
    this.drawChannelLabel(axisCanvas, ch, numOfCh);
  }

  private drawMelSpectrogram(
    canvas: HTMLCanvasElement,
    sampleRate: number,
    settings: AnalyzeSettingsProps,
    ch: number,
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    const spectrogram = this._analyzeService.getMelSpectrogram(ch, settings);
    const width = canvas.width;
    const height = canvas.height;

    const wholeSampleNum = (settings.maxTime - settings.minTime) * sampleRate;
    const rectWidth = (width * settings.hopSize) / wholeSampleNum;
    const rectHeight = height / spectrogram[0].length;

    for (let i = 0; i < spectrogram.length; i++) {
      const x = i * rectWidth;
      for (let j = 0; j < spectrogram[i].length; j++) {
        const y = height - (j + 1) * rectHeight;
        const value = spectrogram[i][j];
        context.fillStyle = this._analyzeService.getSpectrogramColor(
          value,
          settings.spectrogramAmplitudeLow,
          settings.spectrogramAmplitudeHigh,
        );
        context.fillRect(x, y, rectWidth, rectHeight);
      }
    }
  }

  private drawTimeAxis(
    axisCanvas: HTMLCanvasElement,
    settings: AnalyzeSettingsProps,
  ) {
    const axisContext = axisCanvas.getContext("2d");
    const width = axisCanvas.width;
    const height = axisCanvas.height;
    axisContext.font = `20px Arial`;

    const [niceT, digit] = AnalyzeService.roundToNearestNiceNumber(
      (settings.maxTime - settings.minTime) / 10,
    );
    const dx = width / (settings.maxTime - settings.minTime);
    const t0 = Math.ceil(settings.minTime / niceT) * niceT;
    const numAxis = Math.floor((settings.maxTime - settings.minTime) / niceT);
    for (let i = 0; i <= numAxis; i++) {
      const t = t0 + niceT * i;
      const x = (t - settings.minTime) * dx;

      axisContext.fillStyle = "rgb(245,130,32)";
      if (width * (5 / 100) < x && x < width * (95 / 100)) {
        axisContext.fillText(`${t.toFixed(digit)}`, x, 18);
      } // don't draw near the edge

      axisContext.fillStyle = "rgb(180,120,20)";
      for (let j = 0; j < height; j++) {
        axisContext.fillRect(x, j, 1, 1);
      }
    }
  }

  private drawChannelLabel(
    axisCanvas: HTMLCanvasElement,
    ch: number,
    numOfCh: number,
  ) {
    const axisContext = axisCanvas.getContext("2d");
    axisContext.font = `20px Arial`;

    if (numOfCh > 1) {
      let channelText = "";
      if (numOfCh === 2) {
        channelText = ch === 0 ? "Lch" : "Rch";
      } else {
        channelText = "ch" + String(ch + 1);
      }

      axisContext.fillStyle = "rgb(220, 220, 220)";
      axisContext.fillText(channelText, 60, 18);
    }
  }
}
