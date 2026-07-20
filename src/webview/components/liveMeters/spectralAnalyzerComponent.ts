import { EventType } from "../../events";
import Component from "../../component";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import { quinticBSplineSmoothInto } from "../../utils/quinticBSpline";
import { akimaResampleInto } from "../../utils/modifiedAkima";
import {
  emaDecayFromReleaseDbPerSec,
  peakFallDbPerFrameFromRelease,
} from "../../utils/liveBallistics";
import {
  monitoringGainsForMode,
  spectrumTiltDbAboveFloor,
  applyMonitoringToTimeDomain,
} from "../../utils/liveMonitoring";
import {
  buildPazBandLayout,
  buildCqtCacheFromLayout,
  pazCacheValid,
  goertzelCqt,
  CQT_AXIS_START_HZ,
  type PazBandLayout,
  type CqtCache,
} from "../../utils/goertzelCqt";
import {
  smoothPeakDisplayAlongBinsInto,
  stepSpectralPeakDisplay,
} from "../../utils/spectralPeakDisplay";
import {
  lerpF32,
  fmtHzLive,
  formatFreqTickLabel,
  freqToCanvasXParam,
  hzFromCanvasXParam,
  logIndexFromHzParam,
  logFreqPointsParam,
  fftSpectrumFreqTicksForSr,
  cqtSpectrumFreqTicksForSr,
} from "../../utils/liveLogSpectrumAxis";

const dbFloor = -90;
const dbCeil = 0;
const dbTicks = [0, -12, -24, -36, -48, -60, -90];
const maxCanvasPx = 4096;

function dbFromCanvasY(y: number, padT: number, drawH: number): number {
  const t = (y - padT) / drawH;
  const tl = Math.max(0, Math.min(1, t));
  return dbFloor + (1 - tl) * (dbCeil - dbFloor);
}
export default class SpectralAnalyzerComponent extends Component {
  private _container: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _readoutEl: HTMLElement;
  private _playerService: PlayerService;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _rafId: number = 0;
  private _bufL: Float32Array = new Float32Array(1024);
  private _bufR: Float32Array = new Float32Array(1024);

  // ── Dynamic state arrays (sized to _numPoints: 300 for FFT, numBins for CQT) ──
  private _emaPeakLogical = new Float32Array(0);
  /** Smoothed toward {@link _emaPeakLogical} for stroked outline + readout (reduces spatial kinks across bins). */
  private _emaPeakDisplay = new Float32Array(0);
  /** Temp for one pass of {@link smoothPeakDisplayAlongBinsInto}. */
  private _peakSpatialScratch = new Float32Array(0);
  private _emaRms = new Float32Array(0);
  /** Wall-clock expiry (ms since `performance.now()` origin) after last peak crest; decay only after this time. */
  private _peakHoldUntilMs = new Float64Array(0);

  private _hoverCx = 0;
  private _hoverCy = 0;
  private _hoverClientX = 0;
  private _hoverClientY = 0;
  private _hoverActive = false;
  private _cqtCache: CqtCache | null = null;
  private _cqtDbBuf: Float32Array = new Float32Array(0);
  private _timeBufL: Float32Array = new Float32Array(0);
  private _timeBufR: Float32Array = new Float32Array(0);
  private _timeMixL: Float32Array = new Float32Array(0);
  private _timeMixR: Float32Array = new Float32Array(0);

  // ── Dynamic axis state ──
  private static readonly _fftFreqMin = 10;
  private static readonly _fftLogPoints = 300;

  private _pazLayout: PazBandLayout | null = null;
  private _pazLfRes = 0;
  private _pazFreqMax = 0;
  private _cqtRenderFreqs: Float64Array | null = null;
  private _cqtRenderSr = 0;

  private _axisMin = 10;
  private _axisMax = 20000;
  private _numPoints = 0;

  // Per-frame scratch buffers (reused across RAF ticks to avoid GC churn).
  private _fftSrcXs: Float64Array = new Float64Array(0);
  private _fftSrcYs: Float64Array = new Float64Array(0);
  private _cqtSrcXs: Float64Array = new Float64Array(0);
  private _cqtSrcYs: Float64Array = new Float64Array(0);
  private _resampleOut: Float32Array = new Float32Array(0);
  private _smoothOut: Float32Array = new Float32Array(0);
  /** X-positions for curve control points: logFreqs(300) for both FFT and CQT. */
  private _curveFreqs: Float64Array = new Float64Array(0);
  private _fftLogFreqs: Float64Array | null = null;
  private _fftSampleRate = 0;

  /** Keep animating while playing or while the pointer is over the plot (crosshair / readout when paused). */
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

    containerEl.innerHTML = `<div class="spectralAnalyzerComponent">
      <canvas class="spectralAnalyzer__canvas"></canvas>
      <div class="spectralAnalyzer__hoverReadout" style="visibility:hidden" aria-live="polite"></div>
    </div>`;
    this._canvas = containerEl.querySelector(".spectralAnalyzer__canvas");
    this._readoutEl = containerEl.querySelector(
      ".spectralAnalyzer__hoverReadout",
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
      // Redraw once: stopping RAF cancels the next frame, which would otherwise
      // leave the last crosshair painted on the canvas.
      this._draw();
      this._syncRafToState();
    });

    this._addEventlistener(containerEl, "dblclick", () => {
      this._emaPeakLogical.fill(dbFloor);
      this._emaPeakDisplay.fill(dbFloor);
    });

    this._addEventlistener(playerService, EventType.UPDATE_IS_PLAYING, () => {
      this._syncRafToState();
    });

    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_SPECTRUM_MODE,
      () => {
        this._resetBallistics();
        this._cqtCache = null;
        this._syncRafToState();
      },
    );
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_CQT_LF_RES,
      () => {
        this._cqtCache = null;
        this._pazLayout = null;
        this._cqtRenderFreqs = null;
        this._resetBallistics();
      },
    );

    this._syncRafToState();
  }

  private _ensureArraySize(n: number): void {
    if (this._emaRms.length === n) {
      return;
    }
    this._numPoints = n;
    this._emaPeakLogical = new Float32Array(n);
    this._emaPeakDisplay = new Float32Array(n);
    this._peakSpatialScratch = new Float32Array(n);
    this._emaRms = new Float32Array(n);
    this._peakHoldUntilMs = new Float64Array(n);
    this._resetBallistics();
  }

  private _resetBallistics(): void {
    if (this._emaRms.length === 0) {
      return;
    }
    this._emaPeakLogical.fill(dbFloor);
    this._emaPeakDisplay.fill(dbFloor);
    this._peakSpatialScratch.fill(0);
    this._emaRms.fill(dbFloor);
    this._peakHoldUntilMs.fill(0);
  }

  /** Resize resample/smooth outputs to follow the active curve grid. */
  private _ensureCurveScratch(): void {
    const n = this._curveFreqs.length;
    if (this._resampleOut.length !== n) {
      this._resampleOut = new Float32Array(n);
      this._smoothOut = new Float32Array(n);
    }
  }

  /** Recompute axis range, point count, and curve-point frequencies for the current mode + sample rate. */
  private _configureAxis(isCqt: boolean, sampleRate: number): void {
    const nyquist = sampleRate / 2;

    if (isCqt) {
      const lfRes = this._analyzeSettingsService.liveCqtLfRes;
      if (
        !this._pazLayout ||
        this._pazLfRes !== lfRes ||
        this._pazFreqMax !== nyquist
      ) {
        this._pazLayout = buildPazBandLayout(lfRes, nyquist);
        this._pazLfRes = lfRes;
        this._pazFreqMax = nyquist;
      }
      this._axisMin = CQT_AXIS_START_HZ;
      this._axisMax = nyquist;
      const crossIdx = this._pazLayout.crossoverIdx;
      const numHfPts = SpectralAnalyzerComponent._fftLogPoints - crossIdx;
      this._ensureArraySize(crossIdx + numHfPts);
      if (!this._cqtRenderFreqs || this._cqtRenderSr !== sampleRate) {
        const grid = new Float64Array(crossIdx + numHfPts);
        for (let i = 0; i < crossIdx; i++) {
          grid[i] = this._pazLayout.leftEdges[i];
        }
        const hfStart = this._pazLayout.leftEdges[crossIdx];
        const loHf = Math.log10(hfStart);
        const hiHf = Math.log10(nyquist);
        for (let i = 0; i < numHfPts; i++) {
          grid[crossIdx + i] = Math.pow(
            10,
            loHf + (i / (numHfPts - 1)) * (hiHf - loHf),
          );
        }
        this._cqtRenderFreqs = grid;
        this._cqtRenderSr = sampleRate;
      }
      this._curveFreqs = this._cqtRenderFreqs;
    } else {
      this._axisMin = SpectralAnalyzerComponent._fftFreqMin;
      this._axisMax = nyquist;
      this._ensureArraySize(SpectralAnalyzerComponent._fftLogPoints);
      if (this._fftSampleRate !== sampleRate || !this._fftLogFreqs) {
        this._fftLogFreqs = logFreqPointsParam(
          this._axisMin,
          this._axisMax,
          SpectralAnalyzerComponent._fftLogPoints,
        );
        this._fftSampleRate = sampleRate;
      }
      this._curveFreqs = this._fftLogFreqs;
    }
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

  private _computeFftFrame(analysers: {
    left: AnalyserNode;
    right: AnalyserNode;
  }): Float32Array {
    const fftSize = analysers.left.fftSize;
    if (this._bufL.length !== fftSize / 2) {
      this._bufL = new Float32Array(fftSize / 2);
      this._bufR = new Float32Array(fftSize / 2);
      this._resetBallistics();
    }

    analysers.left.getFloatFrequencyData(this._bufL);
    analysers.right.getFloatFrequencyData(this._bufR);

    const sampleRate = analysers.left.context.sampleRate;
    const binCount = this._bufL.length;
    const binHz = sampleRate / fftSize;
    const g = monitoringGainsForMode(
      this._analyzeSettingsService.liveMonitoringMode,
    );
    const tilt = this._analyzeSettingsService.liveSpectrumTiltDbPerOct;

    if (this._fftSrcXs.length !== binCount) {
      this._fftSrcXs = new Float64Array(binCount);
      this._fftSrcYs = new Float64Array(binCount);
    }
    const srcXs = this._fftSrcXs;
    const srcYs = this._fftSrcYs;
    for (let k = 0; k < binCount; k++) {
      const f = (k + 0.5) * binHz;
      srcXs[k] = f;
      const dBL = isFinite(this._bufL[k])
        ? Math.max(this._bufL[k], dbFloor)
        : dbFloor;
      const dBR = isFinite(this._bufR[k])
        ? Math.max(this._bufR[k], dbFloor)
        : dbFloor;
      const lLin = Math.pow(10, dBL / 20);
      const rLin = Math.pow(10, dBR / 20);
      const oL = g.ll * lLin + g.rl * rLin;
      const oR = g.lr * lLin + g.rr * rLin;
      const pLin = Math.sqrt(oL * oL + oR * oR) / Math.SQRT2 + 1e-15;
      let db = 20 * Math.log10(pLin);
      db = Math.max(dbFloor, Math.min(dbCeil + 12, db));
      db += spectrumTiltDbAboveFloor(f, tilt, db, dbFloor, 18);
      srcYs[k] = Math.max(dbFloor, Math.min(dbCeil + 12, db));
    }

    this._ensureCurveScratch();
    akimaResampleInto(srcXs, srcYs, this._curveFreqs, this._resampleOut);
    quinticBSplineSmoothInto(this._resampleOut, this._smoothOut);
    return this._smoothOut;
  }

  private _computeCqtFrame(analysers: {
    left: AnalyserNode;
    right: AnalyserNode;
  }): Float32Array {
    const fftSize = analysers.left.fftSize;
    const sampleRate = analysers.left.context.sampleRate;
    const layout = this._pazLayout!;
    const numBins = layout.numBins;

    if (this._timeBufL.length !== fftSize) {
      this._timeBufL = new Float32Array(fftSize);
      this._timeBufR = new Float32Array(fftSize);
      this._timeMixL = new Float32Array(fftSize);
      this._timeMixR = new Float32Array(fftSize);
      this._resetBallistics();
    }

    if (!pazCacheValid(this._cqtCache, layout, sampleRate, fftSize)) {
      this._cqtCache = buildCqtCacheFromLayout(layout, sampleRate, fftSize);
      this._cqtDbBuf = new Float32Array(numBins);
    }

    analysers.left.getFloatTimeDomainData(this._timeBufL);
    analysers.right.getFloatTimeDomainData(this._timeBufR);

    applyMonitoringToTimeDomain(
      this._analyzeSettingsService.liveMonitoringMode,
      this._timeBufL,
      this._timeBufR,
      this._timeMixL,
      this._timeMixR,
    );

    for (let i = 0; i < fftSize; i++) {
      const l = this._timeMixL[i];
      const r = this._timeMixR[i];
      this._timeMixL[i] = Math.sqrt(l * l + r * r) / Math.SQRT2;
    }

    goertzelCqt(this._timeMixL, this._cqtCache, this._cqtDbBuf);

    const tilt = this._analyzeSettingsService.liveSpectrumTiltDbPerOct;
    const leftEdges = layout.leftEdges;
    const nyquist = sampleRate / 2;
    const srcN = numBins + 1;
    if (this._cqtSrcXs.length !== srcN) {
      this._cqtSrcXs = new Float64Array(srcN);
      this._cqtSrcYs = new Float64Array(srcN);
    }
    const srcXs = this._cqtSrcXs;
    const srcYs = this._cqtSrcYs;
    for (let k = 0; k < numBins; k++) {
      srcXs[k] = leftEdges[k];
      let db = this._cqtDbBuf[k];
      db = Math.max(dbFloor, Math.min(dbCeil + 12, db));
      db += spectrumTiltDbAboveFloor(layout.freqs[k], tilt, db, dbFloor, 18);
      srcYs[k] = Math.max(dbFloor, Math.min(dbCeil + 12, db));
    }
    srcXs[numBins] = nyquist;
    srcYs[numBins] = srcYs[numBins - 1];

    this._ensureCurveScratch();
    akimaResampleInto(srcXs, srcYs, this._curveFreqs, this._resampleOut);
    return this._resampleOut;
  }

  private _draw() {
    const analysers = this._playerService.getAnalysers();
    const playing = this._playerService.isPlaying;

    const isCqt = this._analyzeSettingsService.liveSpectrumMode === "cqt";
    const sampleRate = this._playerService.sampleRate;
    this._configureAxis(isCqt, sampleRate);

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
    const padR = 14 * dpr;
    const drawW = w - padL - padR;
    const drawH = h - padB - padT;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, w, h);

    if (drawW <= 0 || drawH <= 0) {
      return;
    }

    const axMin = this._axisMin;
    const axMax = this._axisMax;
    const freqToX = (f: number) =>
      freqToCanvasXParam(f, padL, drawW, axMin, axMax);
    const dbToY = (db: number) =>
      padT + (1 - (db - dbFloor) / (dbCeil - dbFloor)) * drawH;

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (const db of dbTicks) {
      const y = dbToY(db);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + drawW, y);
      ctx.stroke();
    }

    const ticks = isCqt
      ? cqtSpectrumFreqTicksForSr(sampleRate, this._axisMin)
      : fftSpectrumFreqTicksForSr(sampleRate);

    for (const f of ticks) {
      const x = freqToX(f);
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + drawH);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `${8 * dpr}px monospace`;

    ctx.textAlign = "right";
    for (const db of dbTicks) {
      ctx.fillText(
        db === 0 ? "0" : String(db),
        padL - 3 * dpr,
        dbToY(db) + 3 * dpr,
      );
    }

    for (let fi = 0; fi < ticks.length; fi++) {
      const f = ticks[fi];
      const label = formatFreqTickLabel(f);
      ctx.textAlign =
        fi === 0 ? "left" : fi === ticks.length - 1 ? "right" : "center";
      ctx.fillText(label, freqToX(f), padT + drawH + 11 * dpr);
    }

    const clampDb = (v: number): number => {
      if (!Number.isFinite(v)) {
        return dbFloor;
      }
      return Math.min(dbCeil + 6, Math.max(dbFloor, v));
    };

    const drawSpectrumCurves = () => {
      const bottomY = padT + drawH;
      const nPts = this._numPoints;
      const cFreqs = this._curveFreqs;
      if (nPts < 2 || cFreqs.length < nPts) {
        return;
      }

      const rmsGradient = ctx.createLinearGradient(0, padT, 0, padT + drawH);
      rmsGradient.addColorStop(0, "rgba(0,180,216,0.55)");
      rmsGradient.addColorStop(1, "rgba(0,100,160,0.12)");
      ctx.fillStyle = rmsGradient;
      ctx.beginPath();
      ctx.moveTo(freqToX(cFreqs[0]), bottomY);
      for (let i = 0; i < nPts; i++) {
        ctx.lineTo(freqToX(cFreqs[i]), dbToY(clampDb(this._emaRms[i])));
      }
      ctx.lineTo(freqToX(cFreqs[nPts - 1]), bottomY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(120, 230, 255, 0.95)";
      ctx.lineWidth = 1.25 * dpr;
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < nPts; i++) {
        const x = freqToX(cFreqs[i]);
        const y = dbToY(clampDb(this._emaPeakDisplay[i]));
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };

    if (analysers) {
      if (playing) {
        const inst = isCqt
          ? this._computeCqtFrame(analysers)
          : this._computeFftFrame(analysers);

        const nPts = this._numPoints;
        const decay = emaDecayFromReleaseDbPerSec(
          this._analyzeSettingsService.liveSpectrumReleaseDbPerSec,
        );
        const peakFallDbPerFrame = peakFallDbPerFrameFromRelease(
          this._analyzeSettingsService.liveSpectrumReleaseDbPerSec,
        );
        const peakHoldMs =
          this._analyzeSettingsService.liveSpectrumPeakHoldSec * 1000;
        const nowMs =
          typeof performance !== "undefined" ? performance.now() : 0;

        for (let i = 0; i < nPts; i++) {
          const v = clampDb(inst[i]);

          if (isCqt) {
            this._emaRms[i] = decay * this._emaRms[i] + (1 - decay) * v;
            this._emaPeakLogical[i] = Math.max(
              this._emaPeakLogical[i],
              this._emaRms[i],
            );
          } else {
            const pk = this._emaPeakLogical[i];
            if (v >= pk) {
              this._emaPeakLogical[i] = v;
              this._peakHoldUntilMs[i] = nowMs + peakHoldMs;
            } else {
              const holdActive =
                peakHoldMs > 0 && nowMs < this._peakHoldUntilMs[i];
              if (!holdActive) {
                this._emaPeakLogical[i] = Math.max(v, pk - peakFallDbPerFrame);
              }
            }
            this._emaRms[i] = decay * this._emaRms[i] + (1 - decay) * v;
          }
        }

        if (isCqt) {
          this._emaPeakDisplay.set(this._emaPeakLogical.subarray(0, nPts));
        } else {
          for (let i = 0; i < nPts; i++) {
            this._emaPeakDisplay[i] = stepSpectralPeakDisplay(
              this._emaPeakLogical[i],
              this._emaPeakDisplay[i],
              peakFallDbPerFrame,
            );
          }
          smoothPeakDisplayAlongBinsInto(
            this._emaPeakDisplay,
            this._peakSpatialScratch,
            nPts,
          );
          this._emaPeakDisplay.set(this._peakSpatialScratch.subarray(0, nPts));
        }
      }

      drawSpectrumCurves();
    }

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

      const hz = hzFromCanvasXParam(
        mx,
        padL,
        drawW,
        this._axisMin,
        this._axisMax,
      );
      const dbY = dbFromCanvasY(my, padT, drawH);
      let pkStr = "—";
      let rmStr = "—";
      if (analysers && this._numPoints >= 2) {
        const li = logIndexFromHzParam(
          hz,
          this._axisMin,
          this._axisMax,
          this._numPoints,
        );
        pkStr = lerpF32(this._emaPeakDisplay, li, dbFloor).toFixed(1);
        rmStr = lerpF32(this._emaRms, li, dbFloor).toFixed(1);
      }
      this._readoutEl.style.visibility = "visible";
      this._readoutEl.innerHTML = `${fmtHzLive(hz)}<br>Y ${dbY.toFixed(1)} dBFS<br>Peak ${pkStr} dBFS<br>RMS ${rmStr} dBFS`;
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
