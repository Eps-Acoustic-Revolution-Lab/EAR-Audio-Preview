import { EventType } from "../../events";
import Component from "../../component";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import { quinticBSplineSmooth } from "../../utils/quinticBSpline";
import { akimaResample } from "../../utils/modifiedAkima";
import { emaDecayFromReleaseDbPerSec } from "../../utils/liveBallistics";
import {
  logFreqs,
  logPoints,
  freqMin,
  freqMax,
  phaseCorrFreqTicks,
  freqToCanvasX,
  hzFromCanvasX,
  logIndexFromHz,
  lerpF32,
  fmtHzLive,
  formatFreqTickLabel,
} from "../../utils/liveLogSpectrumAxis";
import {
  ensureStereoFrameBuffers,
  fetchMonitoringStereoFrame,
  type StereoFrameBuffers,
} from "../../utils/liveStereoFrame";
import { FrequencyPhaseCorrelationEngine } from "../../utils/frequencyPhaseCorrelation";

const corrMin = -1;
const corrMax = 1;
const corrTicks = [1, 0.5, 0, -0.5, -1];
const maxCanvasPx = 4096;
const meterBarW = 10;

/** Matches --gonioMeter-beam-inphase / live spectrum cyan. */
const inPhaseStroke = "rgba(120, 230, 255, 0.95)";
const inPhaseFillTop = "rgba(0, 180, 216, 0.45)";
const inPhaseFillMid = "rgba(0, 140, 190, 0.25)";
/** Matches --gonioMeter-beam-oophase anti-phase orange. */
const antiPhaseStroke = "rgba(255, 152, 0, 0.85)";
const antiPhaseFillDeep = "rgba(255, 152, 0, 0.42)";
const antiPhaseFillMid = "rgba(255, 152, 0, 0.22)";

function corrFromCanvasY(y: number, padT: number, drawH: number): number {
  const t = (y - padT) / drawH;
  const tl = Math.max(0, Math.min(1, t));
  return corrMax - tl * (corrMax - corrMin);
}

function clampCorr(v: number): number {
  if (!Number.isFinite(v)) {
    return 0;
  }
  return Math.max(corrMin, Math.min(corrMax, v));
}

export default class PhaseCorrelationSpectrumComponent extends Component {
  private _container: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _readoutEl: HTMLElement;
  private _playerService: PlayerService;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _rafId = 0;
  private _frameBuffers: StereoFrameBuffers = ensureStereoFrameBuffers(2048);
  private _engine = new FrequencyPhaseCorrelationEngine();
  private _emaRho = new Float32Array(logPoints);
  private _broadbandRho = 0;
  private _hoverCx = 0;
  private _hoverCy = 0;
  private _hoverClientX = 0;
  private _hoverClientY = 0;
  private _hoverActive = false;

  private _shouldRunRaf(): boolean {
    return this._playerService.isPlaying || this._hoverActive;
  }

  private _syncRafToState() {
    if (this._shouldRunRaf()) {
      this._startRaf();
    } else {
      this._stopRaf();
    }
  }

  constructor(
    containerEl: HTMLElement,
    playerService: PlayerService,
    analyzeSettingsService: AnalyzeSettingsService,
  ) {
    super();
    this._playerService = playerService;
    this._analyzeSettingsService = analyzeSettingsService;
    this._container = containerEl;

    containerEl.innerHTML = `<div class="phaseCorrelationSpectrumComponent">
      <canvas class="phaseCorrelationSpectrum__canvas"></canvas>
      <div class="phaseCorrelationSpectrum__hoverReadout" style="visibility:hidden" aria-live="polite"></div>
    </div>`;
    this._canvas = containerEl.querySelector(
      ".phaseCorrelationSpectrum__canvas",
    );
    this._readoutEl = containerEl.querySelector(
      ".phaseCorrelationSpectrum__hoverReadout",
    ) as HTMLElement;

    this._addEventlistener(
      containerEl,
      EventType.MOUSE_MOVE,
      (e: MouseEvent) => {
        const r = this._canvas.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) {
          return;
        }
        this._hoverActive = true;
        this._hoverClientX = e.clientX;
        this._hoverClientY = e.clientY;
        this._hoverCx = (e.clientX - r.left) * (this._canvas.width / r.width);
        this._hoverCy = (e.clientY - r.top) * (this._canvas.height / r.height);
        this._syncRafToState();
      },
    );
    this._addEventlistener(containerEl, "mouseleave", () => {
      this._hoverActive = false;
      this._readoutEl.style.visibility = "hidden";
      this._draw();
      this._syncRafToState();
    });

    this._addEventlistener(playerService, EventType.UPDATE_IS_PLAYING, () => {
      this._syncRafToState();
    });

    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE,
      () => {
        this._frameBuffers = ensureStereoFrameBuffers(
          analyzeSettingsService.liveAnalysisFftSize,
        );
      },
    );

    this._syncRafToState();
  }

  private _startRaf() {
    if (!this._shouldRunRaf() || this._rafId) {
      return;
    }
    const loop = () => {
      this._draw();
      if (this._shouldRunRaf()) {
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

  private _draw() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(this._container.clientWidth));
    const cssH = Math.max(1, Math.floor(this._container.clientHeight));
    const w = Math.min(maxCanvasPx, Math.max(1, Math.round(cssW * dpr)));
    const h = Math.min(maxCanvasPx, Math.max(1, Math.round(cssH * dpr)));
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
    const ctx = this._canvas.getContext("2d");
    if (!ctx || w <= 0 || h <= 0) {
      return;
    }

    const padL = 28 * dpr;
    const padB = 16 * dpr;
    const padT = 6 * dpr;
    const padR = (meterBarW + 22) * dpr;
    const drawW = w - padL - padR;
    const drawH = h - padB - padT;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, w, h);

    if (drawW <= 0 || drawH <= 0) {
      return;
    }

    const corrToY = (c: number) =>
      padT + ((corrMax - c) / (corrMax - corrMin)) * drawH;
    const zeroY = corrToY(0);

    const frame = fetchMonitoringStereoFrame(
      this._playerService,
      this._analyzeSettingsService.liveMonitoringMode,
      this._frameBuffers,
    );

    if (frame) {
      const { srcXs, srcYs, broadbandRho } = this._engine.computeRhoPerBin(
        frame.mixL,
        frame.mixR,
        frame.sampleRate,
      );

      if (srcXs.length >= 2) {
        const resampled = akimaResample(srcXs, srcYs, logFreqs);
        const inst = quinticBSplineSmooth(resampled);
        const decay = emaDecayFromReleaseDbPerSec(
          this._analyzeSettingsService.liveSpectrumReleaseDbPerSec,
        );

        for (let i = 0; i < logPoints; i++) {
          const v = clampCorr(inst[i]);
          this._emaRho[i] = decay * this._emaRho[i] + (1 - decay) * v;
        }

        const bbDecay = emaDecayFromReleaseDbPerSec(
          this._analyzeSettingsService.liveSpectrumReleaseDbPerSec,
        );
        this._broadbandRho =
          bbDecay * this._broadbandRho + (1 - bbDecay) * broadbandRho;
      }
    }

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (const c of corrTicks) {
      const y = corrToY(c);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + drawW, y);
      ctx.stroke();
    }
    for (const f of phaseCorrFreqTicks) {
      if (f < freqMin || f > freqMax) {
        continue;
      }
      const x = freqToCanvasX(f, padL, drawW);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + drawH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(padL + drawW, zeroY);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `${8 * dpr}px monospace`;

    ctx.textAlign = "left";
    for (const c of corrTicks) {
      const label = c === 1 || c === -1 ? String(c) : String(c);
      ctx.fillText(label, padL + drawW + 4 * dpr, corrToY(c) + 3 * dpr);
    }

    ctx.textAlign = "center";
    for (const f of phaseCorrFreqTicks) {
      if (f < freqMin || f > freqMax) {
        continue;
      }
      ctx.fillText(
        formatFreqTickLabel(f),
        freqToCanvasX(f, padL, drawW),
        padT + drawH + 11 * dpr,
      );
    }

    const drawCurves = () => {
      const xAt = (i: number) => freqToCanvasX(logFreqs[i], padL, drawW);
      const yAt = (i: number) => corrToY(clampCorr(this._emaRho[i]));

      const inPhaseFill = ctx.createLinearGradient(0, padT, 0, zeroY);
      inPhaseFill.addColorStop(0, inPhaseFillTop);
      inPhaseFill.addColorStop(1, inPhaseFillMid);
      ctx.fillStyle = inPhaseFill;
      ctx.beginPath();
      ctx.moveTo(xAt(0), zeroY);
      for (let i = 0; i < logPoints; i++) {
        const rho = clampCorr(this._emaRho[i]);
        ctx.lineTo(xAt(i), corrToY(Math.max(0, rho)));
      }
      ctx.lineTo(xAt(logPoints - 1), zeroY);
      ctx.closePath();
      ctx.fill();

      const antiPhaseFill = ctx.createLinearGradient(0, zeroY, 0, padT + drawH);
      antiPhaseFill.addColorStop(0, antiPhaseFillMid);
      antiPhaseFill.addColorStop(1, antiPhaseFillDeep);
      ctx.fillStyle = antiPhaseFill;
      ctx.beginPath();
      ctx.moveTo(xAt(0), zeroY);
      for (let i = 0; i < logPoints; i++) {
        const rho = clampCorr(this._emaRho[i]);
        ctx.lineTo(xAt(i), corrToY(Math.min(0, rho)));
      }
      ctx.lineTo(xAt(logPoints - 1), zeroY);
      ctx.closePath();
      ctx.fill();

      ctx.lineWidth = 1.25 * dpr;
      ctx.lineJoin = "round";
      for (let i = 1; i < logPoints; i++) {
        const r0 = clampCorr(this._emaRho[i - 1]);
        const r1 = clampCorr(this._emaRho[i]);
        const x0 = xAt(i - 1);
        const x1 = xAt(i);
        const y0 = yAt(i - 1);
        const y1 = yAt(i);

        const drawSeg = (
          sx: number,
          sy: number,
          ex: number,
          ey: number,
          positive: boolean,
        ) => {
          ctx.strokeStyle = positive ? inPhaseStroke : antiPhaseStroke;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        };

        if (r0 >= 0 && r1 >= 0) {
          drawSeg(x0, y0, x1, y1, true);
        } else if (r0 <= 0 && r1 <= 0) {
          drawSeg(x0, y0, x1, y1, false);
        } else {
          const t = r0 / (r0 - r1);
          const xc = x0 + t * (x1 - x0);
          drawSeg(x0, y0, xc, zeroY, r0 >= 0);
          drawSeg(xc, zeroY, x1, y1, r1 >= 0);
        }
      }
    };

    drawCurves();

    const barX = padL + drawW + 14 * dpr;
    const barW = 6 * dpr;
    const barTop = padT;
    const barH = drawH;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(barX, barTop, barW, barH);
    const bb = clampCorr(this._broadbandRho);
    const fillTop = bb >= 0 ? corrToY(bb) : zeroY;
    const fillBottom = bb >= 0 ? zeroY : corrToY(bb);
    ctx.fillStyle = bb >= 0 ? "rgba(0, 180, 216, 0.75)" : antiPhaseStroke;
    ctx.fillRect(barX, fillTop, barW, fillBottom - fillTop);

    if (this._hoverActive && drawW > 0 && drawH > 0) {
      const mx = this._hoverCx;
      const my = this._hoverCy;
      const hx = Math.min(padL + drawW, Math.max(padL, mx));
      const hy = Math.min(padT + drawH, Math.max(padT, my));
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.82)";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(hx, padT);
      ctx.lineTo(hx, padT + drawH);
      ctx.moveTo(padL, hy);
      ctx.lineTo(padL + drawW, hy);
      ctx.stroke();
      ctx.restore();

      const hz = hzFromCanvasX(mx, padL, drawW);
      const corrY = corrFromCanvasY(my, padT, drawH);
      const li = logIndexFromHz(hz);
      const rhoStr = lerpF32(this._emaRho, li, 0).toFixed(2);
      this._readoutEl.style.visibility = "visible";
      this._readoutEl.innerHTML = `${fmtHzLive(hz)}<br>ρ ${rhoStr}<br>Y ${corrY.toFixed(2)}<br>BB ${this._broadbandRho.toFixed(2)}`;
      this._readoutEl.style.left = `${Math.min(
        this._hoverClientX + 12,
        window.innerWidth - this._readoutEl.offsetWidth - 8,
      )}px`;
      this._readoutEl.style.top = `${Math.max(4, this._hoverClientY - this._readoutEl.offsetHeight - 10)}px`;
    } else {
      this._readoutEl.style.visibility = "hidden";
    }
  }

  override dispose() {
    this._stopRaf();
    super.dispose();
  }
}
