import { EventType } from "../../events";
import Component from "../../component";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import { emaDecayFromReleaseDbPerSec } from "../../utils/liveBallistics";
import {
  encodeMidSideTimeDomain,
  applyMonitoringToTimeDomain,
  type LiveMonitoringMode,
} from "../../utils/liveMonitoring";
import { formatDbFs } from "../../services/loudnessService";

const dbMin = -60;
const dbMax = 6;
/** Clip LED triggers at 0 dBFS even though the scale extends to +6 dBFS. */
const dbClipThreshold = 0;
const peakHoldFrames = 120;
const ticks: number[] = [6, 0, -3, -6, -12, -18, -24, -36, -48, -60];

function dbToNorm(db: number): number {
  return Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));
}

const maxCanvasPx = 4096;

type MeterLayout = "lr" | "ms";

interface ChannelState {
  smoothedRms: number;
  peakDb: number;
  peakHold: number;
  peakHoldFrames: number;
  clipped: boolean;
  /** Session maximum sample peak (dBFS) when above 0 dBFS. */
  sessionMaxSamplePeakDbFs: number;
}

function formatDb(db: number): string {
  if (!Number.isFinite(db)) {
    return "—";
  }
  return db.toFixed(1);
}

export default class LevelMeterComponent extends Component {
  private _inner: HTMLElement;
  private _wrapL: HTMLElement;
  private _wrapR: HTMLElement;
  private _canvasL: HTMLCanvasElement;
  private _canvasR: HTMLCanvasElement;
  private _clipLedL: HTMLElement;
  private _clipLedR: HTMLElement;
  private _numsL: HTMLElement;
  private _numsR: HTMLElement;
  private _labelL: HTMLElement;
  private _labelR: HTMLElement;

  private _playerService: PlayerService;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _rafId: number = 0;
  private _bufL: Float32Array = new Float32Array(2048);
  private _bufR: Float32Array = new Float32Array(2048);
  private _colA: Float32Array = new Float32Array(2048);
  private _colB: Float32Array = new Float32Array(2048);
  private _silence: Float32Array = new Float32Array(2048);
  private _mixL: Float32Array = new Float32Array(2048);
  private _mixR: Float32Array = new Float32Array(2048);
  private _stateL: ChannelState = {
    smoothedRms: dbMin,
    peakDb: dbMin,
    peakHold: dbMin,
    peakHoldFrames: 0,
    clipped: false,
    sessionMaxSamplePeakDbFs: Number.NEGATIVE_INFINITY,
  };
  private _stateR: ChannelState = {
    smoothedRms: dbMin,
    peakDb: dbMin,
    peakHold: dbMin,
    peakHoldFrames: 0,
    clipped: false,
    sessionMaxSamplePeakDbFs: Number.NEGATIVE_INFINITY,
  };

  /** L–R vs M–S column semantics (stereo only). Solo M/S forces M–S from monitor mode. */
  private _meterLayout: MeterLayout = "lr";

  constructor(
    containerEl: HTMLElement,
    playerService: PlayerService,
    analyzeSettingsService: AnalyzeSettingsService,
  ) {
    super();
    this._playerService = playerService;
    this._analyzeSettingsService = analyzeSettingsService;

    containerEl.innerHTML = `
      <div class="levelMeterComponent" id="levelMeterInner"
        title="Right-click: toggle L–R / M–S columns (when not in Solo M/S). Solo M or S switches to M–S automatically.">
        <div class="levelMeter__main">
          <div class="levelMeter__channel">
            <div class="levelMeter__clipLed" id="clipLedL" title="Click to clear clip"></div>
            <div class="levelMeter__canvasWrap js-meterWrapL">
              <canvas class="levelMeter__canvas"></canvas>
            </div>
          </div>
          <div class="levelMeter__channel">
            <div class="levelMeter__clipLed" id="clipLedR" title="Click to clear clip"></div>
            <div class="levelMeter__canvasWrap js-meterWrapR">
              <canvas class="levelMeter__canvas"></canvas>
            </div>
          </div>
          <div class="levelMeter__scaleCol" aria-hidden="true">
            ${ticks.map((db) => `<div class="levelMeter__tick" data-db="${db}"><span>${db > 0 ? `+${db}` : String(db)}</span></div>`).join("")}
          </div>
        </div>
        <div class="levelMeter__footer">
          <div class="levelMeter__footerCh">
            <span class="levelMeter__footerLabel js-meterLabelL">L</span>
            <span class="levelMeter__footerNums js-meterNumsL" aria-live="polite">R —<br>P —</span>
          </div>
          <div class="levelMeter__footerCh">
            <span class="levelMeter__footerLabel js-meterLabelR">R</span>
            <span class="levelMeter__footerNums js-meterNumsR" aria-live="polite">R —<br>P —</span>
          </div>
          <div class="levelMeter__footerScale" aria-hidden="true"></div>
        </div>
      </div>`;

    this._inner = containerEl.querySelector("#levelMeterInner");
    this._wrapL = containerEl.querySelector(".js-meterWrapL");
    this._wrapR = containerEl.querySelector(".js-meterWrapR");
    this._canvasL = this._wrapL.querySelector("canvas");
    this._canvasR = this._wrapR.querySelector("canvas");
    this._clipLedL = containerEl.querySelector("#clipLedL");
    this._clipLedR = containerEl.querySelector("#clipLedR");
    this._numsL = containerEl.querySelector(".js-meterNumsL");
    this._numsR = containerEl.querySelector(".js-meterNumsR");
    this._labelL = containerEl.querySelector(".js-meterLabelL");
    this._labelR = containerEl.querySelector(".js-meterLabelR");

    this._addEventlistener(this._clipLedL, "click", () => {
      this._stateL.clipped = false;
      this._stateL.sessionMaxSamplePeakDbFs = Number.NEGATIVE_INFINITY;
      this._clipLedL.classList.remove("clipped");
    });
    this._addEventlistener(this._clipLedR, "click", () => {
      this._stateR.clipped = false;
      this._stateR.sessionMaxSamplePeakDbFs = Number.NEGATIVE_INFINITY;
      this._clipLedR.classList.remove("clipped");
    });

    this._addEventlistener(this._inner, "contextmenu", (ev: MouseEvent) => {
      ev.preventDefault();
      const mon = this._analyzeSettingsService.liveMonitoringMode;
      if (mon === "m" || mon === "s") {
        return;
      }
      this._meterLayout = this._meterLayout === "lr" ? "ms" : "lr";
    });

    this._addEventlistener(
      this._analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_MONITORING_MODE,
      (e: CustomEvent<{ value: LiveMonitoringMode }>) => {
        const v = e.detail.value;
        if (v === "m" || v === "s") {
          this._meterLayout = "ms";
        } else {
          this._meterLayout = "lr";
        }
      },
    );

    this._addEventlistener(playerService, EventType.UPDATE_IS_PLAYING, () => {
      if (playerService.isPlaying) {
        this._startRaf();
      } else {
        this._stopRaf();
      }
    });

    if (playerService.isPlaying) {
      this._startRaf();
    }

    const lm = analyzeSettingsService.liveMonitoringMode;
    if (lm === "m" || lm === "s") {
      this._meterLayout = "ms";
    }
  }

  private _rmsDecay(): number {
    return emaDecayFromReleaseDbPerSec(
      this._analyzeSettingsService.liveLevelMeterReleaseDbPerSec,
    );
  }

  private _startRaf() {
    if (this._rafId) {
      return;
    }
    const loop = () => {
      this._tick();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  private _stopRaf() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  private _effectiveLayout(mon: LiveMonitoringMode): MeterLayout {
    return mon === "m" || mon === "s" ? "ms" : this._meterLayout;
  }

  private _tick() {
    const analysers = this._playerService.getAnalysers();
    if (!analysers) {
      return;
    }

    const fftSize = analysers.left.fftSize;
    if (this._bufL.length !== fftSize) {
      this._bufL = new Float32Array(fftSize);
      this._bufR = new Float32Array(fftSize);
      this._mixL = new Float32Array(fftSize);
      this._mixR = new Float32Array(fftSize);
      this._colA = new Float32Array(fftSize);
      this._colB = new Float32Array(fftSize);
      this._silence = new Float32Array(fftSize);
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

    const mon = this._analyzeSettingsService.liveMonitoringMode;
    const layout = this._effectiveLayout(mon);
    const z = this._silence;
    z.fill(0);

    let labelLeft: string;
    let labelRight: string;
    let srcLeft: Float32Array;
    let srcRight: Float32Array;

    if (layout === "lr") {
      labelLeft = "L";
      labelRight = "R";
      srcLeft = this._mixL;
      srcRight = this._mixR;
    } else {
      labelLeft = "M";
      labelRight = "S";
      encodeMidSideTimeDomain(this._mixL, this._mixR, this._colA, this._colB);
      if (mon === "lr" || mon === "swap") {
        srcLeft = this._colA;
        srcRight = this._colB;
      } else if (mon === "m") {
        srcLeft = this._colA;
        srcRight = z;
      } else if (mon === "s") {
        srcLeft = z;
        srcRight = this._colB;
      } else {
        srcLeft = this._colA;
        srcRight = this._colB;
      }
    }

    this._labelL.textContent = labelLeft;
    this._labelR.textContent = labelRight;

    const decay = this._rmsDecay();
    this._updateChannel(srcLeft, this._stateL, this._clipLedL, decay);
    this._updateChannel(srcRight, this._stateR, this._clipLedR, decay);

    this._numsL.innerHTML =
      `R ${formatDb(this._stateL.smoothedRms)}<br>` +
      `P ${formatDb(this._stateL.peakDb)}`;
    this._numsR.innerHTML =
      `R ${formatDb(this._stateR.smoothedRms)}<br>` +
      `P ${formatDb(this._stateR.peakDb)}`;

    this._draw(this._canvasL, this._wrapL, this._stateL);
    this._draw(this._canvasR, this._wrapR, this._stateR);
    this._layoutScaleTicks();
    this._applyHearingProtection();
  }

  private _applyHearingProtection(): void {
    const settings = this._analyzeSettingsService;
    if (!settings.hearingProtectionEnabled) {
      if (this._playerService.hearingProtectionActive) {
        this._playerService.setHearingProtectionActive(false);
      }
      return;
    }
    const threshold = settings.hearingProtectionPeakDbFs;
    const release = threshold - 3;
    const maxPeak = Math.max(this._stateL.peakDb, this._stateR.peakDb);
    if (maxPeak > threshold) {
      this._playerService.setHearingProtectionActive(true);
    } else if (maxPeak < release) {
      this._playerService.setHearingProtectionActive(false);
    }
  }

  private _updateChannel(
    buf: Float32Array,
    state: ChannelState,
    led: HTMLElement,
    decay: number,
  ) {
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const s = Math.abs(buf[i]);
      sumSq += buf[i] * buf[i];
      if (s > peak) {
        peak = s;
      }
    }
    const rms = Math.sqrt(sumSq / buf.length);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-9));
    const peakDb = 20 * Math.log10(Math.max(peak, 1e-9));

    state.smoothedRms =
      rmsDb < state.smoothedRms
        ? state.smoothedRms * decay + rmsDb * (1 - decay)
        : rmsDb;

    state.peakDb = peakDb;

    if (peakDb > state.peakHold) {
      state.peakHold = peakDb;
      state.peakHoldFrames = peakHoldFrames;
    } else if (state.peakHoldFrames > 0) {
      state.peakHoldFrames--;
    } else {
      state.peakHold = state.peakHold * decay + dbMin * (1 - decay);
    }

    if (peakDb >= dbClipThreshold) {
      state.clipped = true;
      led.classList.add("clipped");
      if (peakDb > state.sessionMaxSamplePeakDbFs) {
        state.sessionMaxSamplePeakDbFs = peakDb;
      }
    }
  }

  private _draw(
    canvas: HTMLCanvasElement,
    wrap: HTMLElement,
    state: ChannelState,
  ) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(wrap.clientWidth));
    const cssH = Math.max(1, Math.floor(wrap.clientHeight));
    const w = Math.min(maxCanvasPx, Math.max(1, Math.round(cssW * dpr)));
    const h = Math.min(maxCanvasPx, Math.max(1, Math.round(cssH * dpr)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, w, h);
    const barW = w;
    if (barW <= 0 || h <= 0) {
      return;
    }

    const dbToY = (db: number) => h * (1 - dbToNorm(db));

    const peakY = dbToY(state.peakDb);
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, "#4caf50");
    gradient.addColorStop(dbToNorm(-6), "#4caf50");
    gradient.addColorStop(dbToNorm(-3), "#ffeb3b");
    gradient.addColorStop(dbToNorm(0), "#f44336");
    gradient.addColorStop(1, "#f44336");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, peakY, barW, h - peakY);

    /* Machined sheen across the bar (left light-catch → right shade). */
    const sheen = ctx.createLinearGradient(0, 0, barW, 0);
    sheen.addColorStop(0, "rgba(255, 255, 255, 0.10)");
    sheen.addColorStop(0.45, "rgba(255, 255, 255, 0.02)");
    sheen.addColorStop(1, "rgba(0, 0, 0, 0.12)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, peakY, barW, h - peakY);

    const rmsY = dbToY(state.smoothedRms);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle =
      state.smoothedRms > -3
        ? "#f44336"
        : state.smoothedRms > -6
          ? "#ffeb3b"
          : "#4caf50";
    ctx.fillRect(0, rmsY, barW, h - rmsY);
    ctx.globalAlpha = 1;

    /* Segmented scale grooves across the bar (instrument bridge feel). */
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    const grooveH = Math.max(1, Math.round(1 * dpr));
    for (const db of ticks) {
      const y = Math.round(dbToY(db));
      ctx.fillRect(0, y, barW, grooveH);
    }

    const holdY = Math.round(dbToY(state.peakHold));
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, holdY);
    ctx.lineTo(barW, holdY);
    ctx.stroke();

    if (
      state.clipped &&
      Number.isFinite(state.sessionMaxSamplePeakDbFs) &&
      state.sessionMaxSamplePeakDbFs > dbClipThreshold
    ) {
      const clipY = dbToY(state.sessionMaxSamplePeakDbFs);
      const headroomTop = dbToY(0);
      const y = Math.min(clipY, headroomTop - 4 * dpr);
      ctx.font = `${Math.max(7, 8 * dpr)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "#f44336";
      ctx.fillText(formatDbFs(state.sessionMaxSamplePeakDbFs), barW / 2, y);
    }
  }

  /* Align DOM scale ticks with the canvas groove lines: the canvas bed is
     shorter than the scale column (clip LED row above), so positions must
     derive from the wrap geometry, not the column height. */
  private _layoutScaleTicks() {
    const col = this._inner.querySelector(".levelMeter__scaleCol");
    if (!col) {
      return;
    }
    const colRect = col.getBoundingClientRect();
    const wrapRect = this._wrapL.getBoundingClientRect();
    const innerTop = wrapRect.top - colRect.top + this._wrapL.clientTop;
    const innerH = this._wrapL.clientHeight;
    if (innerH < 10) {
      return;
    }
    for (const el of col.querySelectorAll<HTMLElement>(".levelMeter__tick")) {
      const db = Number(el.dataset.db);
      const pct = 1 - dbToNorm(db);
      el.style.top = `${innerTop + pct * innerH}px`;
    }
  }

  override dispose() {
    this._stopRaf();
    super.dispose();
  }
}
