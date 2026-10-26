import Component from "../../component";
import type SequenceFeatureService from "../../services/sequenceFeatureService";
import type AnalyzeSettingsService from "../../services/analyzeSettingsService";
import { EventType } from "../../events";
import {
  type HarmonicProfile,
  harmonicUnavailableReason,
} from "../../../shared/harmonicFeatureCompute";
import "./harmonicTimeline.css";

const pitchClasses = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** Optional analysis kept separate from the default loudness/F0 workload. */
export default class HarmonicTimeline extends Component {
  private _profile: HarmonicProfile | null = null;
  private _canvas: HTMLCanvasElement;
  private _status: HTMLElement;
  private _button: HTMLButtonElement;

  constructor(
    mount: HTMLElement,
    private _service: SequenceFeatureService,
    private _settings: AnalyzeSettingsService,
    private _duration: number,
    sampleRate: number,
  ) {
    super();
    const root = document.createElement("section");
    root.className = "harmonicTimeline";
    root.innerHTML = `<button type="button">Analyze chroma & melody</button><span role="status"></span><canvas hidden aria-label="Chroma and predominant melody timelines"></canvas>`;
    mount.append(root);
    this._register({ dispose: () => root.remove() });
    this._canvas = root.querySelector("canvas");
    this._status = root.querySelector("span");
    this._button = root.querySelector("button");
    const reason = harmonicUnavailableReason(_duration, sampleRate);
    this._status.textContent =
      reason ??
      "Optional · one predominant melody, not polyphonic transcription";
    this._button.disabled = !!reason;
    this._addEventlistener(this._button, "click", () => {
      void this._analyze();
    });
    this._addEventlistener(_settings, EventType.AS_UPDATE_MIN_TIME, () =>
      this.redraw(),
    );
    this._addEventlistener(_settings, EventType.AS_UPDATE_MAX_TIME, () =>
      this.redraw(),
    );
    this._addEventlistener(this._canvas, "mousemove", (event: MouseEvent) => {
      if (!this._profile) {
        return;
      }
      const { min, max } = this._range();
      const rect = this._canvas.getBoundingClientRect();
      const time =
        min +
        Math.max(
          0,
          Math.min(
            1,
            (event.clientX - rect.left - 44) / Math.max(1, rect.width - 52),
          ),
        ) *
          (max - min);
      const i = Math.round(time / this._profile.melodyHopSec);
      const hz = this._profile.melodyHz[i];
      this._status.textContent = `${time.toFixed(2)} s · melody ${Number.isFinite(hz) ? `${hz.toFixed(1)} Hz · confidence ${this._profile.melodyConfidence[i].toFixed(2)}` : "unvoiced"}`;
    });
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => this.redraw());
      observer.observe(root);
      this._register({ dispose: () => observer.disconnect() });
    }
  }

  private async _analyze(): Promise<void> {
    this._button.disabled = true;
    this._status.textContent = "Analyzing chroma & melody…";
    try {
      const profile = await this._service.analyzeHarmonics();
      if (this._isDisposed) {
        return;
      }
      if (!profile?.harmonic) {
        throw new Error("unavailable");
      }
      this._profile = profile.harmonic;
      this._canvas.hidden = false;
      this._button.textContent = "Chroma & melody analyzed";
      this._status.textContent =
        "Chroma: relative strength · Melody: predominant pitch (Hz), gaps are unvoiced";
      this.redraw();
    } catch {
      if (this._isDisposed) {
        return;
      }
      this._status.textContent = "Harmonic analysis unavailable. Try again.";
      this._button.disabled = false;
    }
  }

  private _range(): { min: number; max: number } {
    const min = Math.max(0, this._settings.minTime);
    const max = Math.min(this._duration, this._settings.maxTime);
    return max > min ? { min, max } : { min: 0, max: this._duration };
  }

  public redraw(): void {
    const profile = this._profile;
    if (!profile || this._isDisposed) {
      return;
    }
    const width = Math.max(100, this._canvas.clientWidth);
    const height = 270;
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = Math.round(width * dpr);
    this._canvas.height = Math.round(height * dpr);
    const ctx = this._canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.scale(dpr, dpr);
    const { min, max } = this._range();
    const x = (time: number) =>
      44 + ((time - min) / (max - min)) * (width - 52);
    ctx.fillStyle = getComputedStyle(this._canvas).color || "#aaa";
    ctx.font = "10px sans-serif";
    for (let bin = 0; bin < 12; bin++) {
      ctx.fillText(pitchClasses[bin], 4, 12 + (11 - bin) * 12);
    }
    ctx.fillText("Melody (Hz, log)", 44, 157);
    for (const hz of [100, 1000, 10000]) {
      ctx.fillText(
        String(hz),
        4,
        244 - (85 * Math.log(hz / 80)) / Math.log(20000 / 80),
      );
    }
    ctx.fillText(`${min.toFixed(1)} s`, 44, 265);
    ctx.fillText(`${max.toFixed(1)} s`, width - 48, 265);
    ctx.save();
    ctx.beginPath();
    ctx.rect(44, 0, width - 52, 250);
    ctx.clip();
    for (let i = 0; i < profile.chromaTimeSec.length; i++) {
      const time = profile.chromaTimeSec[i];
      const end = profile.chromaTimeSec[i + 1] ?? this._duration;
      if (end < min || time > max) {
        continue;
      }
      for (let bin = 0; bin < 12; bin++) {
        const value = Math.max(0, Math.min(1, profile.chroma[i * 12 + bin]));
        ctx.fillStyle = `rgba(90, 205, 145, ${value})`;
        ctx.fillRect(
          x(time),
          (11 - bin) * 12,
          Math.max(1, x(end) - x(time)),
          11,
        );
      }
    }
    ctx.strokeStyle = "#5acd91";
    ctx.beginPath();
    let pen = false;
    for (
      let i = Math.max(0, Math.floor(min / profile.melodyHopSec));
      i < profile.melodyHz.length && i * profile.melodyHopSec <= max;
      i++
    ) {
      const hz = profile.melodyHz[i];
      if (!Number.isFinite(hz)) {
        pen = false;
        continue;
      }
      const px = x(i * profile.melodyHopSec);
      const py = Math.max(
        154,
        Math.min(245, 244 - (85 * Math.log(hz / 80)) / Math.log(20000 / 80)),
      );
      if (pen) {
        ctx.lineTo(px, py);
      } else {
        ctx.moveTo(px, py);
      }
      pen = true;
    }
    ctx.stroke();
    ctx.restore();
  }
}
