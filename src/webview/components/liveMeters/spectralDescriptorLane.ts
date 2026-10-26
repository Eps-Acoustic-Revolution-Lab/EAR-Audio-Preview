import Component from "../../component";
import {
  SpectralDescriptorAnalyzer,
  type SpectralDescriptors,
} from "../../utils/spectralDescriptors";
import type { LiveComparisonInput, LivePlayback } from "./liveAnalysisInput";
import type { LiveSettings } from "./liveAnalysisInput";
import { applyMonitoringToTimeDomain } from "../../utils/liveMonitoring";

/** Optional live measurements; shares the spectrum's frame cadence and lifecycle. */
export default class SpectralDescriptorLane extends Component {
  private _details: HTMLDetailsElement;
  private _rows: HTMLElement;
  private _analyzer = new SpectralDescriptorAnalyzer();
  private _left = new Float32Array(0);
  private _right = new Float32Array(0);
  private _mixLeft = new Float32Array(0);
  private _mixRight = new Float32Array(0);
  private _lastUpdate = -Infinity;
  private _lastComparisonKey: string | undefined;

  constructor(
    container: HTMLElement,
    private _player: LivePlayback,
    private _settings: LiveSettings,
    private _comparison?: LiveComparisonInput,
  ) {
    super();
    this._details = document.createElement("details");
    this._details.className = "spectralDescriptors";
    this._details.innerHTML =
      '<summary>Spectral descriptors</summary><div class="spectralDescriptors__rows"></div>';
    this._details.title =
      "Power-weighted FFT centroid, spread and 85% rolloff. Excludes DC; no display tilt or A-weighting. Silence shows —.";
    this._rows = this._details.querySelector("div");
    container.append(this._details);
    this._addEventlistener(this._details, "toggle", () => {
      this._lastUpdate = -Infinity;
      this.update(true);
    });
    this._register({ dispose: () => this._details.remove() });
  }

  update(force = false): void {
    if (!this._details.open) {
      return;
    }
    const now = performance.now();
    // Playback readouts update at 10 Hz; comparison publishes paused seeks too.
    if (
      !force &&
      !this._comparison &&
      this._player.isPlaying &&
      now - this._lastUpdate < 100
    ) {
      return;
    }
    const snapshot = this._comparison?.snapshot();
    // Active/removed tracks are filtered without changing the published revision.
    const comparisonKey = snapshot
      ? JSON.stringify([
          snapshot.revision,
          snapshot.tracks.map((track) => [
            track.id,
            track.revision,
            track.name,
            track.color,
          ]),
        ])
      : undefined;
    if (!force && snapshot && comparisonKey === this._lastComparisonKey) {
      return;
    }
    this._lastComparisonKey = comparisonKey;
    this._lastUpdate = now;
    this._rows.replaceChildren();
    const add = (
      name: string,
      value: SpectralDescriptors | null,
      color?: string,
    ) => {
      const row = document.createElement("div");
      if (color) {
        row.style.color = color;
      }
      const hz = (v: number) => `${Math.round(v)} Hz`;
      row.textContent = `${name} · Centroid ${value ? hz(value.centroidHz) : "—"} · Spread ${value ? hz(value.spreadHz) : "—"} · Rolloff 85% ${value ? hz(value.rolloffHz) : "—"}`;
      this._rows.append(row);
    };
    if (this._comparison) {
      for (const track of snapshot?.tracks ?? []) {
        add(
          track.name,
          this._analyzer.compute(track.left, track.right, track.sampleRate),
          track.color,
        );
      }
      if (!snapshot?.tracks.length) {
        add("No tracks", null);
      }
      return;
    }
    const analysers = this._player.getAnalysers();
    if (!analysers || !this._player.isPlaying) {
      add("Playback paused", null);
      return;
    }
    const size = analysers.left.fftSize;
    if (this._left.length !== size) {
      this._left = new Float32Array(size);
      this._right = new Float32Array(size);
      this._mixLeft = new Float32Array(size);
      this._mixRight = new Float32Array(size);
    }
    analysers.left.getFloatTimeDomainData(this._left);
    analysers.right.getFloatTimeDomainData(this._right);
    applyMonitoringToTimeDomain(
      this._settings.liveMonitoringMode,
      this._left,
      this._right,
      this._mixLeft,
      this._mixRight,
    );
    add(
      "Live",
      this._analyzer.compute(
        this._mixLeft,
        this._mixRight,
        analysers.left.context.sampleRate,
      ),
    );
  }
}
