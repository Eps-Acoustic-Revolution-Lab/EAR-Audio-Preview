import { EventType } from "../../events";
import Component from "../../component";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import {
  applyMonitoringToTimeDomain,
} from "../../utils/liveMonitoring";
import {
  emaDecayFromReleaseDbPerSec,
  peakFallDbPerFrameFromRelease,
  scatterAlphaDecayFromReleaseDbPerSec,
  scatterFadeOverlayAlphaFromReleaseDbPerSec,
} from "../../utils/liveBallistics";
import {
  clipCircle,
  clipUpperSemicircle,
  computeInstantPolarBins,
  interpolatePolarRmsAtAngle,
  isInPhaseStereoAngle,
  polarBinToAngleRad,
  polarFieldCanvasXY,
  polarLevelDrawLength,
  polarLevelDrawNorm,
  polarLevelDisplayScaleDecay,
  polarSampleDisplayRadius,
  polarSampleFillAlpha,
  shapePolarInstantForBallistics,
  stereoFieldAngleRad,
  updatePolarDisplayScale,
  updatePolarRmsPeak,
  type SoundFieldMode,
} from "../../utils/stereoPolarField";

const alphaMin = 0.02;
const maxBufferPoints = 2048 * 12;
const maxCanvasPx = 4096;
const minCanvasCss = 24;
const polarBinCount = 120;
const scatterSampleStride = 10;
const polarSampleStride = 5;
const scatterUnitRadius = 0.92;
const scatterPointAlpha = 0.65;
const scatterDrawAlpha = 0.62;
const polarSampleDrawAlpha = 0.78;
const polarSampleAccBg = "#111111";
/** Extra label size (pt-equivalent, scaled by dpr) for semicircle sound-field grid. */
const soundFieldLabelPtBoost = 3;
/** Polar Level: no neighbor spread (avoids pre-ballistics smear). */
const polarLevelNeighborMix = 0;

interface LissajousPoint {
  s: number;
  m: number;
  alpha: number;
}

const fieldModeLabel: Record<SoundFieldMode, string> = {
  polarSample: "Polar Sample",
  polarLevel: "Polar Level",
  lissajous: "Lissajous",
};

export default class GoniometerComponent extends Component {
  private _canvasWrap: HTMLElement;
  private _fieldTag: HTMLElement;
  private _canvas: HTMLCanvasElement;

  private _playerService: PlayerService;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _rafId: number = 0;
  private _bufL: Float32Array = new Float32Array(2048);
  private _bufR: Float32Array = new Float32Array(2048);
  private _mixL: Float32Array = new Float32Array(2048);
  private _mixR: Float32Array = new Float32Array(2048);
  private _lissajouPoints: LissajousPoint[] = [];
  private _polarSampleAcc: HTMLCanvasElement | null = null;
  private _polarSampleAccCtx: CanvasRenderingContext2D | null = null;
  private _polarInstant: Float32Array = new Float32Array(polarBinCount);
  private _polarScratch: Float32Array = new Float32Array(polarBinCount);
  private _polarRms: Float32Array = new Float32Array(polarBinCount);
  private _polarPeak: Float32Array = new Float32Array(polarBinCount);
  private _polarSampleInstant: Float32Array = new Float32Array(polarBinCount);
  private _polarSampleScratch: Float32Array = new Float32Array(polarBinCount);
  private _polarSampleRms: Float32Array = new Float32Array(polarBinCount);
  private _polarSamplePeak: Float32Array = new Float32Array(polarBinCount);
  private _polarDisplayScale = 0;

  constructor(
    containerEl: HTMLElement,
    playerService: PlayerService,
    analyzeSettingsService: AnalyzeSettingsService,
  ) {
    super();
    this._playerService = playerService;
    this._analyzeSettingsService = analyzeSettingsService;

    containerEl.innerHTML = `
      <div class="goniometerComponent">
        <div class="gonioMain" title="Sound field (Polar Sample / Polar Level / Lissajous)">
          <span class="gonioView__tag js-gonioFieldTag">Field</span>
          <div class="gonioCanvasWrap">
            <canvas class="goniometer__canvas"></canvas>
          </div>
        </div>
      </div>`;

    this._canvasWrap = containerEl.querySelector(".gonioCanvasWrap");
    this._fieldTag = containerEl.querySelector(".js-gonioFieldTag");
    this._canvas = this._canvasWrap.querySelector("canvas");

    this._syncFieldTag();

    this._addEventlistener(playerService, EventType.UPDATE_IS_PLAYING, () => {
      if (!playerService.isPlaying) {
        // /* Freeze last frame like spectral analyzer; do not wipe buffers. */
        // TODO: Make it a choise in setting, freeze or erase
        this._lissajouPoints.length = 0;
        this._clearPolarSampleState();
        this._clearPolarLevelState();
        this._drawFrame(false);
      }
      this._syncRaf();
    });

    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_SOUND_FIELD_MODE,
      () => {
        this._clearPolarSampleState();
        this._clearPolarLevelState();
        this._syncFieldTag();
        this._drawFrame(false);
      },
    );

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this._drawFrame(false));
      ro.observe(this._canvasWrap);
      this._register({ dispose: () => ro.disconnect() });
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._drawFrame(false));
    });

    this._syncRaf();
  }

  private _syncFieldTag() {
    const mode = this._analyzeSettingsService.liveSoundFieldMode;
    this._fieldTag.textContent = fieldModeLabel[mode] ?? "Field";
  }

  private _fieldDecay(): number {
    return scatterAlphaDecayFromReleaseDbPerSec(
      this._analyzeSettingsService.livePolarFieldReleaseDbPerSec,
    );
  }

  private _fieldFadeOverlayAlpha(): number {
    return scatterFadeOverlayAlphaFromReleaseDbPerSec(
      this._analyzeSettingsService.livePolarFieldReleaseDbPerSec,
    );
  }

  private _ensurePolarSampleAcc(w: number, h: number): CanvasRenderingContext2D | null {
    if (!this._polarSampleAcc) {
      this._polarSampleAcc = document.createElement("canvas");
      this._polarSampleAccCtx = this._polarSampleAcc.getContext("2d");
    }
    const acc = this._polarSampleAcc;
    const accCtx = this._polarSampleAccCtx;
    if (!acc || !accCtx) {return null;}
    if (acc.width !== w || acc.height !== h) {
      acc.width = w;
      acc.height = h;
      accCtx.fillStyle = polarSampleAccBg;
      accCtx.fillRect(0, 0, w, h);
    }
    return accCtx;
  }

  private _clearPolarSampleState(): void {
    this._polarSampleRms.fill(0);
    this._polarSamplePeak.fill(0);
    if (this._polarSampleAccCtx && this._polarSampleAcc) {
      this._polarSampleAccCtx.fillStyle = polarSampleAccBg;
      this._polarSampleAccCtx.fillRect(
        0,
        0,
        this._polarSampleAcc.width,
        this._polarSampleAcc.height,
      );
    }
  }

  /** Ballistics + display scale carry over between sessions; clear so Polar Level starts from zero. */
  private _clearPolarLevelState(): void {
    this._polarInstant.fill(0);
    this._polarScratch.fill(0);
    this._polarRms.fill(0);
    this._polarPeak.fill(0);
    this._polarDisplayScale = 0;
  }

  private _fadePolarSampleAcc(
    accCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): void {
    const fadeAlpha = this._fieldFadeOverlayAlpha();
    accCtx.fillStyle = `rgba(17, 17, 17, ${fadeAlpha})`;
    accCtx.fillRect(0, 0, w, h);
  }

  private _stampPolarSampleAcc(
    accCtx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    dpr: number,
    fftSize: number,
    gamma: number,
    fillBrightnessPct: number,
  ): void {
    const dot = Math.max(1, 1.1 * dpr);
    const half = dot * 0.5;
    const pathIn = new Path2D();
    const pathOut = new Path2D();

    for (let i = 0; i < fftSize; i += polarSampleStride) {
      const left = this._mixL[i];
      const right = this._mixR[i];
      const mag = Math.hypot(left, right);
      if (mag < 1e-9) {continue;}
      const theta = stereoFieldAngleRad(left, right);
      const smoothMag = interpolatePolarRmsAtAngle(this._polarSampleRms, theta);
      if (smoothMag < 1e-9) {continue;}
      const r = polarSampleDisplayRadius(smoothMag, gamma);
      const { x, y } = polarFieldCanvasXY(cx, cy, radius, theta, r);
      if (y > cy + 0.5) {continue;}
      const path = isInPhaseStereoAngle(theta) ? pathIn : pathOut;
      path.rect(x - half, y - half, dot, dot);
    }

    const drawAlpha = polarSampleFillAlpha(
      polarSampleDrawAlpha,
      fillBrightnessPct,
    );
    const inAlpha = polarSampleFillAlpha(0.9, fillBrightnessPct);
    const outAlpha = polarSampleFillAlpha(0.85, fillBrightnessPct);

    accCtx.save();
    /* No glow — only cyan / orange RMS-positioned dots. */
    accCtx.shadowBlur = 0;
    accCtx.globalAlpha = drawAlpha;
    accCtx.fillStyle = `rgba(0, 180, 216, ${inAlpha})`;
    accCtx.fill(pathIn);
    accCtx.fillStyle = `rgba(255, 152, 0, ${outAlpha})`;
    accCtx.fill(pathOut);
    accCtx.restore();
  }

  private _canvasReady(wrap: HTMLElement): boolean {
    return (
      wrap.clientWidth >= minCanvasCss && wrap.clientHeight >= minCanvasCss
    );
  }

  private _syncRaf() {
    if (this._playerService.isPlaying) {
      this._startRaf();
    } else {
      this._stopRaf();
    }
  }

  private _startRaf() {
    if (this._rafId) {return;}
    const loop = () => {
      this._drawFrame(true);
      if (this._playerService.isPlaying) {
        this._rafId = requestAnimationFrame(loop);
      } else {
        this._rafId = 0;
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  private _stopRaf() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  private _decayPointAlpha<T extends { alpha: number }>(
    points: T[],
    decay: number,
  ): void {
    let writeIdx = 0;
    for (let i = 0; i < points.length; i++) {
      points[i].alpha *= decay;
      if (points[i].alpha >= alphaMin) {
        points[writeIdx++] = points[i];
      }
    }
    points.length = writeIdx;
  }

  private _pushSideMidPoint(
    buf: LissajousPoint[],
    left: number,
    right: number,
    alpha: number,
  ) {
    const s = (left - right) / Math.SQRT2;
    const m = (left + right) / Math.SQRT2;
    const mag = Math.hypot(s, m);
    if (mag <= scatterUnitRadius) {
      buf.push({ s, m, alpha });
    } else {
      const scale = scatterUnitRadius / mag;
      buf.push({ s: s * scale, m: m * scale, alpha });
    }
  }

  private _updateAudioData() {
    const analysers = this._playerService.getAnalysers();
    if (!analysers || !this._playerService.isPlaying) {return;}

    const fftSize = analysers.left.fftSize;
    if (this._bufL.length !== fftSize) {
      this._bufL = new Float32Array(fftSize);
      this._bufR = new Float32Array(fftSize);
      this._mixL = new Float32Array(fftSize);
      this._mixR = new Float32Array(fftSize);
    }

    analysers.left.getFloatTimeDomainData(this._bufL);
    analysers.right.getFloatTimeDomainData(this._bufR);
    applyMonitoringToTimeDomain(
      this._analyzeSettingsService.liveMonitoringMode,
      this._bufL,
      this._bufR,
      this._mixL,
      this._mixR,
    );

    if (!this._canvasReady(this._canvasWrap)) {
      return;
    }

    const fieldDecay = this._fieldDecay();
    const fieldReleaseDbPerSec =
      this._analyzeSettingsService.livePolarFieldReleaseDbPerSec;
    const gateFloorRatio =
      this._analyzeSettingsService.livePolarLevelGatePct / 100;
    const mode = this._analyzeSettingsService.liveSoundFieldMode;

    if (mode === "lissajous") {
      for (let i = 0; i < fftSize; i += scatterSampleStride) {
        this._pushSideMidPoint(
          this._lissajouPoints,
          this._mixL[i],
          this._mixR[i],
          scatterPointAlpha,
        );
      }
      this._decayPointAlpha(this._lissajouPoints, fieldDecay);
      if (this._lissajouPoints.length > maxBufferPoints) {
        this._lissajouPoints.splice(
          0,
          this._lissajouPoints.length - maxBufferPoints,
        );
      }
    }

    if (mode === "polarSample") {
      const sized = this._resizeCanvas(this._canvas, this._canvasWrap);
      if (!sized) {return;}
      const { w, h, dpr } = sized;
      const accCtx = this._ensurePolarSampleAcc(w, h);
      if (!accCtx) {return;}

      computeInstantPolarBins(
        this._mixL,
        this._mixR,
        this._polarSampleInstant,
        polarSampleStride,
        polarLevelNeighborMix,
      );
      shapePolarInstantForBallistics(
        this._polarSampleInstant,
        this._polarSampleScratch,
        gateFloorRatio,
      );
      updatePolarRmsPeak(
        this._polarSampleInstant,
        this._polarSampleRms,
        this._polarSamplePeak,
        emaDecayFromReleaseDbPerSec(fieldReleaseDbPerSec),
        peakFallDbPerFrameFromRelease(fieldReleaseDbPerSec),
      );

      const gamma = this._analyzeSettingsService.livePolarSampleRadiusGamma;
      const fillBrightnessPct =
        this._analyzeSettingsService.livePolarSampleFillBrightnessPct;
      const { cx, cy, radius } = this._semicircleLayout(w, h, dpr);
      this._fadePolarSampleAcc(accCtx, w, h);
      this._stampPolarSampleAcc(
        accCtx,
        cx,
        cy,
        radius,
        dpr,
        fftSize,
        gamma,
        fillBrightnessPct,
      );
    }

    if (mode === "polarLevel") {
      computeInstantPolarBins(
        this._mixL,
        this._mixR,
        this._polarInstant,
        2,
        polarLevelNeighborMix,
      );
      shapePolarInstantForBallistics(
        this._polarInstant,
        this._polarScratch,
        gateFloorRatio,
      );
      const rmsDecay = emaDecayFromReleaseDbPerSec(fieldReleaseDbPerSec);
      const peakFallDf = peakFallDbPerFrameFromRelease(fieldReleaseDbPerSec);
      updatePolarRmsPeak(
        this._polarInstant,
        this._polarRms,
        this._polarPeak,
        rmsDecay,
        peakFallDf,
      );

      this._polarDisplayScale = updatePolarDisplayScale(
        this._polarDisplayScale,
        this._polarRms,
        this._polarPeak,
        polarLevelDisplayScaleDecay(fieldReleaseDbPerSec),
      );
    }
  }

  private _drawFrame(updateAudio: boolean) {
    if (updateAudio) {this._updateAudioData();}
    this._drawSoundField();
  }

  private _resizeCanvas(
    canvas: HTMLCanvasElement,
    wrap: HTMLElement,
  ): { w: number; h: number; dpr: number; ctx: CanvasRenderingContext2D } | null {
    if (!this._canvasReady(wrap)) {return null;}

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.floor(wrap.clientWidth);
    const cssH = Math.floor(wrap.clientHeight);
    const w = Math.min(maxCanvasPx, Math.max(1, Math.round(cssW * dpr)));
    const h = Math.min(maxCanvasPx, Math.max(1, Math.round(cssH * dpr)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {return null;}
    return { w, h, dpr, ctx };
  }

  private _circularLayout(w: number, h: number, dpr: number) {
    const pad = 14 * dpr;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx - pad, cy - pad) * scatterUnitRadius;
    return { cx, cy, radius, pad };
  }

  /**
   * Upper semicircle sound field, vertically centered like Lissajous.
   * Baseline at cy; dome spans [cy − radius, cy] with midpoint at canvas center.
   */
  private _semicircleLayout(w: number, h: number, dpr: number) {
    const pad = 14 * dpr;
    const cx = w / 2;
    const radius =
      Math.min(cx - pad, (h - 2 * pad) / 2) * scatterUnitRadius;
    const cy = h / 2 + radius / 2;
    return { cx, cy, radius, pad };
  }

  private _drawCircularMsGrid(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    dpr: number,
  ) {
    const labelFs = Math.max(9, 10 * dpr);
    const font = `${labelFs}px var(--vscode-editor-font-family, monospace)`;

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const r of [0.25, 0.5, 0.75, 1.0]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.707, cy - radius * 0.707);
    ctx.lineTo(cx + radius * 0.707, cy + radius * 0.707);
    ctx.moveTo(cx + radius * 0.707, cy - radius * 0.707);
    ctx.lineTo(cx - radius * 0.707, cy + radius * 0.707);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("M", cx, cy - radius - 3 * dpr);
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText("L", cx - radius * 0.78 - 4 * dpr, cy - radius * 0.78);
    ctx.textAlign = "left";
    ctx.fillText("R", cx + radius * 0.78 + 4 * dpr, cy - radius * 0.78);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("−S", cx - radius - 2 * dpr, cy + 4 * dpr);
    ctx.fillText("+S", cx + radius + 2 * dpr, cy + 4 * dpr);
  }

  private _soundFieldLabelFont(dpr: number, secondary = false): string {
    const basePt = secondary ? 9 : 10;
    const pt = basePt + soundFieldLabelPtBoost;
    const fs = Math.max(pt - 1, pt * dpr);
    return `${fs}px var(--vscode-editor-font-family, monospace)`;
  }

  private _drawSoundFieldGridSemicircleLines(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    dpr: number,
  ) {
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const r of [0.25, 0.5, 0.75, 1.0]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius * r, Math.PI, 0);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    for (const theta of [Math.PI / 4, (3 * Math.PI) / 4]) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(theta), cy - radius * Math.sin(theta));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.stroke();
  }

  private _drawSoundFieldGridSemicircleLabels(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    dpr: number,
  ) {
    const labelInset = 10 * dpr;
    const lTip = polarFieldCanvasXY(cx, cy, radius, (3 * Math.PI) / 4, 1);
    const rTip = polarFieldCanvasXY(cx, cy, radius, Math.PI / 4, 1);

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = this._soundFieldLabelFont(dpr);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("L", lTip.x - labelInset * 0.5, lTip.y - labelInset * 0.3);
    ctx.fillText("R", rTip.x + labelInset * 0.5, rTip.y - labelInset * 0.3);
    ctx.textBaseline = "bottom";
    ctx.fillText("M", cx, cy - radius - 2 * dpr);
    ctx.textBaseline = "top";
    ctx.font = this._soundFieldLabelFont(dpr, true);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillText("−OOP", cx - radius + labelInset, cy + 3 * dpr);
    ctx.fillText("+OOP", cx + radius - labelInset * 2, cy + 3 * dpr);
  }

  private _drawSoundFieldGridSemicircle(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    dpr: number,
  ) {
    this._drawSoundFieldGridSemicircleLines(ctx, cx, cy, radius, dpr);
    this._drawSoundFieldGridSemicircleLabels(ctx, cx, cy, radius, dpr);
  }

  private _drawSoundField() {
    const sized = this._resizeCanvas(this._canvas, this._canvasWrap);
    if (!sized) {return;}
    const { w, h, dpr, ctx } = sized;
    const mode = this._analyzeSettingsService.liveSoundFieldMode;

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, w, h);

    if (mode === "lissajous") {
      const { cx, cy, radius } = this._circularLayout(w, h, dpr);
      this._drawCircularMsGrid(ctx, cx, cy, radius, dpr);
      ctx.save();
      clipCircle(ctx, cx, cy, radius);
      this._drawLissajous(ctx, cx, cy, radius, dpr);
      ctx.restore();
      return;
    }

    const { cx, cy, radius } = this._semicircleLayout(w, h, dpr);
    this._drawSoundFieldGridSemicircle(ctx, cx, cy, radius, dpr);

    ctx.save();
    clipUpperSemicircle(ctx, cx, cy, radius);

    if (mode === "polarSample") {
      this._ensurePolarSampleAcc(w, h);
      this._drawPolarSample(ctx, w, h);
      this._drawSoundFieldGridSemicircleLines(ctx, cx, cy, radius, dpr);
      this._drawSoundFieldGridSemicircleLabels(ctx, cx, cy, radius, dpr);
    } else {
      this._drawPolarLevel(ctx, cx, cy, radius);
    }

    ctx.restore();

    ctx.fillStyle = "#111111";
    ctx.fillRect(0, cy + 1, w, h - cy);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, 2 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  private _drawPolarSample(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ) {
    if (!this._polarSampleAcc) {return;}
    ctx.drawImage(this._polarSampleAcc, 0, 0, w, h);
  }

  private _drawLissajous(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    dpr: number,
  ) {
    const dot = Math.max(1, 1.1 * dpr);
    for (const pt of this._lissajouPoints) {
      const px = cx - pt.s * radius;
      const py = cy - pt.m * radius;
      const radial = Math.min(1, Math.hypot(pt.s, pt.m) / scatterUnitRadius);
      ctx.globalAlpha =
        pt.alpha * scatterDrawAlpha * (0.75 + 0.25 * radial);
      ctx.fillStyle = "rgba(0, 180, 216, 0.9)";
      ctx.fillRect(px - dot * 0.5, py - dot * 0.5, dot, dot);
    }
    ctx.globalAlpha = 1;
  }

  private _drawPolarLevel(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
  ) {
    const norm = polarLevelDrawNorm(this._polarDisplayScale);
    if (norm <= 0) {return;}

    const toXY = (theta: number, lenPx: number) =>
      polarFieldCanvasXY(cx, cy, radius, theta, lenPx / radius);

    const radialLen = (value: number) =>
      polarLevelDrawLength(value, norm) * radius;

    const bottomY = cy;

    const rmsGradient = ctx.createLinearGradient(0, cy - radius, 0, cy);
    rmsGradient.addColorStop(0, "rgba(24,198,232,0.62)");
    rmsGradient.addColorStop(1, "rgba(12,140,198,0.22)");

    ctx.fillStyle = rmsGradient;
    ctx.beginPath();
    ctx.moveTo(toXY(polarBinToAngleRad(0, polarBinCount), 0).x, bottomY);
    for (let i = 0; i < polarBinCount; i++) {
      const theta = polarBinToAngleRad(i, polarBinCount);
      const len = radialLen(this._polarRms[i]);
      const p = toXY(theta, len);
      ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(
      toXY(polarBinToAngleRad(polarBinCount - 1, polarBinCount), 0).x,
      bottomY,
    );
    ctx.closePath();
    ctx.fill();
  }

  override dispose() {
    this._stopRaf();
    super.dispose();
  }
}
