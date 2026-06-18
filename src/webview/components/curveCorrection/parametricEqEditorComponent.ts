import Component from "../../component";
import { EventType } from "../../events";
import type { EqFilterBand } from "../../types/headphoneEq";
import {
  bandColorAlpha,
  bandColorForIndex,
  dbGridLines,
  DEFAULT_DISPLAY_RANGE,
  FREQ_TICKS,
  formatFreqAxisLabel,
  freqToPlotX,
  gainToPlotY,
  getBandFrequencyResponseDb,
  PLOT_PAD_B,
  PLOT_PAD_L,
  PLOT_PAD_R,
  PLOT_PAD_T,
  plotXToFreq,
  plotYToGain,
} from "../../utils/eqCanvasMath";

export default class ParametricEqEditorComponent extends Component {
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _filters: EqFilterBand[] = [];
  private _sampleRate = 48000;
  private _dragIndex = -1;
  private _hoverIndex = -1;
  private _onChange: (filters: EqFilterBand[]) => void;

  constructor(
    canvasSelector: string,
    sampleRate: number,
    onChange: (filters: EqFilterBand[]) => void,
  ) {
    super();
    this._sampleRate = sampleRate;
    this._onChange = onChange;
    const canvas = document.querySelector(canvasSelector) as HTMLCanvasElement;
    if (!canvas) {
      throw new Error(`Canvas not found: ${canvasSelector}`);
    }
    this._canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2d context unavailable");
    }
    this._ctx = ctx;

    this._addEventlistener(canvas, EventType.MOUSE_DOWN, (e: MouseEvent) =>
      this._onPointerDown(e),
    );
    this._addEventlistener(canvas, EventType.MOUSE_MOVE, (e: MouseEvent) =>
      this._onPointerMove(e),
    );
    this._addEventlistener(window, EventType.MOUSE_UP, () =>
      this._onPointerUp(),
    );
    this._addEventlistener(canvas, EventType.MOUSE_LEAVE, () => {
      if (this._dragIndex < 0) {
        this._hoverIndex = -1;
        this._draw();
      }
    });
  }

  public setFilters(filters: EqFilterBand[]): void {
    this._filters = structuredClone(filters);
    this._draw();
  }

  private _minHz(): number {
    return 20;
  }

  private _maxHz(): number {
    return Math.min(this._sampleRate / 2, 20000);
  }

  private _plotMetrics(w: number, h: number) {
    const plotW = Math.max(1, w - PLOT_PAD_L - PLOT_PAD_R);
    const plotH = Math.max(1, h - PLOT_PAD_T - PLOT_PAD_B);
    return { plotW, plotH };
  }

  private _clientToPlot(x: number, y: number) {
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;
    const { plotW, plotH } = this._plotMetrics(w, h);
    return {
      px: x - PLOT_PAD_L,
      py: y - PLOT_PAD_T,
      plotW,
      plotH,
      w,
      h,
    };
  }

  private _rect() {
    return this._canvas.getBoundingClientRect();
  }

  private _hitHandle(
    px: number,
    py: number,
    plotW: number,
    plotH: number,
  ): number {
    const minHz = this._minHz();
    const maxHz = this._maxHz();
    for (let i = 0; i < this._filters.length; i++) {
      const f = this._filters[i];
      if (!f.enabled) {
        continue;
      }
      const hx = freqToPlotX(f.frequency, plotW, minHz, maxHz);
      const hy = gainToPlotY(f.gainDb, plotH, DEFAULT_DISPLAY_RANGE);
      if (Math.hypot(px - hx, py - hy) < 10) {
        return i;
      }
    }
    return -1;
  }

  private _onPointerDown(e: MouseEvent): void {
    const r = this._rect();
    const { px, py, plotW, plotH } = this._clientToPlot(
      e.clientX - r.left,
      e.clientY - r.top,
    );
    this._dragIndex = this._hitHandle(px, py, plotW, plotH);
  }

  private _onPointerMove(e: MouseEvent): void {
    const r = this._rect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const { px, py, plotW, plotH } = this._clientToPlot(cx, cy);

    if (this._dragIndex >= 0) {
      const minHz = this._minHz();
      const maxHz = this._maxHz();
      const band = this._filters[this._dragIndex];
      band.frequency = plotXToFreq(
        Math.max(0, Math.min(plotW, px)),
        plotW,
        minHz,
        maxHz,
      );
      band.gainDb = plotYToGain(
        Math.max(0, Math.min(plotH, py)),
        plotH,
        DEFAULT_DISPLAY_RANGE,
      );
      this._onChange(structuredClone(this._filters));
      this._draw();
      return;
    }

    const nextHover = this._hitHandle(px, py, plotW, plotH);
    if (nextHover !== this._hoverIndex) {
      this._hoverIndex = nextHover;
      this._draw();
    }
  }

  private _onPointerUp(): void {
    this._dragIndex = -1;
  }

  private _drawGridAndAxes(
    ctx: CanvasRenderingContext2D,
    plotW: number,
    plotH: number,
  ): void {
    const minHz = this._minHz();
    const maxHz = this._maxHz();
    const ox = PLOT_PAD_L;
    const oy = PLOT_PAD_T;

    ctx.save();
    ctx.translate(ox, oy);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (const hz of FREQ_TICKS) {
      if (hz < minHz || hz > maxHz) {
        continue;
      }
      const x = Math.floor(freqToPlotX(hz, plotW, minHz, maxHz)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, plotH);
      ctx.stroke();
    }

    const dbLines = dbGridLines(DEFAULT_DISPLAY_RANGE);
    for (const db of dbLines) {
      const y = Math.floor(gainToPlotY(db, plotH, DEFAULT_DISPLAY_RANGE)) + 0.5;
      ctx.strokeStyle =
        db === 0 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
    }

    ctx.restore();

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px var(--vscode-font-family, sans-serif)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const hz of FREQ_TICKS) {
      if (hz < minHz || hz > maxHz) {
        continue;
      }
      const x = ox + freqToPlotX(hz, plotW, minHz, maxHz);
      if (x < ox || x > ox + plotW) {
        continue;
      }
      ctx.fillText(formatFreqAxisLabel(hz), x, oy + plotH + 4);
    }

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const db of dbLines) {
      if (db > DEFAULT_DISPLAY_RANGE || db < -DEFAULT_DISPLAY_RANGE * 2) {
        continue;
      }
      const y = oy + gainToPlotY(db, plotH, DEFAULT_DISPLAY_RANGE);
      const label = db > 0 ? `+${db}` : `${db}`;
      ctx.fillStyle =
        db === 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.4)";
      ctx.fillText(label, ox + plotW + 4, y);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(ox + 0.5, oy + 0.5, plotW - 1, plotH - 1);
  }

  private _drawBandCurves(
    ctx: CanvasRenderingContext2D,
    plotW: number,
    plotH: number,
  ): void {
    const minHz = this._minHz();
    const maxHz = this._maxHz();
    const y0 = gainToPlotY(0, plotH, DEFAULT_DISPLAY_RANGE);
    const bandPaths: Path2D[] = [];
    const enabledIdx: number[] = [];

    for (let i = 0; i < this._filters.length; i++) {
      const band = this._filters[i];
      const path = new Path2D();
      let started = false;
      for (let x = 0; x <= plotW; x++) {
        const freq = plotXToFreq(x, plotW, minHz, maxHz);
        const gainDb = getBandFrequencyResponseDb(freq, band);
        const y = gainToPlotY(gainDb, plotH, DEFAULT_DISPLAY_RANGE);
        if (!started) {
          path.moveTo(x, y);
          started = true;
        } else {
          path.lineTo(x, y);
        }
      }
      bandPaths.push(path);
      if (band.enabled) {
        enabledIdx.push(i);
      }
    }

    for (let i = 0; i < this._filters.length; i++) {
      const isHover = i === this._hoverIndex;
      const alpha = isHover ? 0.85 : 0.28;
      if (isHover && this._filters[i].enabled) {
        const fill = new Path2D(bandPaths[i]);
        fill.lineTo(plotW, y0);
        fill.lineTo(0, y0);
        fill.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, plotH);
        grad.addColorStop(0, bandColorAlpha(i, 0.35));
        grad.addColorStop(
          Math.max(0, Math.min(1, y0 / plotH)),
          "rgba(0,0,0,0)",
        );
        grad.addColorStop(1, bandColorAlpha(i, 0.35));
        ctx.fillStyle = grad;
        ctx.fill(fill);
      }
      ctx.strokeStyle = bandColorAlpha(i, alpha);
      ctx.lineWidth = isHover ? 2 : 1.25;
      ctx.stroke(bandPaths[i]);
    }

    const sumPath = new Path2D();
    let started = false;
    for (let x = 0; x <= plotW; x++) {
      const freq = plotXToFreq(x, plotW, minHz, maxHz);
      let total = 0;
      for (const i of enabledIdx) {
        total += getBandFrequencyResponseDb(freq, this._filters[i]);
      }
      const y = gainToPlotY(total, plotH, DEFAULT_DISPLAY_RANGE);
      if (!started) {
        sumPath.moveTo(x, y);
        started = true;
      } else {
        sumPath.lineTo(x, y);
      }
    }
    ctx.strokeStyle = "rgba(0, 195, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke(sumPath);
  }

  private _drawHandles(
    ctx: CanvasRenderingContext2D,
    plotW: number,
    plotH: number,
  ): void {
    const minHz = this._minHz();
    const maxHz = this._maxHz();
    for (let i = 0; i < this._filters.length; i++) {
      const band = this._filters[i];
      if (!band.enabled) {
        continue;
      }
      const x = freqToPlotX(band.frequency, plotW, minHz, maxHz);
      const y = gainToPlotY(band.gainDb, plotH, DEFAULT_DISPLAY_RANGE);
      const color = bandColorForIndex(i);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, i === this._hoverIndex ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private _draw(): void {
    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;
    if (w <= 0 || h <= 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = Math.round(w * dpr);
    this._canvas.height = Math.round(h * dpr);
    const ctx = this._ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#0f0f0f";
    ctx.fillRect(0, 0, w, h);

    const { plotW, plotH } = this._plotMetrics(w, h);
    this._drawGridAndAxes(ctx, plotW, plotH);

    if (this._filters.length) {
      ctx.save();
      ctx.translate(PLOT_PAD_L, PLOT_PAD_T);
      this._drawBandCurves(ctx, plotW, plotH);
      this._drawHandles(ctx, plotW, plotH);
      ctx.restore();
    }
  }

  public resize(): void {
    this._draw();
  }
}
