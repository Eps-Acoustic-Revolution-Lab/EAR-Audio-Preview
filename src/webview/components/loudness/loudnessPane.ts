/**
 * Inline or fullscreen pane: plots LUFS profile and handles pointer interaction.
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
import { quinticBSplineSmooth } from "../../utils/quinticBSpline";
import {
  TIMELINE_PLOT_PAD_LEFT,
  TIMELINE_PLOT_PAD_RIGHT,
  plotWidthPx,
  timeSecToPlotX,
} from "../../utils/timelinePlotLayout";

const fallbackLufsMin = -60;
const fallbackLufsMax = 0;
const minLufsSpan = 12;
const plotPadLeftCssPx = TIMELINE_PLOT_PAD_LEFT;
const plotPadRightCssPx = TIMELINE_PLOT_PAD_RIGHT;
const plotPadTopCssPx = 12;
const plotPadBottomCssPx = 22;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

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

function percentile(values: number[], p: number): number {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!finite.length) {
    return NaN;
  }
  const pos = clamp01(p) * (finite.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) {
    return finite[lo];
  }
  return finite[lo] + (finite[hi] - finite[lo]) * (pos - lo);
}

function lufsLabel(v: number): string {
  return Number.isFinite(v) ? `${v.toFixed(1)} LUFS` : "—";
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
  private _canvas: HTMLCanvasElement;
  private _canvasWrap: HTMLElement;
  private _playhead: HTMLElement;
  private _hoverReadout: HTMLElement;
  private _hoverLine: HTMLElement;
  private _selectionEl: HTMLElement;
  private _summaryEl: HTMLElement;
  private _statusEl: HTMLElement;
  private _loudnessService: LoudnessService;
  private _playerService: PlayerService;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _durationSec: number;
  private _profile: LoudnessProfile | null = null;
  private _displayShort: Float32Array = new Float32Array(0);
  private _displayMomentary: Float32Array = new Float32Array(0);
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
  ) {
    super();
    this._variant = variant;
    this._handlers = handlers;
    this._loudnessService = loudnessService;
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
        <div class="loudnessComponent__canvasWrap js-loudnessCanvasWrap">
          <canvas class="loudnessComponent__canvas"></canvas>
          <div class="loudnessComponent__legend" aria-hidden="true">
            <div><span class="loudnessComponent__legendLine loudnessComponent__legendLine--short"></span>LUFS-S</div>
            <div><span class="loudnessComponent__legendLine loudnessComponent__legendLine--momentary"></span>LUFS-M</div>
            <div><span class="loudnessComponent__legendLine loudnessComponent__legendLine--integrated"></span>LUFS-I</div>
            <div><span class="loudnessComponent__legendLine loudnessComponent__legendLine--tp"></span>TP &gt; 0</div>
          </div>
          <div class="loudnessComponent__hoverLine js-loudnessHoverLine"></div>
          <div class="loudnessComponent__hoverReadout js-loudnessHoverReadout" aria-live="polite"></div>
          <div class="loudnessComponent__selection js-loudnessSelection"></div>
          <div class="loudnessComponent__playhead js-loudnessPlayhead"></div>
        </div>
      `;

    this._summaryEl = mountEl.querySelector(".js-loudnessSummary");
    this._statusEl = mountEl.querySelector(".js-loudnessStatus");
    this._canvasWrap = mountEl.querySelector(".js-loudnessCanvasWrap");
    this._canvas = mountEl.querySelector("canvas");
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
      ro.observe(this._canvasWrap);
      this._register({ dispose: () => ro.disconnect() });
    }

    void this._loadProfile();
  }

  private async _loadProfile() {
    try {
      const profile = await this._loudnessService.analyzeFileProfile();
      this._profile = profile;
      this._displayShort = quinticBSplineSmooth(profile.shortTermLufs);
      this._displayMomentary = quinticBSplineSmooth(profile.momentaryLufs);
      this._updateSummary(profile);
      if (this._statusEl) {
        this._statusEl.textContent = "";
        this._statusEl.style.display = "none";
      }
      this._draw();
      this._updatePlayhead();
    } catch {
      if (this._statusEl) {
        this._statusEl.textContent = "Could not analyze loudness.";
      }
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

  /** Call when fullscreen pane becomes visible so canvas resizes. */
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
    const wrapW = this._canvasWrap.getBoundingClientRect().width;
    const x = timeSecToPlotX(
      this._playbackSec,
      minTime,
      maxTime,
      wrapW,
      plotPadLeftCssPx,
      plotPadRightCssPx,
    );
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

  private _canvasBackgroundColor(): string {
    const css = getComputedStyle(this._canvasWrap);
    return (
      css.getPropertyValue("--vscode-editor-background").trim() ||
      css.backgroundColor ||
      "#1e1e1e"
    );
  }

  private _plotCssRect(): { left: number; right: number; width: number } {
    const rect = this._canvasWrap.getBoundingClientRect();
    const left = plotPadLeftCssPx;
    const width = plotWidthPx(rect.width, plotPadLeftCssPx, plotPadRightCssPx);
    const right = left + width;
    return { left, right, width };
  }

  private _secFromClientX(clientX: number): number {
    const rect = this._canvasWrap.getBoundingClientRect();
    const plot = this._plotCssRect();
    const { minTime, maxTime } = this._visibleTimeRange();
    const xNorm =
      plot.width > 0
        ? clamp01((clientX - rect.left - plot.left) / plot.width)
        : 0;
    return minTime + xNorm * (maxTime - minTime);
  }

  private _wirePointerInteraction(): void {
    this._addEventlistener(
      this._canvasWrap,
      EventType.MOUSE_MOVE,
      (event: MouseEvent) => {
        if (!this._profile) {
          return;
        }
        const rect = this._canvasWrap.getBoundingClientRect();
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
        this._hoverLine.style.display = "block";
        this._hoverLine.style.left = `${plot.left + x * plot.width}px`;
        this._hoverReadout.style.visibility = "visible";
        this._hoverReadout.textContent = marker
          ? `${formatTime(marker.timeSec)} | TP ${dbTpLabel(marker.dbTp)}`
          : `${formatTime(sec)} | S ${lufsLabel(shortTerm)} | M ${lufsLabel(momentary)}`;
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

    this._addEventlistener(this._canvasWrap, "mouseleave", () => {
      this._hoverLine.style.display = "none";
      this._hoverReadout.style.visibility = "hidden";
      if (!this._isDragging) {
        this._selectionEl.style.display = "none";
      }
    });

    this._addEventlistener(
      this._canvasWrap,
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
      this._canvasWrap,
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
      this._canvasWrap,
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
    const profile = this._profile;
    if (!profile || profile.timeSec.length < 2) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.floor(this._canvasWrap.clientWidth));
    const cssH = Math.max(1, Math.floor(this._canvasWrap.clientHeight));
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
    const ctx = this._canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this._canvasBackgroundColor();
    ctx.fillRect(0, 0, w, h);

    const padL = plotPadLeftCssPx * dpr;
    const padR = plotPadRightCssPx * dpr;
    const padT = plotPadTopCssPx * dpr;
    const padB = plotPadBottomCssPx * dpr;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);
    const { minTime, maxTime } = this._visibleTimeRange();
    const lufsRange = this._dynamicLufsRange(minTime, maxTime);

    const lufsToY = (lufs: number) => {
      const n = clamp01(
        (lufs - lufsRange.min) / (lufsRange.max - lufsRange.min),
      );
      if (!Number.isFinite(n)) {
        return NaN;
      }
      return padT + plotH * (1 - n);
    };

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.font = `${9 * dpr}px monospace`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const db of lufsRange.ticks) {
      const y = lufsToY(db);
      if (!Number.isFinite(y)) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.fillText(String(db), padL - 4 * dpr, y);
    }

    const integratedY = lufsToY(profile.integratedLufs);
    if (Number.isFinite(integratedY)) {
      ctx.save();
      ctx.strokeStyle = "rgba(244, 67, 54, 0.35)";
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(padL, integratedY);
      ctx.lineTo(padL + plotW, integratedY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(244, 67, 54, 0.7)";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        `I ${profile.integratedLufs.toFixed(1)}`,
        padL + 4 * dpr,
        integratedY - 2 * dpr,
      );
      ctx.restore();
    }

    const t0 = minTime;
    const t1 = maxTime;
    const tSpan = Math.max(1e-9, t1 - t0);

    ctx.save();
    ctx.strokeStyle = "rgba(244, 67, 54, 0.55)";
    ctx.fillStyle = "rgba(244, 67, 54, 0.85)";
    ctx.lineWidth = 1 * dpr;
    for (let i = 0; i < profile.timeSec.length; i++) {
      const time = profile.timeSec[i];
      const dbTp = profile.truePeakDbTp[i];
      if (time < t0 || time > t1 || !Number.isFinite(dbTp) || dbTp <= 0) {
        continue;
      }
      const x = padL + ((time - t0) / tSpan) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, padT + 4 * dpr, 2.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const drawCurve = (
      values: Float32Array,
      color: string,
      lineWidth: number,
      alpha: number,
    ) => {
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lineWidth * dpr;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < profile.timeSec.length; i++) {
        const time = profile.timeSec[i];
        if (time < t0 || time > t1) {
          started = false;
          continue;
        }
        const v = values[i];
        if (!Number.isFinite(v)) {
          started = false;
          continue;
        }
        const x = padL + ((time - t0) / tSpan) * plotW;
        const y = lufsToY(v);
        if (!Number.isFinite(y)) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawCurve(this._displayMomentary, "rgba(255, 214, 64, 0.95)", 1, 0.8);
    drawCurve(this._displayShort, "rgba(0,180,216,0.95)", 1.5, 1);

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(formatTime(t0), padL, h - padB + 4 * dpr);
    ctx.fillText(formatTime(t1), padL + plotW, h - padB + 4 * dpr);
  }
}
