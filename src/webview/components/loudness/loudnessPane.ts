/**
 * Inline or fullscreen pane: LUFS + F0 + Onset flux timeline strips.
 */
import "./loudnessComponent.css";
import Component from "../../component";
import { EventType } from "../../events";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import LoudnessService, {
  formatDbTp,
  formatLu,
  formatLufs,
  type LoudnessProfile,
} from "../../services/loudnessService";
import SequenceFeatureService, {
  type SequenceFeatureProfile,
} from "../../services/sequenceFeatureService";
import { quinticBSplineSmooth } from "../../utils/quinticBSpline";
import {
  plotTimeSecFromClientX,
  TIMELINE_PLOT_PAD_LEFT,
  TIMELINE_PLOT_PAD_RIGHT,
  plotWidthPx,
} from "../../utils/timelinePlotLayout";
import {
  clamp01,
  drawHorizontalGrid,
  drawTimeAxisLabels,
  drawTimeSeriesCurve,
  dynamicLinearRange,
  dynamicLogHzRange,
  fillCanvasBackground,
  percentile,
  resizeCanvasToWrap,
} from "../../utils/timelineStripChart";

const fallbackLufsMin = -60;
const fallbackLufsMax = 0;
const minLufsSpan = 12;
const plotPadLeftCssPx = TIMELINE_PLOT_PAD_LEFT;
const plotPadRightCssPx = TIMELINE_PLOT_PAD_RIGHT;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) {
    return "—";
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  }
  return `${sec.toFixed(2)} s`;
}

function nearestValue(
  times: Float32Array,
  values: Float32Array,
  sec: number,
): number {
  if (!times.length || !values.length) {
    return NaN;
  }
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - sec);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return values[best] ?? NaN;
}

function lufsLabel(v: number): string {
  return Number.isFinite(v) ? `${v.toFixed(1)} LUFS` : "—";
}

function hzLabel(v: number): string {
  return Number.isFinite(v) && v > 0 ? `${Math.round(v)} Hz` : "—";
}

function fluxLabel(v: number): string {
  return Number.isFinite(v) ? v.toFixed(3) : "—";
}

function dbTpLabel(v: number): string {
  if (!Number.isFinite(v)) {
    return "—";
  }
  return `${v > 0 ? "+" : ""}${v.toFixed(2)} dBTP`;
}

export type LoudnessPaneVariant = "inline" | "fullscreen";

export interface LoudnessPaneHandlers {
  onExitFullscreen?: () => void;
}

export default class LoudnessPane extends Component {
  private _stripsEl: HTMLElement;
  private _lufsCanvasWrap: HTMLElement;
  private _f0CanvasWrap: HTMLElement;
  private _onsetCanvasWrap: HTMLElement;
  private _lufsCanvas: HTMLCanvasElement;
  private _f0Canvas: HTMLCanvasElement;
  private _onsetCanvas: HTMLCanvasElement;
  private _playhead: HTMLElement;
  private _hoverReadout: HTMLElement;
  private _hoverLine: HTMLElement;
  private _selectionEl: HTMLElement;
  private _summaryEl: HTMLElement;
  private _statusEl: HTMLElement;
  private _f0Placeholder: HTMLElement;
  private _onsetPlaceholder: HTMLElement;
  private _loudnessService: LoudnessService;
  private _sequenceFeatureService: SequenceFeatureService | null;
  private _playerService: PlayerService;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _durationSec: number;
  private _profile: LoudnessProfile | null = null;
  private _sequenceProfile: SequenceFeatureProfile | null = null;
  private _displayShort: Float32Array = new Float32Array(0);
  private _displayMomentary: Float32Array = new Float32Array(0);
  private _displayF0: Float32Array = new Float32Array(0);
  private _displayOnset: Float32Array = new Float32Array(0);
  private _playbackSec = 0;
  private _dragStartX = 0;
  private _dragStartY = 0;
  private _isDragging = false;
  private _variant: LoudnessPaneVariant;
  private _handlers: LoudnessPaneHandlers | undefined;

  constructor(
    mountEl: HTMLElement,
    loudnessService: LoudnessService,
    playerService: PlayerService,
    analyzeSettingsService: AnalyzeSettingsService,
    audioBuffer: AudioBuffer,
    variant: LoudnessPaneVariant,
    handlers?: LoudnessPaneHandlers,
    sequenceFeatureService?: SequenceFeatureService | null,
  ) {
    super();
    this._variant = variant;
    this._handlers = handlers;
    this._loudnessService = loudnessService;
    this._sequenceFeatureService = sequenceFeatureService ?? null;
    this._playerService = playerService;
    this._analyzeSettingsService = analyzeSettingsService;
    this._durationSec = audioBuffer.duration;

    mountEl.classList.add(
      "loudnessComponent",
      variant === "inline"
        ? "loudnessComponent--inlineMount"
        : "loudnessComponent--fullscreenMount",
    );
    mountEl.innerHTML = `
        <div class="loudnessComponent__summary js-loudnessSummary">
          <span class="loudnessComponent__metric">
            <span class="loudnessComponent__metricLabel">LUFS-I</span>
            <span class="loudnessComponent__metricValue js-lufsI">—</span>
          </span>
          <span class="loudnessComponent__metric">
            <span class="loudnessComponent__metricLabel">LRA</span>
            <span class="loudnessComponent__metricValue js-lra">—</span>
          </span>
          <span class="loudnessComponent__metric">
            <span class="loudnessComponent__metricLabel">PLR</span>
            <span class="loudnessComponent__metricValue js-plr">—</span>
          </span>
          <span class="loudnessComponent__metric">
            <span class="loudnessComponent__metricLabel">Max dBTP</span>
            <span class="loudnessComponent__metricValue js-maxTp">—</span>
          </span>
        </div>
        <div class="loudnessComponent__status js-loudnessStatus">Analyzing loudness…</div>
        <div class="loudnessComponent__strips js-loudnessStrips">
          <div class="loudnessComponent__strip loudnessComponent__strip--lufs" data-strip="lufs">
            <div class="loudnessComponent__canvasWrap js-lufsCanvasWrap">
              <span class="loudnessComponent__stripBadge">LUFS</span>
              <canvas class="loudnessComponent__canvas"></canvas>
              <div class="loudnessComponent__legend" aria-hidden="true">
                <div><span class="loudnessComponent__legendLine loudnessComponent__legendLine--short"></span>LUFS-S</div>
                <div><span class="loudnessComponent__legendLine loudnessComponent__legendLine--momentary"></span>LUFS-M</div>
                <div><span class="loudnessComponent__legendLine loudnessComponent__legendLine--integrated"></span>LUFS-I</div>
                <div><span class="loudnessComponent__legendLine loudnessComponent__legendLine--tp"></span>TP &gt; 0</div>
              </div>
            </div>
          </div>
          <div class="loudnessComponent__strip loudnessComponent__strip--f0" data-strip="f0">
            <div class="loudnessComponent__canvasWrap js-f0CanvasWrap">
              <span class="loudnessComponent__stripBadge">F0</span>
              <canvas class="loudnessComponent__canvas"></canvas>
              <div class="loudnessComponent__stripPlaceholder js-f0Placeholder hidden">Essentia unavailable</div>
            </div>
          </div>
          <div class="loudnessComponent__strip loudnessComponent__strip--onset" data-strip="onset">
            <div class="loudnessComponent__canvasWrap js-onsetCanvasWrap">
              <span class="loudnessComponent__stripBadge">Onset</span>
              <canvas class="loudnessComponent__canvas"></canvas>
              <div class="loudnessComponent__stripPlaceholder js-onsetPlaceholder hidden">Essentia unavailable</div>
            </div>
          </div>
          <div class="loudnessComponent__interactionOverlay">
            <div class="loudnessComponent__hoverLine js-loudnessHoverLine"></div>
            <div class="loudnessComponent__hoverReadout js-loudnessHoverReadout" aria-live="polite"></div>
            <div class="loudnessComponent__selection js-loudnessSelection"></div>
            <div class="loudnessComponent__playhead js-loudnessPlayhead"></div>
          </div>
        </div>
      `;

    this._summaryEl = mountEl.querySelector(".js-loudnessSummary");
    this._statusEl = mountEl.querySelector(".js-loudnessStatus");
    this._stripsEl = mountEl.querySelector(".js-loudnessStrips");
    this._lufsCanvasWrap = mountEl.querySelector(".js-lufsCanvasWrap");
    this._f0CanvasWrap = mountEl.querySelector(".js-f0CanvasWrap");
    this._onsetCanvasWrap = mountEl.querySelector(".js-onsetCanvasWrap");
    this._lufsCanvas = this._lufsCanvasWrap.querySelector("canvas");
    this._f0Canvas = this._f0CanvasWrap.querySelector("canvas");
    this._onsetCanvas = this._onsetCanvasWrap.querySelector("canvas");
    this._f0Placeholder = mountEl.querySelector(".js-f0Placeholder");
    this._onsetPlaceholder = mountEl.querySelector(".js-onsetPlaceholder");
    this._playhead = mountEl.querySelector(".js-loudnessPlayhead");
    this._hoverLine = mountEl.querySelector(".js-loudnessHoverLine");
    this._hoverReadout = mountEl.querySelector(".js-loudnessHoverReadout");
    this._selectionEl = mountEl.querySelector(".js-loudnessSelection");

    this._addEventlistener(
      playerService,
      EventType.UPDATE_PLAYBACK_POSITION,
      (e: CustomEventInit<{ sec: number }>) => {
        const sec =
          typeof e.detail?.sec === "number" ? e.detail.sec : this._playbackSec;
        this._playbackSec = sec;
        this._updatePlayhead();
      },
    );

    this._addEventlistener(
      playerService,
      EventType.UPDATE_SEEKBAR,
      (e: CustomEventInit<{ pos?: number }>) => {
        if (typeof e.detail?.pos === "number") {
          this._playbackSec = e.detail.pos;
          this._updatePlayhead();
        }
      },
    );

    const redrawForTimeRange = () => {
      this._draw();
      this._updatePlayhead();
    };
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_MIN_TIME,
      redrawForTimeRange,
    );
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_MAX_TIME,
      redrawForTimeRange,
    );

    this._wirePointerInteraction();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this._draw());
      ro.observe(this._stripsEl);
      this._register({ dispose: () => ro.disconnect() });
    }

    void this._loadProfile();
  }

  private async _loadProfile() {
    const setStatus = (text: string) => {
      if (this._statusEl) {
        this._statusEl.textContent = text;
        this._statusEl.style.display = text ? "block" : "none";
      }
    };

    try {
      setStatus("Analyzing loudness…");
      const loudnessPromise = this._loudnessService.analyzeFileProfile();
      const sequencePromise = this._sequenceFeatureService
        ? this._sequenceFeatureService.analyzeProfile(undefined, (pct) => {
            setStatus(`Analyzing features… ${Math.round(pct)}%`);
          })
        : Promise.resolve(null);

      const [profile, sequenceProfile] = await Promise.all([
        loudnessPromise,
        sequencePromise,
      ]);

      this._profile = profile;
      this._displayShort = quinticBSplineSmooth(profile.shortTermLufs);
      this._displayMomentary = quinticBSplineSmooth(profile.momentaryLufs);
      this._updateSummary(profile);

      if (sequenceProfile) {
        this._sequenceProfile = sequenceProfile;
        this._displayF0 = sequenceProfile.f0Hz;
        this._displayOnset = quinticBSplineSmooth(sequenceProfile.onsetFlux);
        this._f0Placeholder.classList.add("hidden");
        this._onsetPlaceholder.classList.add("hidden");
      } else {
        this._sequenceProfile = null;
        this._f0Placeholder.classList.remove("hidden");
        this._onsetPlaceholder.classList.remove("hidden");
      }

      setStatus("");
      this._draw();
      this._updatePlayhead();
    } catch {
      setStatus("Could not analyze loudness.");
    }
  }

  private _updateSummary(profile: LoudnessProfile) {
    const set = (sel: string, text: string) => {
      const el = this._summaryEl?.querySelector(sel);
      if (el) {
        el.textContent = text;
      }
    };
    set(".js-lufsI", formatLufs(profile.integratedLufs));
    set(".js-lra", formatLu(profile.loudnessRangeLu));
    set(".js-plr", formatLu(profile.plrLu));
    set(".js-maxTp", formatDbTp(profile.maxTruePeakDbTp, 2));
  }

  public scheduleRedraw(): void {
    this._draw();
    this._updatePlayhead();
  }

  private _updatePlayhead() {
    if (!this._profile || this._durationSec <= 0) {
      this._playhead.style.display = "none";
      return;
    }
    const { minTime, maxTime } = this._visibleTimeRange();
    const span = maxTime - minTime;
    if (
      span <= 0 ||
      this._playbackSec < minTime ||
      this._playbackSec > maxTime
    ) {
      this._playhead.style.display = "none";
      return;
    }
    const plot = this._plotCssRect();
    const x =
      plot.left + clamp01((this._playbackSec - minTime) / span) * plot.width;
    this._playhead.style.display = "block";
    this._playhead.style.left = `${x}px`;
  }

  private _visibleTimeRange(): { minTime: number; maxTime: number } {
    const minTime = Math.max(0, this._analyzeSettingsService.minTime);
    const maxTime = Math.min(
      this._durationSec,
      this._analyzeSettingsService.maxTime,
    );
    if (maxTime <= minTime) {
      return { minTime: 0, maxTime: this._durationSec };
    }
    return { minTime, maxTime };
  }

  private _dynamicLufsRange(
    minTime: number,
    maxTime: number,
  ): { min: number; max: number; ticks: number[] } {
    const profile = this._profile;
    if (!profile) {
      return { min: fallbackLufsMin, max: fallbackLufsMax, ticks: [] };
    }

    const values: number[] = [];
    for (let i = 0; i < profile.timeSec.length; i++) {
      const t = profile.timeSec[i];
      if (t < minTime || t > maxTime) {
        continue;
      }
      const s = this._displayShort[i];
      const m = this._displayMomentary[i];
      if (Number.isFinite(s)) {
        values.push(s);
      }
      if (Number.isFinite(m)) {
        values.push(m);
      }
    }

    const integrated = profile.integratedLufs;
    const p02 = percentile(values, 0.02);
    const p98 = percentile(values, 0.98);
    if (!Number.isFinite(p02) || !Number.isFinite(p98)) {
      const mid = Number.isFinite(integrated) ? integrated : -23;
      const min = Math.floor((mid - minLufsSpan / 2) / 3) * 3;
      const max = min + minLufsSpan;
      const ticks: number[] = [];
      for (let t = min; t <= max; t += 3) {
        ticks.push(t);
      }
      return { min, max, ticks };
    }

    let min = Number.isFinite(integrated) ? Math.min(p02, integrated) : p02;
    let max = Number.isFinite(integrated) ? Math.max(p98, integrated) : p98;
    const pad = Math.max(2, (max - min) * 0.15);
    min = Math.floor((min - pad) / 3) * 3;
    max = Math.ceil((max + pad) / 3) * 3;
    if (max - min < minLufsSpan) {
      const mid = (min + max) / 2;
      min = Math.floor((mid - minLufsSpan / 2) / 3) * 3;
      max = min + minLufsSpan;
    }

    const ticks: number[] = [];
    for (let t = Math.ceil(min / 3) * 3; t <= max; t += 3) {
      ticks.push(t);
    }
    return { min, max, ticks };
  }

  private _nearestPositiveTp(
    sec: number,
    toleranceSec: number,
  ): { timeSec: number; dbTp: number } | null {
    const profile = this._profile;
    if (!profile || !profile.truePeakDbTp.length) {
      return null;
    }
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < profile.timeSec.length; i++) {
      const dbTp = profile.truePeakDbTp[i];
      if (!Number.isFinite(dbTp) || dbTp <= 0) {
        continue;
      }
      const dist = Math.abs(profile.timeSec[i] - sec);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestDist > toleranceSec) {
      return null;
    }
    return {
      timeSec: profile.timeSec[bestIdx],
      dbTp: profile.truePeakDbTp[bestIdx],
    };
  }

  private _canvasBackgroundColor(wrap: HTMLElement): string {
    const css = getComputedStyle(wrap);
    return (
      css.getPropertyValue("--vscode-editor-background").trim() ||
      css.backgroundColor ||
      "#1e1e1e"
    );
  }

  private _plotCssRect(): { left: number; right: number; width: number } {
    const rect = this._stripsEl.getBoundingClientRect();
    const left = plotPadLeftCssPx;
    const width = plotWidthPx(rect.width, plotPadLeftCssPx, plotPadRightCssPx);
    return { left, right: left + width, width };
  }

  private _secFromClientX(clientX: number): number {
    const rect = this._stripsEl.getBoundingClientRect();
    const { minTime, maxTime } = this._visibleTimeRange();
    return plotTimeSecFromClientX(
      clientX,
      rect,
      minTime,
      maxTime,
      plotPadLeftCssPx,
      plotPadRightCssPx,
    );
  }

  private _wirePointerInteraction(): void {
    this._addEventlistener(
      this._stripsEl,
      EventType.MOUSE_MOVE,
      (event: MouseEvent) => {
        if (!this._profile) {
          return;
        }
        const rect = this._stripsEl.getBoundingClientRect();
        const plot = this._plotCssRect();
        const x = clamp01(
          (event.clientX - rect.left - plot.left) / Math.max(1, plot.width),
        );
        const sec = this._secFromClientX(event.clientX);
        const { minTime, maxTime } = this._visibleTimeRange();
        const marker = this._nearestPositiveTp(
          sec,
          ((maxTime - minTime) / Math.max(1, plot.width)) * 6,
        );
        const shortTerm = nearestValue(
          this._profile.timeSec,
          this._displayShort,
          sec,
        );
        const momentary = nearestValue(
          this._profile.timeSec,
          this._displayMomentary,
          sec,
        );

        let readout = `${formatTime(sec)} | S ${lufsLabel(shortTerm)} | M ${lufsLabel(momentary)}`;
        if (this._sequenceProfile) {
          const f0 = nearestValue(
            this._sequenceProfile.timeSec,
            this._displayF0,
            sec,
          );
          const onset = nearestValue(
            this._sequenceProfile.timeSec,
            this._displayOnset,
            sec,
          );
          readout += ` | F0 ${hzLabel(f0)} | Onset ${fluxLabel(onset)}`;
        }
        if (marker) {
          readout = `${formatTime(marker.timeSec)} | TP ${dbTpLabel(marker.dbTp)}`;
        }

        this._hoverLine.style.display = "block";
        this._hoverLine.style.left = `${plot.left + x * plot.width}px`;
        this._hoverReadout.style.visibility = "visible";
        this._hoverReadout.textContent = readout;
        this._hoverReadout.style.left = `${Math.min(
          event.clientX + 12,
          window.innerWidth - this._hoverReadout.offsetWidth - 8,
        )}px`;
        this._hoverReadout.style.top = `${Math.max(4, event.clientY - this._hoverReadout.offsetHeight - 10)}px`;

        if (this._isDragging) {
          const x0 = Math.min(this._dragStartX, event.clientX) - rect.left;
          const x1 = Math.max(this._dragStartX, event.clientX) - rect.left;
          const clampedX0 = Math.max(plot.left, Math.min(plot.right, x0));
          const clampedX1 = Math.max(plot.left, Math.min(plot.right, x1));
          this._selectionEl.style.display = "block";
          this._selectionEl.style.left = `${clampedX0}px`;
          this._selectionEl.style.width = `${Math.max(0, clampedX1 - clampedX0)}px`;
        }
      },
    );

    this._addEventlistener(this._stripsEl, "mouseleave", () => {
      this._hoverLine.style.display = "none";
      this._hoverReadout.style.visibility = "hidden";
      if (!this._isDragging) {
        this._selectionEl.style.display = "none";
      }
    });

    this._addEventlistener(
      this._stripsEl,
      EventType.MOUSE_DOWN,
      (event: MouseEvent) => {
        if (event.button === 0) {
          this._dragStartX = event.clientX;
          this._dragStartY = event.clientY;
          this._isDragging = true;
          this._selectionEl.style.display = "none";
        } else if (event.button === 2) {
          event.preventDefault();
          if (this._variant === "fullscreen") {
            this._handlers?.onExitFullscreen?.();
          } else {
            this._analyzeSettingsService.resetToDefaultTimeRange();
          }
        }
      },
    );

    this._addEventlistener(
      this._stripsEl,
      EventType.MOUSE_UP,
      (event: MouseEvent) => {
        if (!this._isDragging) {
          return;
        }
        this._isDragging = false;
        this._selectionEl.style.display = "none";
        const moved =
          Math.abs(event.clientX - this._dragStartX) >= 3 ||
          Math.abs(event.clientY - this._dragStartY) >= 3;
        if (!moved) {
          this._playerService.setPlaybackPosition(
            this._secFromClientX(event.clientX),
          );
          return;
        }
        const t0 = this._secFromClientX(this._dragStartX);
        const t1 = this._secFromClientX(event.clientX);
        if (Math.abs(t1 - t0) > 0.01) {
          this._analyzeSettingsService.minTime = Math.min(t0, t1);
          this._analyzeSettingsService.maxTime = Math.max(t0, t1);
        }
      },
    );

    this._addEventlistener(
      this._stripsEl,
      EventType.CONTEXT_MENU,
      (event: MouseEvent) => {
        event.preventDefault();
        if (this._variant === "fullscreen") {
          this._handlers?.onExitFullscreen?.();
        }
      },
    );
  }

  private _draw() {
    this._drawLufs();
    this._drawF0();
    this._drawOnset();
  }

  private _drawLufs() {
    const profile = this._profile;
    if (!profile || profile.timeSec.length < 2) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(this._lufsCanvasWrap.clientWidth));
    const cssH = Math.max(1, Math.floor(this._lufsCanvasWrap.clientHeight));
    const plot = resizeCanvasToWrap(this._lufsCanvas, cssW, cssH, dpr);
    const ctx = this._lufsCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    fillCanvasBackground(
      ctx,
      plot,
      this._canvasBackgroundColor(this._lufsCanvasWrap),
    );

    const { minTime, maxTime } = this._visibleTimeRange();
    const lufsRange = this._dynamicLufsRange(minTime, maxTime);

    const lufsToY = (lufs: number) => {
      const n = clamp01(
        (lufs - lufsRange.min) / (lufsRange.max - lufsRange.min),
      );
      if (!Number.isFinite(n)) {
        return NaN;
      }
      return plot.padT + plot.plotH * (1 - n);
    };

    drawHorizontalGrid(ctx, plot, lufsRange.ticks, lufsToY, (v) => String(v));

    const integratedY = lufsToY(profile.integratedLufs);
    if (Number.isFinite(integratedY)) {
      ctx.save();
      ctx.strokeStyle = "rgba(244, 67, 54, 0.35)";
      ctx.lineWidth = 1 * plot.dpr;
      ctx.setLineDash([4 * plot.dpr, 4 * plot.dpr]);
      ctx.beginPath();
      ctx.moveTo(plot.padL, integratedY);
      ctx.lineTo(plot.padL + plot.plotW, integratedY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(244, 67, 54, 0.7)";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.font = `${9 * plot.dpr}px monospace`;
      ctx.fillText(
        `I ${profile.integratedLufs.toFixed(1)}`,
        plot.padL + 4 * plot.dpr,
        integratedY - 2 * plot.dpr,
      );
      ctx.restore();
    }

    const tSpan = Math.max(1e-9, maxTime - minTime);
    ctx.save();
    ctx.strokeStyle = "rgba(244, 67, 54, 0.55)";
    ctx.fillStyle = "rgba(244, 67, 54, 0.85)";
    ctx.lineWidth = 1 * plot.dpr;
    for (let i = 0; i < profile.timeSec.length; i++) {
      const time = profile.timeSec[i];
      const dbTp = profile.truePeakDbTp[i];
      if (
        time < minTime ||
        time > maxTime ||
        !Number.isFinite(dbTp) ||
        dbTp <= 0
      ) {
        continue;
      }
      const x = plot.padL + ((time - minTime) / tSpan) * plot.plotW;
      ctx.beginPath();
      ctx.moveTo(x, plot.padT);
      ctx.lineTo(x, plot.padT + plot.plotH);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, plot.padT + 4 * plot.dpr, 2.5 * plot.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    drawTimeSeriesCurve(
      ctx,
      plot,
      profile.timeSec,
      this._displayMomentary,
      minTime,
      maxTime,
      lufsToY,
      { color: "rgba(255, 214, 64, 0.95)", lineWidth: 1, alpha: 0.8 },
    );
    drawTimeSeriesCurve(
      ctx,
      plot,
      profile.timeSec,
      this._displayShort,
      minTime,
      maxTime,
      lufsToY,
      { color: "rgba(0,180,216,0.95)", lineWidth: 1.5, alpha: 1 },
    );
  }

  private _drawF0() {
    const seq = this._sequenceProfile;
    if (!seq || seq.timeSec.length < 2) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(this._f0CanvasWrap.clientWidth));
    const cssH = Math.max(1, Math.floor(this._f0CanvasWrap.clientHeight));
    const plot = resizeCanvasToWrap(this._f0Canvas, cssW, cssH, dpr);
    const ctx = this._f0Canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    fillCanvasBackground(
      ctx,
      plot,
      this._canvasBackgroundColor(this._f0CanvasWrap),
    );

    const { minTime, maxTime } = this._visibleTimeRange();
    const hzRange = dynamicLogHzRange(
      seq.timeSec,
      this._displayF0,
      minTime,
      maxTime,
    );
    const logMin = Math.log10(hzRange.minHz);
    const logMax = Math.log10(hzRange.maxHz);

    const hzToY = (hz: number) => {
      if (!Number.isFinite(hz) || hz <= 0) {
        return NaN;
      }
      const n = clamp01((Math.log10(hz) - logMin) / (logMax - logMin));
      return plot.padT + plot.plotH * (1 - n);
    };

    drawHorizontalGrid(ctx, plot, hzRange.ticks, hzToY, (v) =>
      v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)),
    );

    drawTimeSeriesCurve(
      ctx,
      plot,
      seq.timeSec,
      this._displayF0,
      minTime,
      maxTime,
      hzToY,
      { color: "rgba(199, 125, 255, 0.95)", lineWidth: 1.5, alpha: 1 },
    );
  }

  private _drawOnset() {
    const seq = this._sequenceProfile;
    if (!seq || seq.timeSec.length < 2) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(this._onsetCanvasWrap.clientWidth));
    const cssH = Math.max(1, Math.floor(this._onsetCanvasWrap.clientHeight));
    const plot = resizeCanvasToWrap(this._onsetCanvas, cssW, cssH, dpr);
    const ctx = this._onsetCanvas.getContext("2d");
    if (!ctx) {
      return;
    }

    fillCanvasBackground(
      ctx,
      plot,
      this._canvasBackgroundColor(this._onsetCanvasWrap),
    );

    const { minTime, maxTime } = this._visibleTimeRange();
    const fluxRange = dynamicLinearRange(
      seq.timeSec,
      this._displayOnset,
      minTime,
      maxTime,
    );

    const fluxToY = (v: number) => {
      const n = clamp01((v - fluxRange.min) / (fluxRange.max - fluxRange.min));
      if (!Number.isFinite(n)) {
        return NaN;
      }
      return plot.padT + plot.plotH * (1 - n);
    };

    drawHorizontalGrid(ctx, plot, fluxRange.ticks, fluxToY, (v) =>
      v.toFixed(2),
    );

    drawTimeSeriesCurve(
      ctx,
      plot,
      seq.timeSec,
      this._displayOnset,
      minTime,
      maxTime,
      fluxToY,
      { color: "rgba(255, 159, 67, 0.95)", lineWidth: 1.5, alpha: 1 },
    );

    drawTimeAxisLabels(ctx, plot, minTime, maxTime, formatTime);
  }
}
