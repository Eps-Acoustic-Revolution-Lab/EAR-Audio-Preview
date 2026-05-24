import "../../styles/figure.css";
import AnalyzeService from "../../services/analyzeService";
import { AnalyzeSettingsProps } from "../../services/analyzeSettingsService";

export default class WaveFormComponent {
  public static readonly MIN_DATA_POINTS_PER_PIXEL = 5;

  constructor(
    componentRootSelector: string,
    width: number,
    height: number,
    settings: AnalyzeSettingsProps,
    sampleRate: number,
    channelData: Float32Array,
    ch: number,
    numOfCh: number,
  ) {
    const componentRoot = document.querySelector(
      componentRootSelector,
    ) as HTMLElement;
    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      2,
    );

    /** Match layout width so the bitmap is not narrower than the flex-stretched box (avoids empty right margin). */
    const layoutW = Math.max(
      1,
      Math.floor(
        componentRoot.clientWidth ||
          componentRoot.getBoundingClientRect().width,
      ) || width,
    );

    const canvasW = Math.max(1, Math.floor(layoutW * dpr));
    const canvasH = Math.max(1, Math.floor(height * dpr));

    const canvas = document.createElement("canvas");
    canvas.className = "mainCanvas";
    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.style.width = "100%";
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d", { alpha: false });
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "rgb(160,60,200)";
    context.strokeStyle = "rgb(160,60,200)";
    componentRoot.appendChild(canvas);

    const axisCanvas = document.createElement("canvas");
    axisCanvas.className = "axisCanvas";
    axisCanvas.width = canvasW;
    axisCanvas.height = canvasH;
    axisCanvas.style.width = "100%";
    axisCanvas.style.height = `${height}px`;
    const axisContext = axisCanvas.getContext("2d");
    axisContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    axisContext.font = `12px Arial`;
    componentRoot.appendChild(axisCanvas);

    // draw horizontal axis
    const [niceT, digitT] = AnalyzeService.roundToNearestNiceNumber(
      (settings.maxTime - settings.minTime) / 10,
    );
    const dx = layoutW / (settings.maxTime - settings.minTime);
    const t0 = Math.ceil(settings.minTime / niceT) * niceT;
    const numTAxis = Math.floor((settings.maxTime - settings.minTime) / niceT);
    for (let i = 0; i <= numTAxis; i++) {
      const t = t0 + niceT * i;
      const x = (t - settings.minTime) * dx;

      axisContext.fillStyle = "rgb(245,130,32)";
      if (layoutW * (5 / 100) < x && x < layoutW * (95 / 100)) {
        axisContext.fillText(`${t.toFixed(digitT)}`, x, 10);
      } // don't draw near the edge

      axisContext.fillStyle = "rgb(180,120,20)";
      for (let j = 0; j < height; j++) {
        axisContext.fillRect(x, j, 1, 1);
      }
    }

    // draw vertical axis
    const [niceA, digitA] = AnalyzeService.roundToNearestNiceNumber(
      (settings.maxAmplitude - settings.minAmplitude) /
        (10 * settings.waveformVerticalScale),
    );
    const dy = height / (settings.maxAmplitude - settings.minAmplitude);
    const a0 = Math.ceil(settings.minAmplitude / niceA) * niceA;
    const numAAxis = Math.floor(
      (settings.maxAmplitude - settings.minAmplitude) / niceA,
    );
    for (let i = 0; i <= numAAxis; i++) {
      const a = a0 + niceA * i;
      const y = height - (a - settings.minAmplitude) * dy;

      axisContext.fillStyle = "rgb(245,130,32)";
      if (12 < y && y < height) {
        axisContext.fillText(`${a.toFixed(digitA)}`, 4, y - 2);
      } // don't draw near the edge

      axisContext.fillStyle = "rgb(180,120,20)";
      if (12 < y && y < height) {
        for (let j = 0; j < layoutW; j++) {
          axisContext.fillRect(j, y, 1, 1);
        }
      }
    }

    const startIndex = Math.floor(settings.minTime * sampleRate);
    const endIndex = Math.min(
      Math.floor(settings.maxTime * sampleRate),
      channelData.length,
    );
    const n = Math.max(0, endIndex - startIndex);
    const ar = settings.maxAmplitude - settings.minAmplitude;

    if (n > 0 && ar > 0 && layoutW > 0) {
      const ymin = new Float32Array(layoutW).fill(Number.POSITIVE_INFINITY);
      const ymax = new Float32Array(layoutW).fill(Number.NEGATIVE_INFINITY);
      const maxSamplesPerColumn = 16384;
      for (let col = 0; col < layoutW; col++) {
        const t0i = Math.floor((col / layoutW) * n);
        const t1i = Math.min(n, Math.ceil(((col + 1) / layoutW) * n));
        const span = Math.max(1, t1i - t0i);
        const step = Math.max(1, Math.ceil(span / maxSamplesPerColumn));
        for (let k = t0i; k < t1i; k += step) {
          const v = channelData[startIndex + k];
          if (v < ymin[col]) {
            ymin[col] = v;
          }
          if (v > ymax[col]) {
            ymax[col] = v;
          }
        }
      }

      context.fillStyle = "rgb(160,60,200)";
      for (let col = 0; col < layoutW; col++) {
        const lo = ymin[col];
        const hi = ymax[col];
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
          continue;
        }
        const yLo = height * (1 - (hi - settings.minAmplitude) / ar);
        const yHi = height * (1 - (lo - settings.minAmplitude) / ar);
        let top = Math.min(yLo, yHi);
        let bot = Math.max(yLo, yHi);
        top = Math.max(0, Math.min(height, top));
        bot = Math.max(0, Math.min(height, bot));
        const h = Math.max(1, bot - top);
        context.fillRect(col, top, 1, h);
      }
    }

    // draw channel label
    if (numOfCh > 1) {
      let channelText = "";
      if (numOfCh === 2) {
        channelText = ch === 0 ? "Lch" : "Rch";
      } else {
        channelText = "ch" + String(ch + 1);
      }

      axisContext.font = `12px Arial`;
      axisContext.fillStyle = "rgb(220, 220, 220)";
      axisContext.fillText(channelText, 33, 10);
    }
  }
}
