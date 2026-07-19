import { EventType } from "../../events";
import Component from "../../component";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import {
  emaDecayFromTimeConstant,
  releaseTimeConstantSec,
} from "../../utils/liveBallistics";
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
const ticks: number[] = [6, 0, -3, -6, -12, -18, -24, -36, -48, -60];

/**
 * Display ballistics — one-pole IIR with fast attack / slow release, the
 * standard scheme for professional meters (IEC 60268-18 "Fast" = 125 ms
 * time constant, impulse rise ≈ 35 ms; EBU Tech 3341 momentary = 400 ms
 * window). Attack is set between the impulse rise and the Fast constant:
 * lively on transients but without per-frame twitch. Release reuses the
 * user-facing "Level meter release" dB/s setting.
 */
const meterAttackTimeSec = 0.05;

/** White peak-hold line holds the max this long (real time) before falling
    at the release rate — the classic PPM-style "peak catch". */
const peakHoldMs = 2000;

/**
 * Max time-domain samples the meter taps per frame. The meter shares the live
 * analysers with the spectrum analyzer, whose fftSize can reach 32768 (CQT
 * mode); metering only needs a short window, so the tap is capped here to
 * decouple per-frame meter cost from the spectrum FFT setting.
 */
const meterTapSizeMax = 2048;

/** Cap canvas resolution at 2x: beyond that, per-frame repaint cost grows
    with dpr^2 for no visible gain on a meter this small. */
const maxDevicePixelRatio = 2;

function dbToNorm(db: number): number {
  return Math.max(0, Math.min(1, (db - dbMin) / (dbMax - dbMin)));
}

const maxCanvasPx = 4096;

type MeterLayout = "lr" | "ms";

interface ChannelState {
  smoothedRms: number;
  /** Smoothed display peak: instant attack, release-timed fall (no flicker). */
  smoothedPeak: number;
  peakDb: number;
  peakHold: number;
  /** Timestamp (ms) until which peakHold stays frozen. */
  peakHoldDeadlineMs: number;
  clipped: boolean;
  /** Session maximum sample peak (dBFS) when above 0 dBFS. */
  sessionMaxSamplePeakDbFs: number;
}

/** Size-keyed cached paint for one meter canvas: the static gradient +
    grooves overlay only need rebuilding when the canvas resizes; signal
    colors are resolved from design tokens at the same time. */
interface MeterPaintCache {
  w: number;
  h: number;
  main: CanvasGradient;
  grooves: HTMLCanvasElement;
  /** Peak tip / peak-hold line color (--viz-readout). */
  readout: string;
  /** Clip indicator text color (--signal-red). */
  clipText: string;
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
  private _rmsTextL: HTMLElement;
  private _peakTextL: HTMLElement;
  private _rmsTextR: HTMLElement;
  private _peakTextR: HTMLElement;
  private _labelL: HTMLElement;
  private _labelR: HTMLElement;
  private _scaleCol: HTMLElement | null;

  private _playerService: PlayerService;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _rafId: number = 0;
  private _bufL: Float32Array = new Float32Array(meterTapSizeMax);
  private _bufR: Float32Array = new Float32Array(meterTapSizeMax);
  private _colA: Float32Array = new Float32Array(meterTapSizeMax);
  private _colB: Float32Array = new Float32Array(meterTapSizeMax);
  /** Read-only silence source for solo M/S; zero-initialized and never
      written, so it never needs re-filling. */
  private _silence: Float32Array = new Float32Array(meterTapSizeMax);
  private _mixL: Float32Array = new Float32Array(meterTapSizeMax);
  private _mixR: Float32Array = new Float32Array(meterTapSizeMax);
  private _stateL: ChannelState = {
    smoothedRms: dbMin,
    smoothedPeak: dbMin,
    peakDb: dbMin,
    peakHold: dbMin,
    peakHoldDeadlineMs: 0,
    clipped: false,
    sessionMaxSamplePeakDbFs: Number.NEGATIVE_INFINITY,
  };
  private _stateR: ChannelState = {
    smoothedRms: dbMin,
    smoothedPeak: dbMin,
    peakDb: dbMin,
    peakHold: dbMin,
    peakHoldDeadlineMs: 0,
    clipped: false,
    sessionMaxSamplePeakDbFs: Number.NEGATIVE_INFINITY,
  };

  /** L–R vs M–S column semantics (stereo only). Solo M/S forces M–S from monitor mode. */
  private _meterLayout: MeterLayout = "lr";

  /** RMS/peak release time constant (s), refreshed on settings changes;
      combined with the real frame dt at tick time so ballistics are
      identical at any display refresh rate. */
  private _releaseTauCached: number;

  /** Previous rAF timestamp (ms) for the frame-rate-independent decay. */
  private _lastTickMs = 0;

  private _paintCache = new WeakMap<HTMLCanvasElement, MeterPaintCache>();

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
            <span class="levelMeter__footerNums"><span class="js-meterRmsL">R —</span><br><span class="js-meterPeakL">P —</span></span>
          </div>
          <div class="levelMeter__footerCh">
            <span class="levelMeter__footerLabel js-meterLabelR">R</span>
            <span class="levelMeter__footerNums"><span class="js-meterRmsR">R —</span><br><span class="js-meterPeakR">P —</span></span>
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
    this._rmsTextL = containerEl.querySelector(".js-meterRmsL");
    this._peakTextL = containerEl.querySelector(".js-meterPeakL");
    this._rmsTextR = containerEl.querySelector(".js-meterRmsR");
    this._peakTextR = containerEl.querySelector(".js-meterPeakR");
    this._labelL = containerEl.querySelector(".js-meterLabelL");
    this._labelR = containerEl.querySelector(".js-meterLabelR");
    this._scaleCol = containerEl.querySelector(".levelMeter__scaleCol");

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

    this._releaseTauCached = releaseTimeConstantSec(
      analyzeSettingsService.liveLevelMeterReleaseDbPerSec,
    );
    this._addEventlistener(
      this._analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_LEVEL_METER_SMOOTHING,
      () => {
        this._releaseTauCached = releaseTimeConstantSec(
          this._analyzeSettingsService.liveLevelMeterReleaseDbPerSec,
        );
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

    /* Scale-tick alignment depends only on layout geometry, not on audio:
       recompute on resize instead of every animation frame. (Also fires once
       on observe, covering first layout.) */
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this._layoutScaleTicks());
      ro.observe(this._inner);
      this._register({ dispose: () => ro.disconnect() });
    }
  }

  private _startRaf() {
    if (this._rafId) {
      return;
    }
    const loop = (nowMs: number) => {
      this._tick(nowMs);
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

  private _tick(nowMs: number) {
    const analysers = this._playerService.getAnalysers();
    if (!analysers) {
      return;
    }

    /* Real frame delta → frame-rate-independent ballistics (clamped so a
       backgrounded tab's long gap releases smoothly instead of jumping). */
    const dtSec =
      this._lastTickMs > 0
        ? Math.min(Math.max((nowMs - this._lastTickMs) / 1000, 0), 0.1)
        : 0;
    this._lastTickMs = nowMs;
    const attackDecay = emaDecayFromTimeConstant(meterAttackTimeSec, dtSec);
    const releaseDecay = emaDecayFromTimeConstant(
      this._releaseTauCached,
      dtSec,
    );

    /* Tap at most meterTapSizeMax samples even when the shared analysers run
       at the spectrum's fftSize (up to 32768 in CQT mode): getFloatTimeDomain
       Data fills the provided array up to its length. */
    const tapSize = Math.min(analysers.left.fftSize, meterTapSizeMax);
    if (this._bufL.length !== tapSize) {
      this._bufL = new Float32Array(tapSize);
      this._bufR = new Float32Array(tapSize);
      this._mixL = new Float32Array(tapSize);
      this._mixR = new Float32Array(tapSize);
      this._colA = new Float32Array(tapSize);
      this._colB = new Float32Array(tapSize);
      this._silence = new Float32Array(tapSize);
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

    if (this._labelL.textContent !== labelLeft) {
      this._labelL.textContent = labelLeft;
    }
    if (this._labelR.textContent !== labelRight) {
      this._labelR.textContent = labelRight;
    }

    this._updateChannel(
      srcLeft,
      this._stateL,
      this._clipLedL,
      attackDecay,
      releaseDecay,
      nowMs,
    );
    this._updateChannel(
      srcRight,
      this._stateR,
      this._clipLedR,
      attackDecay,
      releaseDecay,
      nowMs,
    );

    this._updateReadout(
      this._rmsTextL,
      this._peakTextL,
      this._stateL.smoothedRms,
      this._stateL.smoothedPeak,
    );
    this._updateReadout(
      this._rmsTextR,
      this._peakTextR,
      this._stateR.smoothedRms,
      this._stateR.smoothedPeak,
    );

    this._draw(this._canvasL, this._wrapL, this._stateL);
    this._draw(this._canvasR, this._wrapR, this._stateR);
    this._applyHearingProtection();
  }

  /** Write a readout line only when its text actually changed (avoids DOM
      node churn at frame rate while idle). */
  private _updateReadout(
    rmsEl: HTMLElement,
    peakEl: HTMLElement,
    smoothedRms: number,
    peakDb: number,
  ) {
    const rmsText = `R ${formatDb(smoothedRms)}`;
    if (rmsEl.textContent !== rmsText) {
      rmsEl.textContent = rmsText;
    }
    const peakText = `P ${formatDb(peakDb)}`;
    if (peakEl.textContent !== peakText) {
      peakEl.textContent = peakText;
    }
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
    attackDecay: number,
    releaseDecay: number,
    nowMs: number,
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

    /* RMS: smoothed rise (attack time constant) and release-timed fall —
       the classic one-pole meter ballistic. */
    state.smoothedRms =
      rmsDb >= state.smoothedRms
        ? state.smoothedRms * attackDecay + rmsDb * (1 - attackDecay)
        : state.smoothedRms * releaseDecay + rmsDb * (1 - releaseDecay);

    /* Raw frame peak is kept for clip detection / hearing protection. */
    state.peakDb = peakDb;

    /* Displayed peak: instant attack so transients are never missed, but a
       release-timed fall so the bar tip glides instead of flickering. */
    state.smoothedPeak =
      peakDb >= state.smoothedPeak
        ? peakDb
        : state.smoothedPeak * releaseDecay + peakDb * (1 - releaseDecay);

    /* Peak-hold line: freeze at the max for peakHoldMs (real time), then
       decay at the release rate. */
    if (peakDb > state.peakHold) {
      state.peakHold = peakDb;
      state.peakHoldDeadlineMs = nowMs + peakHoldMs;
    } else if (nowMs >= state.peakHoldDeadlineMs) {
      state.peakHold =
        state.peakHold * releaseDecay + dbMin * (1 - releaseDecay);
    }

    if (peakDb >= dbClipThreshold) {
      state.clipped = true;
      led.classList.add("clipped");
      if (peakDb > state.sessionMaxSamplePeakDbFs) {
        state.sessionMaxSamplePeakDbFs = peakDb;
      }
    }
  }

  /** Resolve viz signal colors from the design tokens (design-demo
      gallery.html is the source of truth); done once per canvas resize. */
  private _resolveSignalColors(canvas: HTMLCanvasElement): {
    green: string;
    yellow: string;
    red: string;
    readout: string;
  } {
    const cs = getComputedStyle(canvas);
    const get = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;
    return {
      green: get("--signal-green", "#82a35f"),
      yellow: get("--signal-yellow", "#d9b84a"),
      red: get("--signal-red", "#c0553f"),
      readout: get("--viz-readout", "rgba(236, 229, 211, 0.95)"),
    };
  }

  /** Classic segmented meter gradient: green body, yellow band from −6 to
      −3 dB, red above −3 dB (design-demo LevelMeter layout, hard stops). */
  private _buildMainGradient(
    ctx: CanvasRenderingContext2D,
    h: number,
    colors: { green: string; yellow: string; red: string },
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, colors.green);
    gradient.addColorStop(dbToNorm(-6), colors.green);
    gradient.addColorStop(dbToNorm(-6), colors.yellow);
    gradient.addColorStop(dbToNorm(-3), colors.yellow);
    gradient.addColorStop(dbToNorm(-3), colors.red);
    gradient.addColorStop(1, colors.red);
    return gradient;
  }

  /** Segmented scale grooves across the bar (instrument bridge feel); baked
      once per canvas size and blitted per frame. */
  private _buildGrooveOverlay(
    w: number,
    h: number,
    dpr: number,
  ): HTMLCanvasElement {
    const overlay = document.createElement("canvas");
    overlay.width = w;
    overlay.height = h;
    const octx = overlay.getContext("2d");
    if (octx) {
      octx.fillStyle = "rgba(0, 0, 0, 0.35)";
      const grooveH = Math.max(1, Math.round(1 * dpr));
      for (const db of ticks) {
        const y = Math.round(h * (1 - dbToNorm(db)));
        octx.fillRect(0, y, w, grooveH);
      }
    }
    return overlay;
  }

  private _getPaintCache(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dpr: number,
  ): MeterPaintCache {
    let paint = this._paintCache.get(canvas);
    if (!paint || paint.w !== w || paint.h !== h) {
      const colors = this._resolveSignalColors(canvas);
      paint = {
        w,
        h,
        main: this._buildMainGradient(ctx, h, colors),
        grooves: this._buildGrooveOverlay(w, h, dpr),
        readout: colors.readout,
        clipText: colors.red,
      };
      this._paintCache.set(canvas, paint);
    }
    return paint;
  }

  private _draw(
    canvas: HTMLCanvasElement,
    wrap: HTMLElement,
    state: ChannelState,
  ) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio);
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

    const paint = this._getPaintCache(canvas, ctx, w, h, dpr);
    const dbToY = (db: number) => h * (1 - dbToNorm(db));

    /* Peak bar: full width but dimmed, so the brighter RMS core inside it
       stays readable — both levels are visible at once. */
    const peakY = dbToY(state.smoothedPeak);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = paint.main;
    ctx.fillRect(0, peakY, barW, h - peakY);
    ctx.globalAlpha = 1;

    /* RMS core: full-brightness inset column in the same gradient material;
       the dimmed peak "wings" around it show how far the peak reaches
       beyond the RMS body. */
    const rmsY = dbToY(state.smoothedRms);
    const coreW = Math.max(Math.round(2 * dpr), Math.round(barW * 0.6));
    const coreX = Math.round((barW - coreW) / 2);
    ctx.fillStyle = paint.main;
    ctx.fillRect(coreX, rmsY, coreW, h - rmsY);

    /* Readout tip line at the exact smoothed peak — keeps the peak legible
       even when peak ≈ RMS and the dim bar hides behind the core. */
    if (h - peakY > 0) {
      ctx.fillStyle = paint.readout;
      ctx.fillRect(
        0,
        Math.round(peakY),
        barW,
        Math.max(1, Math.round(1.5 * dpr)),
      );
    }

    ctx.drawImage(paint.grooves, 0, 0);

    const holdY = Math.round(dbToY(state.peakHold));
    ctx.strokeStyle = paint.readout;
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
      ctx.fillStyle = paint.clipText;
      ctx.fillText(formatDbFs(state.sessionMaxSamplePeakDbFs), barW / 2, y);
    }
  }

  /* Align DOM scale ticks with the canvas groove lines: the canvas bed is
     shorter than the scale column (clip LED row above), so positions must
     derive from the wrap geometry, not the column height. Driven by a
     ResizeObserver on the meter root — geometry-only, never per frame. */
  private _layoutScaleTicks() {
    const col = this._scaleCol;
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
