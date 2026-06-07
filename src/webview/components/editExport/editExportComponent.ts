import "../figureInteraction/figureInteractionComponent.css";
import "./editExportComponent.css";
import { PostMessage, WebviewMessageType } from "../../../message";
import Component from "../../component";
import { EventType } from "../../events";
import AnalyzeSettingsService, {
  AnalyzeSettingsProps,
} from "../../services/analyzeSettingsService";
import EditExportSettingsService, {
  EditListenMode,
  ExportChannelMode,
} from "../../services/editExportSettingsService";
import EditListenService from "../../services/editListenService";
import PlayerSettingsService from "../../services/playerSettingsService";
import PlayerService from "../../services/playerService";
import WaveFormComponent from "../waveform/waveFormComponent";
import {
  renderExportWav,
  resolveExportSettings,
} from "../../services/audioExportService";
import EarEqSegmentedControl from "../../utils/earEqSegmentedControl";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) {
    return "";
  }
  return sec.toFixed(3);
}

function parseTime(raw: string): number | null {
  const v = Number.parseFloat(raw.trim());
  return Number.isFinite(v) ? v : null;
}

function defaultExportFilename(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `export_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sanitizeFilename(filename: string): string {
  if (!filename.trim()) {
    return `${defaultExportFilename()}.wav`;
  }
  return filename.replace(/[<>:"/\\|?*]+/g, "_") + ".wav";
}

function mixDownMono(audioBuffer: AudioBuffer): Float32Array {
  const { length, numberOfChannels } = audioBuffer;
  const out = new Float32Array(length);
  if (numberOfChannels === 1) {
    out.set(audioBuffer.getChannelData(0));
    return out;
  }
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  for (let i = 0; i < length; i++) {
    out[i] = (left[i] + right[i]) * 0.5;
  }
  return out;
}

export default class EditExportComponent extends Component {
  private _audioBuffer: AudioBuffer;
  private _editExportSettings: EditExportSettingsService;
  private _editListenService: EditListenService;
  private _playerSettings: PlayerSettingsService;
  private _analyzeSettings: AnalyzeSettingsService;
  private _playerService: PlayerService;
  private _postMessage: PostMessage;

  private _waveMount: HTMLElement;
  private _waveBoxSelector: string;
  private _regionStartInput: HTMLInputElement;
  private _regionEndInput: HTMLInputElement;
  private _durationHint: HTMLElement;
  private _filenameInput: HTMLInputElement;
  private _exportButton: HTMLButtonElement;
  private _statusEl: HTMLElement;
  private _syncFilterHint: HTMLElement;
  private _enableHpfInput: HTMLInputElement;
  private _hpfHzInput: HTMLInputElement;
  private _enableLpfInput: HTMLInputElement;
  private _lpfHzInput: HTMLInputElement;
  private _selectionOverlay: HTMLDivElement | null = null;
  private _selectionBand: HTMLDivElement | null = null;
  private _channelSegment: EarEqSegmentedControl;
  private _listenSegment: EarEqSegmentedControl;
  private _destinationSegment: EarEqSegmentedControl;
  private _busy = false;

  constructor(
    componentRootSelector: string,
    audioBuffer: AudioBuffer,
    editExportSettingsService: EditExportSettingsService,
    editListenService: EditListenService,
    playerSettingsService: PlayerSettingsService,
    analyzeSettingsService: AnalyzeSettingsService,
    playerService: PlayerService,
    postMessage: PostMessage,
  ) {
    super();
    this._audioBuffer = audioBuffer;
    this._editExportSettings = editExportSettingsService;
    this._editListenService = editListenService;
    this._playerSettings = playerSettingsService;
    this._analyzeSettings = analyzeSettingsService;
    this._playerService = playerService;
    this._postMessage = postMessage;

    const root = document.querySelector(componentRootSelector) as HTMLElement;
    root.innerHTML = `
      <div class="editExport">
        <div class="editExport__waveMount js-editExport-waveMount"></div>
        <div class="editExport__panels">
          <div class="panelGroup">
            <h3 class="panelGroup__title">Region</h3>
            <div class="panelGroup__items">
              <div class="panelRow">
                <span class="panelRow__label">Start</span>
                <div class="panelRow__control">
                  <span class="panelRow__field"><input class="js-editExport-regionStart" type="text" inputmode="decimal"><span class="panelRow__suffix">s</span></span>
                </div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">End</span>
                <div class="panelRow__control">
                  <span class="panelRow__field"><input class="js-editExport-regionEnd" type="text" inputmode="decimal"><span class="panelRow__suffix">s</span></span>
                  <span class="panelRow__value js-editExport-durationHint"></span>
                </div>
              </div>
              <div class="panelRow panelRow--stacked">
                <div class="editExport__pillRow">
                  <button type="button" class="earEqPill js-editExport-setPlayhead">Set to playhead</button>
                  <button type="button" class="earEqPill js-editExport-selectAll">Select all</button>
                  <button type="button" class="earEqPill js-editExport-importAnalyzer">From analyzer</button>
                </div>
              </div>
            </div>
          </div>

          <div class="panelGroup">
            <h3 class="panelGroup__title">Channels</h3>
            <div class="panelGroup__items">
              <div class="panelRow panelRow--stacked">
                <div class="editExport__segmentSlot js-editExport-channelModes"></div>
              </div>
            </div>
          </div>

          <div class="panelGroup">
            <h3 class="panelGroup__title">Filters</h3>
            <div class="panelGroup__items">
              <div class="panelRow">
                <span class="panelRow__label">High-pass</span>
                <div class="panelRow__control">
                  <input class="js-editExport-enableHpf" type="checkbox">
                  <span class="panelRow__field"><input class="js-editExport-hpfHz" type="number" min="10" step="10"><span class="panelRow__suffix">Hz</span></span>
                </div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Low-pass</span>
                <div class="panelRow__control">
                  <input class="js-editExport-enableLpf" type="checkbox">
                  <span class="panelRow__field"><input class="js-editExport-lpfHz" type="number" min="10" step="10"><span class="panelRow__suffix">Hz</span></span>
                </div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Sync playback</span>
                <div class="panelRow__control">
                  <input class="js-editExport-syncFilters" type="checkbox">
                </div>
              </div>
              <p class="panelRow__hint js-editExport-syncFilterHint" hidden>Using playback filter settings</p>
            </div>
          </div>

          <div class="panelGroup">
            <h3 class="panelGroup__title">Listen</h3>
            <div class="panelGroup__items">
              <div class="panelRow panelRow--stacked">
                <div class="editExport__segmentSlot js-editExport-listenModes"></div>
                <p class="panelRow__hint">Dry loops the original selection; Processed loops the export chain. Use Transport FAB play/pause.</p>
              </div>
            </div>
          </div>

          <div class="panelGroup">
            <h3 class="panelGroup__title">Export</h3>
            <div class="panelGroup__items">
              <div class="panelRow">
                <span class="panelRow__label">Filename</span>
                <div class="panelRow__control">
                  <span class="panelRow__field"><input class="js-editExport-filename" type="text"><span class="panelRow__suffix">.wav</span></span>
                </div>
              </div>
              <div class="panelRow panelRow--stacked">
                <div class="editExport__segmentSlot js-editExport-destinations"></div>
                <p class="panelRow__hint">16-bit PCM WAV export. Decoders are import-only.</p>
              </div>
              <div class="panelRow panelRow--stacked">
                <button type="button" class="panelAction editExport__exportBtn js-editExport-export">Export WAV</button>
                <div class="editExport__status js-editExport-status" aria-live="polite"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._waveMount = root.querySelector(".js-editExport-waveMount") as HTMLElement;
    this._waveBoxSelector = `${componentRootSelector} .editExport__waveBox`;
    this._regionStartInput = root.querySelector(
      ".js-editExport-regionStart",
    ) as HTMLInputElement;
    this._regionEndInput = root.querySelector(
      ".js-editExport-regionEnd",
    ) as HTMLInputElement;
    this._durationHint = root.querySelector(
      ".js-editExport-durationHint",
    ) as HTMLElement;
    this._filenameInput = root.querySelector(
      ".js-editExport-filename",
    ) as HTMLInputElement;
    this._exportButton = root.querySelector(
      ".js-editExport-export",
    ) as HTMLButtonElement;
    this._statusEl = root.querySelector(".js-editExport-status") as HTMLElement;
    this._syncFilterHint = root.querySelector(
      ".js-editExport-syncFilterHint",
    ) as HTMLElement;
    this._enableHpfInput = root.querySelector(
      ".js-editExport-enableHpf",
    ) as HTMLInputElement;
    this._hpfHzInput = root.querySelector(
      ".js-editExport-hpfHz",
    ) as HTMLInputElement;
    this._enableLpfInput = root.querySelector(
      ".js-editExport-enableLpf",
    ) as HTMLInputElement;
    this._lpfHzInput = root.querySelector(
      ".js-editExport-lpfHz",
    ) as HTMLInputElement;

    this._filenameInput.value = defaultExportFilename();
    const s = this._editExportSettings;
    this._channelSegment = this._mountSegment(
      root.querySelector(".js-editExport-channelModes") as HTMLElement,
      [
        { value: "as_is", label: "As-is" },
        { value: "mono_mix", label: "Mono mix" },
        { value: "mono_left", label: "L only" },
        { value: "mono_right", label: "R only" },
        { value: "fake_stereo", label: "Fake stereo" },
      ],
      s.channelMode,
      (value) => {
        this._editExportSettings.channelMode = value as ExportChannelMode;
      },
    );
    this._listenSegment = this._mountSegment(
      root.querySelector(".js-editExport-listenModes") as HTMLElement,
      [
        { value: "dry", label: "Dry" },
        { value: "processed", label: "Processed" },
      ],
      s.listenMode,
      (value) => {
        this._editExportSettings.listenMode = value as EditListenMode;
        void this._editListenService.onListenModeChanged();
      },
    );
    this._destinationSegment = this._mountSegment(
      root.querySelector(".js-editExport-destinations") as HTMLElement,
      [
        { value: "source_dir", label: "Next to source" },
        { value: "workspace_root", label: "Workspace root" },
      ],
      s.destination,
      (value) => {
        this._editExportSettings.destination =
          value === "workspace_root" ? "workspace_root" : "source_dir";
      },
    );
    this._buildWaveform();
    this._wireRegionDrag();
    this._wireControls(root);
    this._syncUiFromSettings();
    this._wireSettingsEvents();
    this._updateFilterControlsState();
  }

  private _waveformSettings(): AnalyzeSettingsProps {
    const base = this._analyzeSettings.toProps();
    return {
      ...base,
      minTime: 0,
      maxTime: this._audioBuffer.duration,
      minAmplitude: this._analyzeSettings.minAmplitudeOfAudioBuffer,
      maxAmplitude: this._analyzeSettings.maxAmplitudeOfAudioBuffer,
      waveformVerticalScale: 1,
    };
  }

  private _buildWaveform() {
    const box = document.createElement("div");
    box.className = "canvasBox editExport__waveBox";
    this._waveMount.appendChild(box);

    const mono = mixDownMono(this._audioBuffer);
    new WaveFormComponent(
      this._waveBoxSelector,
      AnalyzeSettingsService.WAVEFORM_CANVAS_WIDTH,
      AnalyzeSettingsService.WAVEFORM_CANVAS_HEIGHT,
      this._waveformSettings(),
      this._audioBuffer.sampleRate,
      mono,
      0,
      1,
    );
  }

  private _mountSegment(
    host: HTMLElement,
    options: { value: string; label: string }[],
    initialValue: string,
    onChange: (value: string) => void,
  ): EarEqSegmentedControl {
    const segment = new EarEqSegmentedControl(options, initialValue, {
      onChange,
    });
    host.appendChild(segment.root);
    this._register({ dispose: () => segment.dispose() });
    return segment;
  }

  private _wireRegionDrag() {
    const box = this._waveMount.querySelector(".editExport__waveBox") as HTMLElement;
    const dragLayer = document.createElement("div");
    dragLayer.className = "editExport__dragLayer";
    box.appendChild(dragLayer);

    const overlay = document.createElement("div");
    overlay.className = "figureSelectionOverlay";
    const band = document.createElement("div");
    band.className = "figureSelection__band";
    overlay.appendChild(band);
    box.appendChild(overlay);
    this._selectionOverlay = overlay;
    this._selectionBand = band;

    let dragging = false;
    let downX = 0;

    const xToTime = (clientX: number): number => {
      const rect = box.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      return (x / Math.max(1, rect.width)) * this._audioBuffer.duration;
    };

    const updateBand = () => {
      if (!this._selectionBand) {
        return;
      }
      const rect = box.getBoundingClientRect();
      const start = this._editExportSettings.regionStartSec;
      const end = this._editExportSettings.regionEndSec;
      const dur = this._audioBuffer.duration;
      const left = (start / dur) * rect.width;
      const width = ((end - start) / dur) * rect.width;
      this._selectionBand.style.left = `${left}px`;
      this._selectionBand.style.top = "0";
      this._selectionBand.style.width = `${Math.max(1, width)}px`;
      this._selectionBand.style.height = "100%";
    };

    const onRegionUi = () => {
      updateBand();
      this._regionStartInput.value = formatTime(
        this._editExportSettings.regionStartSec,
      );
      this._regionEndInput.value = formatTime(
        this._editExportSettings.regionEndSec,
      );
      this._updateDurationHint();
    };

    this._addEventlistener(dragLayer, EventType.MOUSE_DOWN, (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      dragging = true;
      downX = e.clientX;
      const t = xToTime(e.clientX);
      this._editExportSettings.setRegion(t, t);
      onRegionUi();
      e.preventDefault();
    });

    const onMove = (e: MouseEvent) => {
      if (!dragging) {
        return;
      }
      const t0 = xToTime(downX);
      const t1 = xToTime(e.clientX);
      this._editExportSettings.setRegion(Math.min(t0, t1), Math.max(t0, t1));
      onRegionUi();
    };

    const onUp = () => {
      dragging = false;
    };

    this._addEventlistener(document, EventType.MOUSE_MOVE, onMove);
    this._addEventlistener(document, EventType.MOUSE_UP, onUp);

    for (const type of [
      EventType.EE_UPDATE_REGION_START,
      EventType.EE_UPDATE_REGION_END,
    ]) {
      this._addEventlistener(this._editExportSettings, type, onRegionUi);
    }
    onRegionUi();
  }

  private _wireControls(root: HTMLElement) {
    const applyStart = () => {
      const v = parseTime(this._regionStartInput.value);
      if (v !== null) {
        this._editExportSettings.regionStartSec = v;
      }
    };
    const applyEnd = () => {
      const v = parseTime(this._regionEndInput.value);
      if (v !== null) {
        this._editExportSettings.regionEndSec = v;
      }
    };
    this._addEventlistener(this._regionStartInput, EventType.CHANGE, applyStart);
    this._addEventlistener(this._regionEndInput, EventType.CHANGE, applyEnd);

    this._addEventlistener(
      root.querySelector(".js-editExport-setPlayhead") as HTMLButtonElement,
      EventType.CLICK,
      () => {
        const pos = this._playerService.playbackPosition;
        this._editExportSettings.setRegion(pos, this._editExportSettings.regionEndSec);
      },
    );
    this._addEventlistener(
      root.querySelector(".js-editExport-selectAll") as HTMLButtonElement,
      EventType.CLICK,
      () => this._editExportSettings.selectAll(),
    );
    this._addEventlistener(
      root.querySelector(".js-editExport-importAnalyzer") as HTMLButtonElement,
      EventType.CLICK,
      () => {
        this._editExportSettings.importFromAnalyzer(
          this._analyzeSettings.minTime,
          this._analyzeSettings.maxTime,
        );
        this._setStatus("Imported selection from analyzer.");
      },
    );

    const syncFilters = root.querySelector(
      ".js-editExport-syncFilters",
    ) as HTMLInputElement;

    this._addEventlistener(this._enableHpfInput, EventType.CHANGE, () => {
      this._editExportSettings.enableHpf = this._enableHpfInput.checked;
    });
    this._addEventlistener(this._hpfHzInput, EventType.CHANGE, () => {
      this._editExportSettings.hpfHz = Number(this._hpfHzInput.value);
    });
    this._addEventlistener(this._enableLpfInput, EventType.CHANGE, () => {
      this._editExportSettings.enableLpf = this._enableLpfInput.checked;
    });
    this._addEventlistener(this._lpfHzInput, EventType.CHANGE, () => {
      this._editExportSettings.lpfHz = Number(this._lpfHzInput.value);
    });
    this._addEventlistener(syncFilters, EventType.CHANGE, () => {
      this._editExportSettings.syncFiltersFromPlayer = syncFilters.checked;
      if (syncFilters.checked) {
        this._editExportSettings.applyPlayerFilterSync(this._playerSettings);
      }
      this._updateFilterControlsState();
    });

    for (const type of [
      EventType.PS_UPDATE_ENABLE_HPF,
      EventType.PS_UPDATE_HPF_FREQUENCY,
      EventType.PS_UPDATE_ENABLE_LPF,
      EventType.PS_UPDATE_LPF_FREQUENCY,
    ]) {
      this._addEventlistener(this._playerSettings, type, () => {
        if (this._editExportSettings.syncFiltersFromPlayer) {
          this._editExportSettings.applyPlayerFilterSync(this._playerSettings);
          this._updateFilterControlsState();
        }
      });
    }

    this._addEventlistener(this._exportButton, EventType.CLICK, () => {
      void this._export();
    });
  }

  private _wireSettingsEvents() {
    const onRegion = () => {
      this._regionStartInput.value = formatTime(
        this._editExportSettings.regionStartSec,
      );
      this._regionEndInput.value = formatTime(
        this._editExportSettings.regionEndSec,
      );
      this._updateDurationHint();
    };
    this._addEventlistener(
      this._editExportSettings,
      EventType.EE_UPDATE_REGION_START,
      onRegion,
    );
    this._addEventlistener(
      this._editExportSettings,
      EventType.EE_UPDATE_REGION_END,
      onRegion,
    );
    this._addEventlistener(
      this._editExportSettings,
      EventType.EE_UPDATE_CHANNEL_MODE,
      (e: CustomEventInit<{ value: ExportChannelMode }>) => {
        this._channelSegment.setValue(e.detail.value, true);
      },
    );
    this._addEventlistener(
      this._editExportSettings,
      EventType.EE_UPDATE_LISTEN_MODE,
      (e: CustomEventInit<{ value: EditListenMode }>) => {
        this._listenSegment.setValue(e.detail.value, true);
      },
    );
    this._addEventlistener(
      this._editExportSettings,
      EventType.EE_UPDATE_DESTINATION,
      (e: CustomEventInit<{ value: string }>) => {
        this._destinationSegment.setValue(e.detail.value, true);
      },
    );
  }

  private _updateFilterControlsState() {
    const synced = this._editExportSettings.syncFiltersFromPlayer;
    this._syncFilterHint.hidden = !synced;
    if (synced) {
      this._editExportSettings.applyPlayerFilterSync(this._playerSettings);
    }
    this._enableHpfInput.checked = synced
      ? this._playerSettings.enableHpf
      : this._editExportSettings.enableHpf;
    this._hpfHzInput.value = synced
      ? `${this._playerSettings.hpfFrequency}`
      : `${this._editExportSettings.hpfHz}`;
    this._enableLpfInput.checked = synced
      ? this._playerSettings.enableLpf
      : this._editExportSettings.enableLpf;
    this._lpfHzInput.value = synced
      ? `${this._playerSettings.lpfFrequency}`
      : `${this._editExportSettings.lpfHz}`;
    this._enableHpfInput.disabled = synced;
    this._hpfHzInput.disabled = synced;
    this._enableLpfInput.disabled = synced;
    this._lpfHzInput.disabled = synced;
  }

  private _syncUiFromSettings() {
    const s = this._editExportSettings;
    this._regionStartInput.value = formatTime(s.regionStartSec);
    this._regionEndInput.value = formatTime(s.regionEndSec);
    this._updateDurationHint();

    this._channelSegment.setValue(s.channelMode, true);
    this._listenSegment.setValue(s.listenMode, true);
    this._destinationSegment.setValue(s.destination, true);

    const syncFilters = document.querySelector(
      ".js-editExport-syncFilters",
    ) as HTMLInputElement;
    syncFilters.checked = s.syncFiltersFromPlayer;
    this._updateFilterControlsState();

  }

  private _updateDurationHint() {
    const len =
      this._editExportSettings.regionEndSec -
      this._editExportSettings.regionStartSec;
    this._durationHint.textContent = `${formatTime(len)} s`;
  }

  private _resolvedSettings() {
    this._editExportSettings.applyPlayerFilterSync(this._playerSettings);
    return resolveExportSettings(
      this._editExportSettings.toProps(),
      this._playerSettings,
    );
  }

  private _setBusy(busy: boolean, message?: string) {
    this._busy = busy;
    this._exportButton.disabled = busy;
    this._statusEl.textContent = message ?? "";
    this._statusEl.classList.toggle("editExport__status--busy", busy);
  }

  private _setStatus(message: string) {
    if (!this._busy) {
      this._statusEl.textContent = message;
      this._statusEl.classList.remove("editExport__status--busy");
    }
  }

  private async _export() {
    if (this._busy) {
      return;
    }
    this._setBusy(true, "Rendering export…");
    try {
      const settings = this._resolvedSettings();
      const samples = await renderExportWav(this._audioBuffer, settings);
      const filename = sanitizeFilename(this._filenameInput.value);
      this._postMessage({
        type: WebviewMessageType.WRITE_WAV,
        data: {
          filename,
          samples,
          destination: settings.destination,
        },
      });
      this._setBusy(false, `Exported ${filename}`);
    } catch (err) {
      this._setBusy(false);
      this._setStatus(err instanceof Error ? err.message : "Export failed.");
    }
  }

}
