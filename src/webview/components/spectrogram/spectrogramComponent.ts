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
  hybridHzFromNorm,
  clampFrequencyScaleHybridRatio,
} from "../../spectrogramFrequencyLayout";

/** GPU texture/canvas safety caps for the supersampled backing store
    (desktop WebGL2 implementations expose ≥ 16384; stay conservative). */
const maxSpectrogramCanvasPx = 8192;
const maxSpectrogramCanvasHeightPx = 4096;

/** Axis label font size (px in backing pixels) keeps the design ratio of
    20px per 600px canvas height at any resolution / dpr. */
function axisFontPx(canvasHeight: number): string {
  return `${Math.max(8, Math.round((canvasHeight / 600) * 20))}px Arial`;
}

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

    /* The canvases are CSS-stretched to their container (figure.css), so the
       backing store must outrun the display resolution: supersample by
       dpr × 1.5 (capped) — zoomed-in regions stay sharp instead of showing
       stretched canvas pixels, and axis labels render at full fidelity. */
    const backingScale = Math.min((window.devicePixelRatio || 1) * 1.5, 3);
    const backingW = Math.min(
      maxSpectrogramCanvasPx,
      Math.max(2, Math.round(width * backingScale)),
    );
    const backingH = Math.min(
      maxSpectrogramCanvasHeightPx,
      Math.max(2, Math.round(height * backingScale)),
    );

    const canvas = document.createElement("canvas");
    canvas.className = "mainCanvas";
    canvas.width = backingW;
    canvas.height = backingH;
    componentRoot.appendChild(canvas);

    const axisCanvas = document.createElement("canvas");
    axisCanvas.className = "axisCanvas";
    axisCanvas.width = backingW;
    axisCanvas.height = backingH;
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
      case FrequencyScale.Hybrid:
        this.drawHybridAxis(axisCanvas, settings, ch, numOfCh);
        if (isWebGL2Supported(canvas)) {
          this.drawSpectrogramWebGL(
            canvas,
            sampleRate,
            settings,
            ch,
            FrequencyScale.Hybrid,
          );
        } else {
          this.drawHybridSpectrogram(canvas, sampleRate, settings, ch);
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
      scale === FrequencyScale.Log
        ? 1
        : scale === FrequencyScale.Mel
          ? 2
          : scale === FrequencyScale.Hybrid
            ? 3
            : 0;
    const hybridRatio = clampFrequencyScaleHybridRatio(
      settings.frequencyScaleHybridRatio,
    );
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
        hybridRatio,
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
      } else if (scale === FrequencyScale.Hybrid) {
        this.drawHybridSpectrogram(canvas, sampleRate, settings, ch);
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
    axisContext.font = axisFontPx(axisCanvas.height);

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
    axisContext.font = axisFontPx(axisCanvas.height);

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

  private drawHybridAxis(
    axisCanvas: HTMLCanvasElement,
    settings: AnalyzeSettingsProps,
    ch: number,
    numOfCh: number,
  ) {
    // draw horizontal axis
    this.drawTimeAxis(axisCanvas, settings);

    // Vertical axis: even pixel rows, labels from the hybrid Hz mapping so
    // ticks always sit exactly on the grid lines the shader draws.
    const axisContext = axisCanvas.getContext("2d");
    const width = axisCanvas.width;
    const height = axisCanvas.height;
    axisContext.font = axisFontPx(axisCanvas.height);

    const minFreq = settings.minFrequency;
    const maxFreq = settings.maxFrequency;
    const ratio = settings.frequencyScaleHybridRatio;
    const numAxes = Math.round(10 * settings.spectrogramVerticalScale);
    for (let i = 0; i < numAxes; i++) {
      const yNorm = i / numAxes;
      const freq = hybridHzFromNorm(yNorm, minFreq, maxFreq, ratio);
      const y = height - yNorm * height;
      axisContext.fillStyle = "rgb(245,130,32)";
      axisContext.fillText(`${Math.trunc(freq)}`, 4, y - 4);

      axisContext.fillStyle = "rgb(180,120,20)";
      for (let j = 0; j < width; j++) {
        axisContext.fillRect(j, y, 2, 2);
      }
    }

    // draw channel label
    this.drawChannelLabel(axisCanvas, ch, numOfCh);
  }

  private drawHybridSpectrogram(
    canvas: HTMLCanvasElement,
    sampleRate: number,
    settings: AnalyzeSettingsProps,
    ch: number,
  ) {
    /* Canvas2D fallback (no WebGL2): resample by output row instead of by
       input bin — the hybrid mapping is closed-form norm→Hz, so each pixel
       row fetches its nearest STFT bin directly. */
    const context = canvas.getContext("2d", { alpha: false });
    const spectrogram = this._analyzeService.getSpectrogram(ch, settings);
    const width = canvas.width;
    const height = canvas.height;

    const wholeSampleNum = (settings.maxTime - settings.minTime) * sampleRate;
    const rectWidth = (width * settings.hopSize) / wholeSampleNum;
    const rowH = Math.max(1, Math.round(height / 400));

    const df = sampleRate / settings.windowSize;
    const minFreqIndex = Math.floor(settings.minFrequency / df);
    const numBins = spectrogram[0].length;
    const minF = settings.minFrequency;
    const maxF = settings.maxFrequency;
    const ratio = settings.frequencyScaleHybridRatio;

    for (let i = 0; i < spectrogram.length; i++) {
      const x = i * rectWidth;
      const frame = spectrogram[i];
      for (let yTop = 0; yTop < height; yTop += rowH) {
        const yNorm = 1 - yTop / height;
        const hz = hybridHzFromNorm(yNorm, minF, maxF, ratio);
        const bin = Math.min(
          Math.max(0, Math.round(hz / df) - minFreqIndex),
          numBins - 1,
        );
        context.fillStyle = this._analyzeService.getSpectrogramColor(
          frame[bin],
          settings.spectrogramAmplitudeLow,
          settings.spectrogramAmplitudeHigh,
        );
        context.fillRect(x, yTop, rectWidth, rowH);
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
    axisContext.font = axisFontPx(axisCanvas.height);

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
    axisContext.font = axisFontPx(axisCanvas.height);

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
    axisContext.font = axisFontPx(axisCanvas.height);

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
