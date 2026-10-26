import { ComparisonLoudnessController } from "./comparisonLoudnessController";
import { ComparisonFileLoader } from "./comparisonFileLoader";
import {
  commonMeasurementRange,
  measureRms,
  matchingGains,
  measureResidual,
} from "./comparisonMeasurements";
import {
  applyExportEq,
  snapshotExportEq,
} from "../services/headphoneEqService";
import { comparisonTrackLimit } from "../../comparison/limits";
import { ComparisonMonitor } from "./comparisonMonitor";
import { updateEarEqSlidingFocus } from "../utils/earEqSlidingFocus";
import { ComparisonSettings } from "./comparisonSettings";
import KeyboardShortcutsOverlayComponent from "../components/keyboardShortcuts/keyboardShortcutsOverlayComponent";
import { ComparisonStftController } from "./comparisonStftController";
import { comparisonFrequencyAt } from "./stftSettings";
import SettingsOverlayComponent from "../components/settingsOverlay/settingsOverlayComponent";
import AnalyzeSettingsComponent from "../components/analyzeSettings/analyzeSettingsComponent";
import AnalyzeService from "../services/analyzeService";
import { setActiveWorkspacePane } from "../workspacePane";
import {
  ComparisonLiveView,
  createComparisonLiveSettings,
} from "./comparisonLiveView";
import AnalyzeSettingsService from "../services/analyzeSettingsService";
import HeadphoneEqSettingsService from "../services/headphoneEqSettingsService";
import type {
  ComparisonRequest,
  ComparisonResponse,
} from "../../comparison/protocol";
import {
  ComparisonSession,
  comparisonChangeEffects,
  type ComparisonChangeReason,
  type ComparisonTrack,
  type ComparisonPane,
  type StftLayout,
} from "./comparisonSession";
import { themeVariants } from "./trackTheme";
import { ComparisonTransport } from "./comparisonTransport";
import { ComparisonAnalysisClient } from "./analysisClient";
import {
  sliceNativeWindow,
  type AnalysisOptions,
  type SpectrumFrame,
  type StftTile,
} from "./comparisonDsp";
import { ComparisonWaveforms, canvasContext } from "./waveformStrip";
import {
  ContextMenu,
  type ContextMenuItem,
} from "../components/contextMenu/contextMenu";
import {
  WavFormatControls,
  chooseOverload,
} from "../components/editExport/wavFormatControls";
import { renderMix, encodeRenderedWav } from "../services/wavExportFormat";
import type { ExportChannelMode } from "../services/editExportSettingsService";
import { PageRpcClient } from "../services/pageRpcClient";
import { WebviewMessageType } from "../../message";
import { setLoudnessWorkletModuleUrl } from "../utils/loudnessWorkletLoader";
import { colorStftColumns } from "./stftColor";
import { ComparisonAlignment } from "./comparisonAlignment";

export class ComparisonApp {
  private readonly _alignment: ComparisonAlignment;
  private readonly _rpc = new PageRpcClient((message) => {
    if (WebviewMessageType.isAnalyzeSequenceFeatures(message)) {
      this._loudness.postSequence(message);
    } else if (WebviewMessageType.isCancelAnalysis(message)) {
      this._post({
        type: "compare.cancelSequence",
        requestId: message.data.requestId,
      });
    } else if (
      WebviewMessageType.isAutoEqRequest(message) ||
      WebviewMessageType.isEqPresetOp(message) ||
      WebviewMessageType.isSaveEqSettings(message) ||
      WebviewMessageType.isWriteEqProfile(message)
    ) {
      this._post({ type: "compare.eq", message });
    }
  });
  public readonly session = new ComparisonSession();
  public readonly transport: ComparisonTransport;
  private readonly _waveforms = new ComparisonWaveforms(this.session);
  private readonly _menu = new ContextMenu();
  private readonly _format = new WavFormatControls({ bitDepth: 32 });
  private _analysis: ComparisonAnalysisClient | null = null;
  private readonly _loader = new ComparisonFileLoader(
    this.session,
    (message) => this._post(message),
    (message) => this.status(message),
    () => this._analysisReady,
    (id) => {
      this.transport.pause();
      this._analysis?.cancel(id);
      this._profiles.delete(id);
    },
    (track) => this._waveforms.prepare(track),
  );
  private _analysisReady: Promise<ComparisonAnalysisClient> | null = null;
  private _measurementBusy = false;
  private _measurementDialog: HTMLDialogElement | null = null;
  private _workerUrl: string | null = null;
  private _loudnessWorkerReady: Promise<string> | null = null;
  private _loudnessWorkerUrl: string | null = null;
  private _exportRequests = new Map<
    string,
    (response: ComparisonResponse & { type: "compare.exported" }) => void
  >();
  private readonly _loudness = new ComparisonLoudnessController(
    this.session,
    (message) => this._post(message),
    (message) => this.status(message),
    () => this._disposed,
    (id) => this._loader.revision(id),
    () => this._loudnessWorkerReady,
    () => this.drawProfiles(),
    this._rpc,
  );
  private readonly _profiles = this._loudness.profiles;
  private _settingsRevision = 0;
  private _visualRevision = 0;
  private _liveView: ComparisonLiveView | null = null;
  private _comparisonSettings: ComparisonSettings;
  private _shortcuts: KeyboardShortcutsOverlayComponent;
  private _settingsOverlay: SettingsOverlayComponent;
  private _liveSettingsComponent: AnalyzeSettingsComponent | null = null;
  private _liveSettingsAnalyze: AnalyzeService | null = null;
  private _liveSettings: AnalyzeSettingsService | null = null;
  private _liveBusy = false;
  private _desiredLiveTime: number | null = null;
  private _liveFrames = new Map<string, SpectrumFrame>();
  private readonly _stft = new ComparisonStftController(
    this.session,
    () => this._analysis,
    () => this._disposed,
    () => this._settingsRevision,
    (bins) => this.options(bins),
    (canvas) => this._surfaces.delete(canvas),
    (canvas, tile, first, count) => this.drawTile(canvas, tile, first, count),
    (message) => this.status(message),
  );
  private _stftStructure = "";
  private _surfaces = new WeakMap<
    HTMLCanvasElement,
    { image: HTMLCanvasElement; pixels: ImageData }
  >();
  private _raf = 0;
  private _disposed = false;
  private _busyExport = false;
  private readonly _headphoneEq = new HeadphoneEqSettingsService();
  private _headphoneEqLoaded = false;
  private _monitor: ComparisonMonitor;
  private _exportSettings = {
    channelMode: "as_is" as ExportChannelMode,
    sync: false,
    hpf: 0,
    lpf: 0,
  };
  private readonly _onPageHide = () => this.dispose();
  private readonly _onSessionChange = (event: Event) =>
    this.onStateChange(
      (event as CustomEvent<{ reason: ComparisonChangeReason }>).detail.reason,
    );
  private _meterData = new Float32Array(2048);
  private _meterDataRight = new Float32Array(2048);
  private readonly _onMessage = (event: MessageEvent<ComparisonResponse>) =>
    this.receive(event.data);
  private readonly _onKey = (event: KeyboardEvent) => {
    if (
      (event.target as HTMLElement)?.matches?.(
        "input,select,textarea,button,[role=menuitem]",
      )
    ) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      this.togglePlay();
    }
    if (event.key === "Escape") {
      this.exitFullscreen();
    }
  };
  private updateTabFocus(): void {
    const strip = this.element(".workspaceChrome__tabs");
    const focus = this.element(".workspaceChrome__focus");
    updateEarEqSlidingFocus(strip, focus, '[aria-selected="true"]');
  }

  private readonly _onResize = () => {
    this.updateTabFocus();
    if (this._liveView) {
      this._liveView.resize();
    } else {
      this.renderFigures();
    }
  };
  private readonly _onTransportChange = () => {
    void this.requestLive(this.transport.position);
  };

  constructor(
    private readonly _root: HTMLElement,
    private readonly _post: (message: ComparisonRequest) => void,
    context = new AudioContext(),
  ) {
    this.transport = new ComparisonTransport(this.session, context);
    this.transport.addEventListener("change", this._onTransportChange);
    this._root.className = "comparisonApp";
    this._root.innerHTML = `<header class="comparisonChrome stickyHeaderChrome"><div class="comparisonTracks workspaceChrome" data-tracks></div><nav class="comparisonTabs workspaceChrome" role="tablist" aria-label="Visualization mode"><div class="workspaceChrome__tabs"><div class="workspaceChrome__focus earEqSlidingFocus" aria-hidden="true"></div>${[
      ["stft", "STFT"],
      ["live", "Live Spec"],
      ["edit", "Edit & Export"],
      ["loudness", "Loudness"],
    ]
      .map(
        ([id, label]) =>
          `<button class="workspacePane__tab" role="tab" data-pane="${id}">${label}</button>`,
      )
      .join(
        "",
      )}</div><button data-add class="workspaceChrome__settingsBtn" title="Add audio">+</button><button class="workspaceChrome__settingsBtn js-openSettings" aria-label="Pane settings" aria-haspopup="dialog" aria-expanded="false" title="Settings">⚙</button></nav><div class="comparisonSettings"><label>Window <input data-window type="number" min="10" max="320" step="10" value="80">ms</label><label>Hop <input data-hop type="number" min="5" max="200" step="5" value="20">ms</label><label>Spectrum weighting <select data-weight><option value="none">None</option><option value="a">A-weighted</option></select></label><label>Tilt <input data-tilt type="number" min="-12" max="12" step="0.5" value="0">dB/oct</label><button data-reset>Reset view</button></div></header><div class="comparisonStatus" role="status" aria-live="polite" data-status>Loading audio…</div><section class="comparisonWave" data-waves></section><main class="comparisonDeck" data-deck></main><div class="comparisonTransport"><button data-play aria-label="Play comparison">Play</button><input data-seek aria-label="Global playback position" type="range" min="0" max="0" step="0.001" value="0"><label class="comparisonTime"><input data-time-input type="number" min="0" max="0" step="0.01" value="0.00" aria-label="Playback time in seconds"><span data-time>/ 0.00 s</span></label><label><input type="checkbox" data-loop>Loop</label><label class="comparisonVolume">Volume <input data-volume title="Double-click to reset to 100%" aria-label="Master volume" type="range" min="0" max="120" value="100"></label><button class="workspaceChrome__settingsBtn" data-open-monitor aria-label="Open monitor" aria-haspopup="dialog" aria-expanded="false" title="Monitor">Monitor</button><span class="comparisonMeter"><span class="comparisonMeter__bars" aria-hidden="true"><i data-meter-left></i><i data-meter-right></i></span><span data-meter>−∞ dBFS</span></span></div><div id="comparisonSettingsOverlayMount"></div>`;
    this._alignment = new ComparisonAlignment(
      this._root,
      this.session,
      this.transport,
      async (track) => {
        this._analysis?.cancel(track.id);
        this._profiles.delete(track.id);
        this._stft.clear();
        await this._waveforms.prepare(track);
        if (!this._disposed) {
          this.session.notify("loaded");
          this.status(
            `Alignment updated · ${track.name} · session audio; source files unchanged`,
          );
        }
      },
    );
    const settingsContent = this.element<HTMLElement>(".comparisonSettings");
    this._settingsOverlay = new SettingsOverlayComponent(
      "#comparisonSettingsOverlayMount",
    );
    this.element("#settingTab").append(settingsContent);
    const advancedSettings = document.createElement("div");
    advancedSettings.className = "comparisonAdvancedSettings";
    this.element("#settingTab").append(advancedSettings);
    this._comparisonSettings = new ComparisonSettings(
      advancedSettings,
      this.session,
    );
    const shortcutsMount = document.createElement("div");
    shortcutsMount.id = "comparisonShortcuts";
    this._root.append(shortcutsMount);
    this._shortcuts = new KeyboardShortcutsOverlayComponent(
      "#comparisonShortcuts",
      [
        {
          title: "Playback",
          shortcuts: [
            { keys: ["Space"], description: "Play / pause comparison" },
            { keys: ["Click figure"], description: "Set playback position" },
          ],
        },
        {
          title: "Zoom & navigation",
          shortcuts: [
            {
              keys: ["Drag"],
              description: "Zoom selected time and frequency range",
            },
            {
              keys: ["Ctrl / Cmd", "+", "Drag"],
              description: "Zoom time axis only",
            },
            {
              keys: ["Shift", "+", "Drag"],
              description: "Zoom frequency axis only",
            },
            { keys: ["Double-click"], description: "Reset both axes" },
            {
              keys: ["Right-click"],
              description: "Open comparison actions and layout menu",
            },
          ],
        },
        {
          title: "Panels",
          shortcuts: [
            { keys: ["?"], description: "Show / hide this shortcut panel" },
            {
              keys: ["Esc"],
              description: "Close help, settings or fullscreen",
            },
          ],
        },
      ],
    );
    const help = document.createElement("button");
    help.textContent = "?";
    help.className = "workspaceChrome__settingsBtn";
    help.setAttribute("aria-label", "Keyboard shortcuts");
    help.onclick = () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
    this.element(".comparisonTabs").append(help);
    this.element<HTMLButtonElement>("[data-add]").onclick = () =>
      this._post({ type: "compare.add" });
    this.element<HTMLButtonElement>("[data-play]").onclick = () =>
      this.togglePlay();
    this.element<HTMLInputElement>("[data-seek]").oninput = (event) =>
      this.transport.seek(Number((event.target as HTMLInputElement).value));
    this.element<HTMLInputElement>("[data-volume]").oninput = (event) =>
      this.transport.setVolume(
        Number((event.target as HTMLInputElement).value) / 100,
      );
    const volume = this.element<HTMLInputElement>("[data-volume]");
    volume.ondblclick = (event) => {
      event.preventDefault();
      volume.value = "100";
      this.transport.setVolume(1);
    };
    const timeInput = this.element<HTMLInputElement>("[data-time-input]");
    const resetTimeInput = () => {
      timeInput.value = this.transport.position.toFixed(2);
    };
    const commitTime = () => {
      const value = timeInput.valueAsNumber;
      if (Number.isFinite(value)) {
        const target = Math.max(0, Math.min(this.session.duration, value));
        this.transport.seek(target);
        timeInput.value = target.toFixed(2);
      } else {
        resetTimeInput();
      }
    };
    timeInput.onchange = commitTime;
    timeInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTime();
        timeInput.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        resetTimeInput();
        timeInput.blur();
      }
    };
    this.element<HTMLInputElement>("[data-loop]").onchange = (event) => {
      this.transport.loop = (event.target as HTMLInputElement).checked;
    };
    this.element<HTMLButtonElement>("[data-reset]").onclick = () =>
      this.session.resetView();
    for (const button of this._root.querySelectorAll<HTMLButtonElement>(
      "[data-pane]",
    )) {
      button.onclick = () => {
        const pane = button.dataset.pane as ComparisonPane;
        this.session.setPane(pane);
      };
    }
    for (const key of ["window", "hop", "tilt", "weight"]) {
      this.element<HTMLInputElement>(`[data-${key}]`).onchange = () => {
        const windowMs = Math.min(
          320,
          Math.max(
            10,
            Number(this.element<HTMLInputElement>("[data-window]").value) || 80,
          ),
        );
        const hopMs = Math.min(
          200,
          Math.max(
            5,
            Number(this.element<HTMLInputElement>("[data-hop]").value) || 20,
          ),
        );
        const tiltDbPerOct = Math.min(
          12,
          Math.max(
            -12,
            Number(this.element<HTMLInputElement>("[data-tilt]").value) || 0,
          ),
        );
        const weighting = this.element<HTMLSelectElement>("[data-weight]")
          .value as "none" | "a";
        this.session.updateAnalysis({
          windowMs,
          hopMs,
          tiltDbPerOct,
          weighting,
        });
      };
    }
    this._monitor = new ComparisonMonitor(
      this._root,
      this.transport,
      this._headphoneEq,
      this._post,
      this._rpc,
    );
    this.session.addEventListener("change", this._onSessionChange);
    window.addEventListener("message", this._onMessage);
    document.addEventListener("keydown", this._onKey);
    window.addEventListener("resize", this._onResize);
    window.addEventListener("pagehide", this._onPageHide, { once: true });
    // Hold the docked transport open briefly after pointer interaction so it
    // doesn't snap shut mid-adjustment (macOS Dock-style forgiveness).
    let transportHold: ReturnType<typeof setTimeout> | null = null;
    const transport = this.element<HTMLElement>(".comparisonTransport");
    const holdTransport = () => {
      this._root.dataset.transportHold = "true";
      if (transportHold) {
        clearTimeout(transportHold);
      }
      transportHold = setTimeout(() => {
        delete this._root.dataset.transportHold;
        transportHold = null;
      }, 1800);
    };
    for (const eventName of ["pointerdown", "wheel", "focusin"]) {
      transport.addEventListener(eventName, holdTransport, { passive: true });
    }
    this.renderTrackBar();
    this.renderFigures();
    this.tick();
    this._post({ type: "compare.ready" });
  }
  private element<T extends HTMLElement>(selector: string): T {
    return this._root.querySelector<T>(selector);
  }
  private status(message: string): void {
    if (!this._disposed) {
      this.element("[data-status]").textContent = message;
    }
  }
  private receive(message: ComparisonResponse): void {
    if (this._disposed || !message?.type) {
      return;
    }
    this._monitor.receive(message);
    switch (message.type) {
      case "compare.files": {
        this._alignment.client.workerUri = message.workerUri;
        this._loudness.sequenceResources = message;
        if (!this._headphoneEqLoaded && message.headphoneEq) {
          this._headphoneEqLoaded = true;
          this._headphoneEq.loadPersisted(message.headphoneEq);
          this.transport.setHeadphoneEq(this._headphoneEq);
        }
        if (!this._loudnessWorkerReady) {
          this._loudnessWorkerReady = fetch(message.loudnessWorkerUri)
            .then((response) => {
              if (!response.ok) {
                throw new Error("Cannot load loudness analysis worker");
              }
              return response.text();
            })
            .then((source) => {
              if (this._disposed) {
                throw new Error("Comparison closed");
              }
              this._loudnessWorkerUrl = URL.createObjectURL(
                new Blob([source], { type: "text/javascript" }),
              );
              return this._loudnessWorkerUrl;
            });
          // Report startup failures even when Loudness has not been selected yet.
          void this._loudnessWorkerReady.catch((error) => {
            if (!this._disposed) {
              this.status(String(error));
            }
          });
        }
        if (!this._analysisReady) {
          this._analysisReady = fetch(message.workerUri)
            .then((response) => {
              if (!response.ok) {
                throw new Error(
                  `Cannot load comparison worker: ${response.status}`,
                );
              }
              return response.text();
            })
            .then((source) => {
              if (this._disposed) {
                throw new Error("Comparison closed");
              }
              this._workerUrl = URL.createObjectURL(
                new Blob([source], { type: "text/javascript" }),
              );
              this._analysis = new ComparisonAnalysisClient(
                new Worker(this._workerUrl),
                (request) =>
                  this._post(
                    request.type === "compare.analysis"
                      ? {
                          ...request,
                          revision:
                            this._loader.revision(request.job.trackId) ??
                            request.revision,
                        }
                      : request,
                  ),
              );
              return this._analysis;
            });
        }
        setLoudnessWorkletModuleUrl(message.loudnessWorkletUri);
        this._loader.receive(message);
        break;
      }
      case "compare.data":
        this._loader.receive(message);
        break;
      case "compare.changed":
        if (this.session.tracks.some((t) => t.id === message.id)) {
          this.session.markChanged(message.id);
        }
        break;
      case "compare.confirmed":
        this._loader.receive(message);
        break;
      case "compare.exported":
        this._exportRequests.get(message.requestId)?.(message);
        this._exportRequests.delete(message.requestId);
        break;
      case "compare.analysisResult":
        this._analysis?.handleHostResponse(message.reply);
        break;
      case "compare.sequenceResult":
        this._rpc.handleResponse({
          ...message.message,
          data: {
            ...message.message.data,
            payload: message.message.data.profile,
          },
        });
        break;
      case "compare.failure":
        this._loader.receive(message);
        break;
    }
  }
  private onStateChange(reason: ComparisonChangeReason): void {
    this.preserveScroll(() => this.applyStateChange(reason));
  }
  private preserveScroll(update: () => void): void {
    const nodes: HTMLElement[] = [];
    for (let node: HTMLElement = this._root; node; node = node.parentElement) {
      nodes.push(node);
    }
    const positions = nodes.map(
      (node) => [node, node.scrollLeft, node.scrollTop] as const,
    );
    const minHeight = this._root.style.minHeight;
    this._root.style.minHeight = `${this._root.getBoundingClientRect().height}px`;
    try {
      update();
    } finally {
      this._root.style.minHeight = minHeight;
      for (const [node, left, top] of positions) {
        node.scrollLeft = left;
        node.scrollTop = top;
      }
    }
  }
  private applyStateChange(reason: ComparisonChangeReason): void {
    if (this._disposed) {
      return;
    }
    const effects = comparisonChangeEffects(reason);
    if (reason === "settings") {
      this._settingsRevision++;
      this._analysis?.cancel();
      if (
        this._liveSettings &&
        this._liveSettings.liveSpectrumTiltDbPerOct !==
          this.session.tiltDbPerOct
      ) {
        this._liveSettings.liveSpectrumTiltDbPerOct = this.session.tiltDbPerOct;
      }
    }
    if (effects.cancelProfiles) {
      this._loudness.cancelProfiles();
    }
    this._comparisonSettings?.sync();
    for (const [key, value] of [
      ["window", this.session.windowMs],
      ["hop", this.session.hopMs],
      ["tilt", this.session.tiltDbPerOct],
      ["weight", this.session.weighting],
    ] as const) {
      this.element<HTMLInputElement>(`[data-${key}]`).value = String(value);
    }
    this.renderTrackBar();
    this.renderLegend();
    const exportButton = this.element<HTMLButtonElement>("[data-export]");
    if (exportButton) {
      exportButton.disabled =
        this._busyExport || !this.session.audibleTracks.length;
    }
    if (effects.prune) {
      this._waveforms.prune();
      for (const id of new Set([
        ...this._profiles.keys(),
        ...this._liveFrames.keys(),
      ])) {
        if (!this.session.tracks.some((t) => t.id === id)) {
          this._profiles.delete(id);
          this._liveFrames.delete(id);
        }
      }
    }
    if (effects.waves) {
      this.renderWaves();
      const editWaves = this.element("[data-edit-waves]");
      if (editWaves) {
        this.renderWaves(editWaves);
      }
    }
    if (effects.figures) {
      if (
        this.session.pane === "live" &&
        this._liveView &&
        reason !== "pane" &&
        this.session.activeTracks.length
      ) {
        ++this._visualRevision;
        this._analysis?.cancel();
        this._liveView.invalidate();
        void this.requestLive(this.transport.position);
      } else {
        this.renderFigures();
      }
    }
    if (reason === "selection") {
      this.updateSelection();
    }
  }
  private renderTrackBar(): void {
    const root = this.element("[data-tracks]");
    const tracks = this.session.tracks;
    for (const node of Array.from(root.children) as HTMLElement[]) {
      if (!tracks.some((track) => track.id === node.dataset.trackId)) {
        node.remove();
      }
    }
    for (const track of tracks) {
      let item = Array.from(root.children).find(
        (node: HTMLElement) => node.dataset.trackId === track.id,
      ) as HTMLElement;
      if (!item) {
        item = document.createElement("div");
        item.className = "comparisonTrack";
        item.dataset.trackId = track.id;
        item.innerHTML = `<button class="comparisonTrack__active" data-action="active" aria-label="Participate in comparison"><span aria-hidden="true"></span></button><button class="comparisonTrack__name" data-action="focus"></button><div class="comparisonTrack__actions"><button class="comparisonTrack__icon" data-action="mute" aria-label="Mute track"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path class="speakerOn" d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/><path class="speakerOff" d="m16 9 5 6m0-6-5 6"/></svg></button><button class="comparisonTrack__icon" data-action="reload" aria-label="Reload changed source file" title="Reload changed source file" hidden>↻</button><button class="comparisonTrack__icon" data-action="remove" aria-label="Remove from comparison" title="Remove from comparison (does not delete file)">×</button></div>`;
        this.bindMenu(item, false);
        const current = () =>
          this.session.tracks.find((t) => t.id === track.id);
        item.querySelector<HTMLButtonElement>(
          '[data-action="active"]',
        ).onclick = () => {
          const t = current();
          if (t) {
            this.session.setActive(t.id, !t.active);
          }
        };
        item.querySelector<HTMLButtonElement>('[data-action="focus"]').onclick =
          () => this.session.setFocus(track.id);
        item.querySelector<HTMLButtonElement>('[data-action="mute"]').onclick =
          () => {
            const t = current();
            if (t) {
              this.session.setMuted(t.id, !t.muted);
            }
          };
        item.querySelector<HTMLButtonElement>(
          '[data-action="reload"]',
        ).onclick = () => {
          this.transport.pause();
          // Settle old jobs before the host advances the source revision, even
          // when reading or decoding the replacement file later fails.
          this._analysis?.cancel(track.id);
          this._post({ type: "compare.reload", id: track.id });
        };
        item.querySelector<HTMLButtonElement>(
          '[data-action="remove"]',
        ).onclick = () => {
          this._analysis?.cancel(track.id);
          this._loader.remove(track.id);
          this.session.remove(track.id);
          this._post({ type: "compare.remove", id: track.id });
        };
        root.append(item);
      }
      item.style.setProperty("--track-color", track.color);
      item.dataset.active = String(track.active);
      item.dataset.focused = String(this.session.focus?.id === track.id);
      const name = item.querySelector<HTMLButtonElement>(
        '[data-action="focus"]',
      );
      name.textContent = track.name;
      name.title = `${track.name}\nRMS match: ${(20 * Math.log10(this.session.playbackGain(track.id))).toFixed(2)} dB\n${track.buffer.sampleRate / 1000} kHz · ${track.buffer.numberOfChannels === 1 ? "mono" : "stereo"} · ${track.buffer.duration.toFixed(2)} s`;
      const active = item.querySelector<HTMLButtonElement>(
        '[data-action="active"]',
      );
      active.setAttribute("aria-pressed", String(track.active));
      active.title = track.active ? "Bypass track" : "Activate track";
      const mute = item.querySelector<HTMLButtonElement>(
        '[data-action="mute"]',
      );
      mute.disabled = !track.active;
      mute.setAttribute("aria-pressed", String(track.muted));
      mute.title = track.muted ? "Unmute track" : "Mute track";
      item.querySelector<HTMLButtonElement>('[data-action="reload"]').hidden =
        !track.changed;
    }
    this.element<HTMLButtonElement>("[data-add]").disabled =
      this._loader.size >= comparisonTrackLimit;
    this.element<HTMLButtonElement>("[data-play]").disabled =
      !this.session.activeTracks.length;
  }
  private renderWaves(root = this.element("[data-waves]")): void {
    this.preserveScroll(() => this.renderWavesContent(root));
  }
  private renderWavesContent(root: HTMLElement): void {
    root.hidden = !this.session.waveformVisible;
    root.replaceChildren();
    if (!this.session.waveformVisible) {
      return;
    }
    if (!this.session.focus) {
      return;
    }
    const mount = (track: ComparisonTrack, parent: HTMLElement) => {
      const row = document.createElement("div");
      row.className = "comparisonWave__row";
      row.style.setProperty("--track-color", track.color);
      const label = document.createElement("div");
      label.className = "comparisonWave__label";
      label.textContent = track.name;
      const plot = document.createElement("div");
      plot.className = "comparisonFigure--overlayHost";
      row.append(label, plot);
      parent.append(row);
      const canvases = this._waveforms.draw(plot, track);
      for (const canvas of canvases) {
        canvas.dataset.trackWave = track.id;
        canvas.dataset.timeline = "true";
        this.bindTimeline(canvas, false);
      }
      this.mountTimelineOverlay(plot);
    };
    mount(this.session.focus, root);
    const others = this.session.activeTracks.filter(
      (t) => t.id !== this.session.focus.id,
    );
    if (others.length) {
      const toggle = document.createElement("button");
      toggle.dataset.wavesExpand = "true";
      toggle.textContent = `${this.session.expanded ? "▾" : "▸"} ${others.length} more waveforms`;
      toggle.setAttribute("aria-expanded", String(this.session.expanded));
      root.append(toggle);
      const extra = document.createElement("div");
      extra.className = "comparisonWave__extra";
      extra.dataset.expanded = String(this.session.expanded);
      const inner = document.createElement("div");
      inner.className = "comparisonWave__extraInner";
      extra.append(inner);
      root.append(extra);
      others.forEach((track) => mount(track, inner));
      toggle.onclick = () => {
        this.session.expanded = !this.session.expanded;
        for (const container of this._root.querySelectorAll<HTMLElement>(
          ".comparisonWave__extra",
        )) {
          container.dataset.expanded = String(this.session.expanded);
        }
        for (const trigger of this._root.querySelectorAll<HTMLButtonElement>(
          "[data-waves-expand]",
        )) {
          trigger.textContent = `${this.session.expanded ? "▾" : "▸"} ${others.length} more waveforms`;
          trigger.setAttribute("aria-expanded", String(this.session.expanded));
        }
      };
    }
    this.updateSelection();
  }
  private renderFigures(): void {
    this.preserveScroll(() => this.renderFiguresContent());
  }
  private renderFiguresContent(): void {
    if (this._disposed) {
      return;
    }
    setActiveWorkspacePane(
      this.session.pane === "live" ? "liveSpec" : this.session.pane,
    );
    const nativeSettings = this.element("#comparisonLiveSettings");
    if (nativeSettings) {
      nativeSettings.hidden = this.session.pane !== "live";
    }
    ++this._visualRevision;
    this._stft.beginRender();
    this._liveView?.dispose();
    this._liveView = null;
    const root = this.element("[data-deck]");
    const structure = JSON.stringify([
      this.session.stftLayout,
      this.session.stft.visible,
      this.session.tracks.map((t) => [t.id, t.name, t.color]),
    ]);
    const reuse =
      this.session.pane === "stft" &&
      this._stftStructure === structure &&
      !!root.querySelector(".comparisonGrid");
    if (!reuse) {
      root.replaceChildren();
    }
    this._stftStructure = this.session.pane === "stft" ? structure : "";
    for (const tab of this._root.querySelectorAll<HTMLButtonElement>(
      "[data-pane]",
    )) {
      tab.setAttribute(
        "aria-selected",
        String(tab.dataset.pane === this.session.pane),
      );
    }
    this.updateTabFocus();
    if (
      !this.session.activeTracks.length &&
      (this.session.pane !== "stft" || !this.session.tracks.length)
    ) {
      root.innerHTML = `<div class="comparisonEmpty">Activate an audio file to compare.</div>`;
      return;
    }
    if (this.session.pane === "stft") {
      const grid =
        (reuse ? root.querySelector<HTMLElement>(".comparisonGrid") : null) ??
        document.createElement("div");
      grid.className = "comparisonGrid";
      const count = this.session.tracks.length;
      const columns =
        this.session.stftLayout === "column"
          ? 1
          : this.session.stftLayout === "row"
            ? count
            : count >= 4
              ? 2
              : count;
      grid.style.setProperty("--columns", String(columns));
      if (!reuse) {
        root.append(grid);
      }
      grid.hidden = !this.session.stft.visible;
      for (const track of this.session.tracks) {
        const canvas =
          Array.from(
            grid.querySelectorAll<HTMLCanvasElement>("canvas[data-stft]"),
          ).find((c) => c.dataset.stft === track.id) ??
          this.figure(grid, track.name + " · dBFS", track.color);
        const isNew = !canvas.dataset.stft;
        canvas.closest<HTMLElement>(".comparisonFigure").dataset.active =
          String(track.active);
        if (
          canvas.style.height !== String(this.session.stft.height) + "px" ||
          canvas.width !==
            Math.ceil(
              Math.max(
                200,
                Math.round(
                  canvas.clientWidth ||
                    canvas.parentElement?.clientWidth ||
                    800,
                ),
              ) * Math.min(2, window.devicePixelRatio || 1),
            )
        ) {
          canvasContext(canvas, this.session.stft.height);
          delete canvas.dataset.drawnKey;
        }
        canvas.dataset.stft = track.id;
        canvas.dataset.timeline = "true";
        const frequencyLabel =
          canvas
            .closest(".comparisonFigure")
            .querySelector<HTMLElement>(".comparisonFigure__frequencies") ??
          document.createElement("div");
        frequencyLabel.className = "comparisonFigure__frequencies";
        frequencyLabel.textContent = `${this.session.view.minHz.toFixed(0)} Hz – ${(this.session.view.maxHz / 1000).toFixed(2)} kHz · ${this.session.stft.frequencyScale} · common scale ${this.session.stft.dbLow}…${this.session.stft.dbHigh} dBFS`;
        canvas.parentElement.before(frequencyLabel);
        const axis =
          canvas
            .closest(".comparisonFigure")
            .querySelector<HTMLElement>(".comparisonFigure__axis") ??
          document.createElement("div");
        axis.replaceChildren();
        axis.className = "comparisonFigure__axis";
        for (let i = 0; i < 3; i++) {
          const tick = document.createElement("span");
          tick.textContent =
            (
              this.session.view.start +
              ((this.session.view.end - this.session.view.start) * i) / 2
            ).toFixed(2) + " s";
          axis.append(tick);
        }
        canvas.parentElement.after(axis);
        if (isNew) {
          this.mountTimelineOverlay(canvas.parentElement);
          this.bindTimeline(canvas, true);
          this.bindMenu(canvas.parentElement, true);
        }
        if (this.session.stft.visible && track.active) {
          void this._stft.loadStft(track, canvas);
        }
      }
    } else if (this.session.pane === "live") {
      const mount = document.createElement("div");
      mount.className =
        "graphDeck__pane graphDeck__pane--live comparisonLiveMount";
      root.append(mount);
      if (!this._liveSettings) {
        this._liveSettings = createComparisonLiveSettings(
          this.session.maxFrequency * 2,
        );
        this._liveSettings.liveSpectrumTiltDbPerOct = this.session.tiltDbPerOct;
        const settingsMount = document.createElement("div");
        settingsMount.id = "comparisonLiveSettings";
        this.element("#settingTab").append(settingsMount);
        this._liveSettingsAnalyze = new AnalyzeService(
          new AudioBuffer({
            numberOfChannels: 1,
            length: 1,
            sampleRate: this.session.maxFrequency * 2,
          }),
        );
        this._liveSettingsComponent = new AnalyzeSettingsComponent(
          "#comparisonLiveSettings",
          this._liveSettingsAnalyze,
          this._liveSettings,
        );
      }
      this._liveView = new ComparisonLiveView(
        mount,
        this.session,
        this.transport,
        this._liveSettings,
        () => {
          this.element<HTMLInputElement>("[data-tilt]").value = String(
            this.session.tiltDbPerOct,
          );
          ++this._settingsRevision;
          ++this._visualRevision;
          this._analysis?.cancel();
          void this.requestLive(this.transport.position);
        },
      );
      void this.requestLive(this.transport.position);
    } else if (this.session.pane === "edit") {
      this.renderExport(root);
    } else {
      this.renderLoudness(root);
    }
    this.renderLegend();
  }
  private renderLegend(): void {
    const root = this.element("[data-deck]");
    root.querySelector(".comparisonLegend")?.remove();
    if (!this.session.activeTracks.length) {
      return;
    }
    const legend = document.createElement("div");
    legend.className = "comparisonLegend";
    for (const track of this.session.activeTracks) {
      const text = document.createElement("span");
      text.style.color = track.color;
      text.dataset.legendTrack = track.id;
      text.textContent = track.name + (track.muted ? " · muted" : "");
      legend.append(text);
    }
    root.append(legend);
  }
  private figure(
    parent: HTMLElement,
    title: string,
    color = "#bbb",
  ): HTMLCanvasElement {
    const figure = document.createElement("section");
    figure.className = "comparisonFigure";
    const heading = document.createElement("h3");
    heading.textContent = title;
    heading.style.color = color;
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "comparisonFigure__canvasWrap";
    const canvas = document.createElement("canvas");
    canvasWrap.append(canvas);
    figure.append(heading, canvasWrap);
    parent.append(figure);
    canvasContext(canvas, 260);
    return canvas;
  }
  private options(bins = 256): AnalysisOptions {
    return {
      windowMs: this.session.windowMs,
      minHz: this.session.view.minHz,
      maxHz: this.session.view.maxHz,
      bins,
      tiltDbPerOct: this.session.tiltDbPerOct,
      weighting: this.session.weighting,
    };
  }
  private drawTile(
    canvas: HTMLCanvasElement,
    tile: StftTile,
    first = 0,
    count = tile.columns,
  ): void {
    const ctx = canvas.getContext("2d");
    let surface = this._surfaces.get(canvas);
    if (
      !surface ||
      surface.image.width !== tile.columns ||
      surface.image.height !== tile.bins
    ) {
      const image = document.createElement("canvas");
      image.width = tile.columns;
      image.height = tile.bins;
      const pixels = image
        .getContext("2d")
        .createImageData(tile.columns, tile.bins);
      const blank = new Float32Array(tile.columns * tile.bins).fill(NaN);
      colorStftColumns(
        blank,
        tile.columns,
        tile.bins,
        0,
        tile.columns,
        pixels.data,
      );
      image.getContext("2d").putImageData(pixels, 0, 0);
      surface = { image, pixels };
      this._surfaces.set(canvas, surface);
    }
    const { image, pixels } = surface;
    colorStftColumns(
      tile.values,
      tile.columns,
      tile.bins,
      first,
      count,
      pixels.data,
      this.session.stft.dbLow,
      this.session.stft.dbHigh,
    );
    image
      .getContext("2d")
      .putImageData(pixels, 0, 0, first, 0, count, tile.bins);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, canvas.width / ratio, canvas.height / ratio);
  }
  private async requestLive(time: number): Promise<void> {
    if (!this._analysis || this.session.pane !== "live") {
      return;
    }
    if (this._liveBusy) {
      this._desiredLiveTime = time;
      return;
    }
    this._liveBusy = true;
    this._desiredLiveTime = null;
    const revision = this._visualRevision;
    const started = performance.now();
    try {
      const options = {
        ...this.options(1024),
        minHz: 10,
        maxHz: this.session.maxFrequency,
        windowMs: this._liveSettings
          ? ((this._liveSettings.liveSpectrumMode === "cqt"
              ? 32768
              : this._liveSettings.liveAnalysisFftSize) /
              (this.session.maxFrequency * 2)) *
            1000
          : this.session.windowMs,
      };
      const results = await Promise.all(
        this.session.activeTracks.map(async (track) => {
          if (time >= track.buffer.duration) {
            return { id: track.id, frame: null };
          }
          const audio = sliceNativeWindow(
            track.buffer,
            time - options.windowMs / 1000,
            time,
          );
          const result = await this._analysis.request({
            kind: "live",
            trackId: track.id,
            audioRevision: track.revision,
            settingsRevision: this._settingsRevision,
            audio,
            options,
            time,
          });
          return { id: track.id, frame: result?.frame };
        }),
      );
      if (revision !== this._visualRevision) {
        return;
      }
      this._liveFrames.clear();
      for (const { id, frame } of results) {
        if (frame) {
          this._liveFrames.set(id, frame);
        }
      }
      this._liveView?.publish(
        time,
        options,
        this._liveFrames,
        this._settingsRevision,
      );
      // Bounded diagnostics for the native integration benchmark; no sample data.
      this._root.dataset.liveAnalysisMs = String(performance.now() - started);
      this._root.dataset.liveTime = String(time);
    } finally {
      this._liveBusy = false;
      if (this._desiredLiveTime !== null && !this._disposed) {
        const next = this._desiredLiveTime;
        this._desiredLiveTime = null;
        void this.requestLive(next);
      }
    }
  }
  private renderExport(root: HTMLElement): void {
    const controls = document.createElement("div");
    controls.className = "comparisonExport";
    controls.innerHTML = `<label>Start <input data-start type="number" min="0" step="0.001" value="${this.session.selection.start}"></label><label>End <input data-end type="number" min="0" step="0.001" value="${this.session.selection.end}"></label><button data-select-all>Select all</button><label>Channels <select data-channels><option value="as_is">Stereo mix</option><option value="mono_mix">Mono mix</option><option value="mono_left">Left only</option><option value="mono_right">Right only</option></select></label><label><input data-sync type="checkbox">Sync playback filters</label><label>HPF <input data-export-hpf type="number" min="0" value="0">Hz</label><label>LPF <input data-export-lpf type="number" min="0" value="0">Hz</label><button data-export>Export mix WAV…</button>`;
    controls.querySelector<HTMLSelectElement>("[data-channels]").value =
      this._exportSettings.channelMode;
    controls.querySelector<HTMLInputElement>("[data-sync]").checked =
      this._exportSettings.sync;
    controls.querySelector<HTMLInputElement>("[data-export-hpf]").value =
      String(this._exportSettings.hpf);
    controls.querySelector<HTMLInputElement>("[data-export-lpf]").value =
      String(this._exportSettings.lpf);
    for (const key of ["channels", "sync", "export-hpf", "export-lpf"]) {
      controls.querySelector<HTMLInputElement>(`[data-${key}]`).onchange =
        () => {
          this._exportSettings = {
            channelMode: controls.querySelector<HTMLSelectElement>(
              "[data-channels]",
            ).value as ExportChannelMode,
            sync: controls.querySelector<HTMLInputElement>("[data-sync]")
              .checked,
            hpf:
              Number(
                controls.querySelector<HTMLInputElement>("[data-export-hpf]")
                  .value,
              ) || 0,
            lpf:
              Number(
                controls.querySelector<HTMLInputElement>("[data-export-lpf]")
                  .value,
              ) || 0,
          };
        };
    }
    controls.prepend(this._format.element);
    root.append(controls);
    for (const key of ["start", "end"]) {
      controls.querySelector<HTMLInputElement>(`[data-${key}]`).onchange = () =>
        this.session.setSelection(
          Number(
            controls.querySelector<HTMLInputElement>("[data-start]").value,
          ),
          Number(controls.querySelector<HTMLInputElement>("[data-end]").value),
        );
    }
    controls.querySelector<HTMLButtonElement>("[data-select-all]").onclick =
      () => this.session.setSelection(0, this.session.duration);
    controls.querySelector<HTMLButtonElement>("[data-export]").onclick = () =>
      void this.exportMix(controls);
    controls.querySelector<HTMLButtonElement>("[data-export]").disabled =
      this._busyExport || !this.session.audibleTracks.length;
    const hint = document.createElement("p");
    hint.textContent =
      "Exports active, unmuted sources. Mono is center-panned at −3.01 dB per channel. RMS matching gains are included. Master volume is excluded; headphone EQ is optional.";
    root.append(hint);
    // This is the same waveform strip as the overview, not a second implementation.
    const waves = document.createElement("div");
    waves.className = "comparisonWave";
    waves.dataset.editWaves = "true";
    root.append(waves);
    this.renderWaves(waves);
    this.bindMenu(waves, false);
    this.updateSelection();
  }
  private async exportMix(controls: HTMLElement): Promise<void> {
    if (this._busyExport || !this.session.audibleTracks.length) {
      return;
    }
    this._busyExport = true;
    const button = controls.querySelector<HTMLButtonElement>("[data-export]");
    button.disabled = true;
    try {
      const tracks = [...this.session.audibleTracks];
      const { start, end } = this.session.selection;
      const format = {
        ...this._format.value,
        channelMode: controls.querySelector<HTMLSelectElement>(
          "[data-channels]",
        ).value as ExportChannelMode,
      };
      const rate =
        format.sampleRate ??
        Math.max(...tracks.map((track) => track.buffer.sampleRate));
      const sync =
        controls.querySelector<HTMLInputElement>("[data-sync]").checked;
      const hpf = sync
        ? this.transport.hpfHz
        : Number(
            controls.querySelector<HTMLInputElement>("[data-export-hpf]").value,
          );
      const lpf = sync
        ? this.transport.lpfHz
        : Number(
            controls.querySelector<HTMLInputElement>("[data-export-lpf]").value,
          );
      this.status("Rendering selected mix…");
      const eq = this._format.applyHeadphoneEq
        ? snapshotExportEq(this._headphoneEq)
        : undefined;
      const rendered = await renderMix(
        tracks.map((track) => track.buffer),
        start,
        end,
        rate,
        { enableHpf: hpf > 0, hpfHz: hpf, enableLpf: lpf > 0, lpfHz: lpf },
        true,
        tracks.map((track) => this.session.playbackGain(track.id)),
      );
      const processed = await applyExportEq(rendered, eq);
      const bytes = await encodeRenderedWav(
        processed,
        format,
        null,
        chooseOverload,
      );
      if (!bytes || this._disposed) {
        this.status("Export cancelled");
        return;
      }
      const requestId = `export-${Date.now()}`;
      const result = await new Promise<
        ComparisonResponse & { type: "compare.exported" }
      >((resolve) => {
        this._exportRequests.set(requestId, resolve);
        this._post({
          type: "compare.export",
          requestId,
          samples: bytes.buffer,
        });
      });
      this.status(
        result.error ??
          (result.path ? `Exported ${result.path}` : "Export cancelled"),
      );
    } catch (error) {
      this.status(String(error));
    } finally {
      this._busyExport = false;
      const currentButton = this.element<HTMLButtonElement>("[data-export]");
      if (currentButton) {
        currentButton.disabled = !this.session.audibleTracks.length;
      }
    }
  }
  private renderLoudness(root: HTMLElement): void {
    const summary = document.createElement("div");
    summary.className = "comparisonLoudnessSummary";
    summary.dataset.loudnessSummary = "true";
    root.append(summary);
    this.updateLoudnessSummary();
    for (const [key, label] of [
      ["lufs", "Loudness · short-term LUFS"],
      ["f0", "F0 · Hz"],
      ["onset", "Onset · positive spectral flux"],
    ]) {
      const canvas = this.figure(root, label);
      canvas.dataset.feature = key;
      canvas.dataset.timeline = "true";
      this.mountTimelineOverlay(canvas.parentElement);
      this.bindTimeline(canvas, false);
      this.bindMenu(canvas.parentElement, false);
      this.bindLoudnessHover(canvas);
    }
    this.drawProfiles();
    void this._loudness.loadProfiles();
  }
  private updateLoudnessSummary(): void {
    const host = this.element<HTMLElement>("[data-loudness-summary]");
    if (!host) {
      return;
    }
    const table = document.createElement("table");
    table.innerHTML =
      '<thead><tr><th scope="col">Track</th><th scope="col">LUFS-I</th><th scope="col">LRA · LU</th><th scope="col">TP · dBTP</th></tr></thead>';
    const body = table.createTBody();
    const format = (value: number) =>
      Number.isFinite(value) ? value.toFixed(1) : "−∞";
    for (const track of this.session.activeTracks) {
      const row = body.insertRow();
      row.style.setProperty("--track-color", track.color);
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = track.name;
      name.title = track.name;
      row.append(name);
      const profile = this._profiles.get(track.id);
      if (!profile?.complete || !profile.loudness) {
        const status = row.insertCell();
        status.colSpan = 3;
        status.textContent = profile?.error
          ? "Analysis unavailable"
          : "Analyzing…";
      } else {
        for (const value of [
          profile.loudness.integratedLufs,
          profile.loudness.loudnessRangeLu,
          profile.loudness.maxTruePeakDbTp,
        ]) {
          row.insertCell().textContent = format(value);
        }
      }
    }
    host.replaceChildren(table);
  }

  private bindLoudnessHover(canvas: HTMLCanvasElement): void {
    const readout = canvas.parentElement.querySelector<HTMLElement>(
      ".comparisonFigure__frequencies",
    );
    if (!readout) {
      return;
    }
    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const time =
        this.session.view.start +
        ((event.clientX - rect.left) / Math.max(1, rect.width)) *
          (this.session.view.end - this.session.view.start);
      const feature = canvas.dataset.feature;
      readout.replaceChildren(document.createTextNode(`${time.toFixed(2)} s`));
      for (const track of this.session.activeTracks) {
        const profile = this._profiles.get(track.id);
        if (!profile?.complete) {
          continue;
        }
        const variants = themeVariants(track.color);
        let text = "";
        if (feature === "lufs" && profile.loudness) {
          const idx = profile.loudness.timeSec.findIndex((t) => t >= time);
          if (idx >= 0) {
            const s = profile.loudness.shortTermLufs[idx];
            text = `S ${s.toFixed(1)} LUFS`;
          }
        } else if (feature === "f0" && profile.sequence) {
          const idx = profile.sequence.timeSec.findIndex((t) => t >= time);
          if (idx >= 0) {
            text = `${profile.sequence.f0Hz[idx].toFixed(1)} Hz`;
          }
        } else if (feature === "onset" && profile.sequence) {
          const idx = profile.sequence.timeSec.findIndex((t) => t >= time);
          if (idx >= 0) {
            text = `flux ${profile.sequence.onsetFlux[idx].toFixed(2)}`;
          }
        }
        if (text) {
          const name = document.createElement("span");
          name.style.color = variants.base;
          name.textContent = track.name;
          readout.append(" · ", name, ` ${text}`);
        }
      }
    });
    canvas.addEventListener("mouseleave", () => {
      readout.textContent = "";
    });
  }
  private drawProfiles(): void {
    this.updateLoudnessSummary();
    const view = this.session.view;
    for (const canvas of this._root.querySelectorAll<HTMLCanvasElement>(
      "canvas[data-feature]",
    )) {
      const { ctx, width, height } = canvasContext(canvas, 155);
      ctx.fillStyle = "#151618";
      ctx.fillRect(0, 0, width, height);
      const feature = canvas.dataset.feature;
      const onsetMax = Math.max(
        1,
        ...this.session.activeTracks.map((t) => {
          let max = 1;
          for (const value of this._profiles.get(t.id)?.sequence?.onsetFlux ??
            []) {
            max = Math.max(max, value);
          }
          return max;
        }),
      );
      for (const track of this.session.activeTracks) {
        const profile = this._profiles.get(track.id);
        if (!profile) {
          continue;
        }
        const times =
          feature === "lufs"
            ? profile.loudness?.timeSec
            : profile.sequence?.timeSec;
        const series =
          feature === "lufs"
            ? [profile.loudness?.shortTermLufs]
            : feature === "f0"
              ? [profile.sequence?.f0Hz]
              : [profile.sequence?.onsetFlux];
        if (!times) {
          continue;
        }
        const variants = themeVariants(track.color);
        for (const values of series) {
          if (!values) {
            continue;
          }
          ctx.strokeStyle =
            feature === "lufs"
              ? variants.lufsS
              : feature === "f0"
                ? variants.f0
                : variants.onset;
          ctx.globalAlpha = feature === "onset" ? 0.65 : 0.95;
          ctx.lineWidth = feature === "lufs" ? 2 : 1.3;
          ctx.setLineDash([]);
          ctx.beginPath();
          let drawing = false;
          for (let i = 0; i < times.length; i++) {
            const time = times[i],
              value = values[i];
            if (
              time < view.start ||
              time > view.end ||
              !Number.isFinite(value)
            ) {
              drawing = false;
              continue;
            }
            const x =
              ((time - view.start) / Math.max(0.001, view.end - view.start)) *
              width;
            const normalized =
              feature === "lufs"
                ? (value + 70) / 70
                : feature === "f0"
                  ? Math.log2(Math.max(50, value) / 50) / Math.log2(4000 / 50)
                  : value / onsetMax;
            const y =
              height - Math.max(0, Math.min(1, normalized)) * (height - 8);
            if (drawing) {
              ctx.lineTo(x, y);
            } else {
              ctx.moveTo(x, y);
              drawing = true;
            }
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.setLineDash([]);
        }
      }
    }
  }
  private mountTimelineOverlay(host: HTMLElement): void {
    if (!host) {
      return;
    }
    const layer = document.createElement("div");
    layer.className = "comparisonTimelineOverlay";
    host.classList.add("comparisonFigure--overlayHost");
    layer.style.top = "0";
    layer.style.left = "0";
    layer.style.right = "0";
    layer.style.bottom = "0";
    layer.innerHTML =
      '<div class="comparisonPlayhead"></div><div class="comparisonSelection"></div>';
    host.append(layer);
    this.updateSelection();
  }
  private bindTimeline(canvas: HTMLCanvasElement, frequency: boolean): void {
    const timeAt = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return (
        this.session.view.start +
        (Math.max(0, Math.min(rect.width, event.clientX - rect.left)) /
          Math.max(1, rect.width)) *
          (this.session.view.end - this.session.view.start)
      );
    };
    const frequencyAt = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const fraction = Math.max(
        0,
        Math.min(1, 1 - (event.clientY - rect.top) / Math.max(1, rect.height)),
      );
      return comparisonFrequencyAt(
        fraction,
        this.session.view.minHz,
        this.session.view.maxHz,
        this.session.stft.frequencyScale,
        this.session.stft.hybridRatio,
      );
    };
    let down: {
      x: number;
      y: number;
      band: HTMLElement;
      overlay: HTMLElement;
    } | null = null;
    const axisMode = (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        return "time";
      }
      if (frequency && event.shiftKey) {
        return "frequency";
      }
      return frequency ? "both" : "time";
    };
    const drawBand = (
      band: HTMLElement,
      from: { x: number; y: number },
      to: { x: number; y: number },
      mode: "time" | "frequency" | "both",
    ) => {
      const rect = canvas.getBoundingClientRect();
      const left = Math.max(0, Math.min(from.x, to.x) - rect.left);
      const right = Math.min(rect.width, Math.max(from.x, to.x) - rect.left);
      const top = Math.max(0, Math.min(from.y, to.y) - rect.top);
      const bottom = Math.min(rect.height, Math.max(from.y, to.y) - rect.top);
      if (mode !== "frequency") {
        band.style.left = `${left}px`;
        band.style.width = `${Math.max(0, right - left)}px`;
      } else {
        band.style.left = "0";
        band.style.width = "100%";
      }
      if (mode !== "time") {
        band.style.top = `${top}px`;
        band.style.height = `${Math.max(0, bottom - top)}px`;
      } else {
        band.style.top = "0";
        band.style.height = "100%";
      }
    };
    canvas.onpointerdown = (event) => {
      if (event.button !== 0 || down) {
        return;
      }
      const host = canvas.closest<HTMLElement>(
        ".comparisonFigure__canvasWrap, .canvasBox, .comparisonWave__row",
      );
      if (!host) {
        return;
      }
      const overlay = document.createElement("div");
      overlay.className = "figureSelectionOverlay";
      const band = document.createElement("div");
      band.className = "figureSelection__band";
      overlay.append(band);
      host.append(overlay);
      down = { x: event.clientX, y: event.clientY, band, overlay };
      drawBand(band, down, down, axisMode(event));
      if (typeof canvas.setPointerCapture === "function") {
        canvas.setPointerCapture(event.pointerId);
      }
    };
    canvas.onpointermove = (event) => {
      if (!down) {
        return;
      }
      drawBand(
        down.band,
        { x: down.x, y: down.y },
        { x: event.clientX, y: event.clientY },
        axisMode(event),
      );
    };
    canvas.onpointerup = (event) => {
      if (!down) {
        return;
      }
      const { x: downX, y: downY, overlay } = down;
      const mode = axisMode(event);
      down = null;
      overlay.remove();
      const movedX = Math.abs(event.clientX - downX);
      const movedY = Math.abs(event.clientY - downY);
      const isClick = mode === "time" ? movedX < 4 : movedX < 4 && movedY < 4;
      if (isClick) {
        this.transport.seek(timeAt(event));
        return;
      }
      const patch: Partial<{
        start: number;
        end: number;
        minHz: number;
        maxHz: number;
      }> = {};
      if (mode !== "frequency") {
        const start = timeAt({
          clientX: Math.min(downX, event.clientX),
        } as MouseEvent);
        const end = timeAt({
          clientX: Math.max(downX, event.clientX),
        } as MouseEvent);
        if (end - start > 0.0001) {
          patch.start = start;
          patch.end = end;
        }
      }
      if (mode !== "time" && frequency) {
        const maxHz = frequencyAt({
          clientY: Math.min(downY, event.clientY),
        } as MouseEvent);
        const minHz = frequencyAt({
          clientY: Math.max(downY, event.clientY),
        } as MouseEvent);
        if (maxHz > minHz) {
          patch.minHz = minHz;
          patch.maxHz = maxHz;
        }
      }
      if (Object.keys(patch).length) {
        this.session.setView(patch);
      }
    };
    const cancelDrag = () => {
      down?.overlay.remove();
      down = null;
    };
    canvas.onpointercancel = cancelDrag;
    canvas.onlostpointercapture = cancelDrag;
    canvas.ondblclick = () => this.session.resetView();
  }

  private updateSelection(): void {
    const { start, end } = this.session.view,
      selected = this.session.selection;
    const left = Math.max(
      0,
      ((selected.start - start) / Math.max(0.001, end - start)) * 100,
    );
    const right = Math.min(
      100,
      ((selected.end - start) / Math.max(0.001, end - start)) * 100,
    );
    for (const band of this._root.querySelectorAll<HTMLElement>(
      ".comparisonSelection",
    )) {
      band.style.left = `${left}%`;
      band.style.width = `${Math.max(0, right - left)}%`;
    }
    const from = this.element<HTMLInputElement>("[data-start]"),
      to = this.element<HTMLInputElement>("[data-end]");
    if (from) {
      from.value = String(selected.start);
      to.value = String(selected.end);
    }
  }
  private async runMeasurement(residual: boolean): Promise<void> {
    if (this._measurementBusy || this._disposed) {
      return;
    }
    this._measurementBusy = true;
    // Snapshot inputs because replacing a file mutates its existing track object.
    const tracks = this.session.activeTracks.map((track) => ({
      id: track.id,
      name: track.name,
      revision: track.revision,
      buffer: track.buffer,
      gain: this.session.playbackGain(track.id),
    }));
    const selection = { ...this.session.selection };
    const reference = tracks.find(
      (track) => track.id === this.session.focus?.id,
    );
    const cancelled = () => {
      if (
        this._disposed ||
        this.session.selection.start !== selection.start ||
        this.session.selection.end !== selection.end ||
        (residual && this.session.focus?.id !== reference?.id)
      ) {
        return true;
      }
      const current = this.session.activeTracks;
      return (
        current.length !== tracks.length ||
        tracks.some(
          (track) =>
            !current.some(
              (item) =>
                item.id === track.id &&
                item.revision === track.revision &&
                item.buffer === track.buffer,
            ) ||
            (residual && this.session.playbackGain(track.id) !== track.gain),
        )
      );
    };
    try {
      if (tracks.length < 2 || (residual && !reference)) {
        return;
      }
      const range = commonMeasurementRange(
        tracks.map((t) => t.buffer),
        selection,
      );
      this.status(
        residual ? "Measuring residuals…" : "Measuring shared-region RMS…",
      );
      if (!residual) {
        const levels: number[] = [];
        for (const track of tracks) {
          levels.push(await measureRms(track.buffer, range, cancelled));
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (cancelled()) {
          throw new Error("Measurement cancelled: comparison changed");
        }
        const gains = matchingGains(levels);
        this.session.setPlaybackGains(
          new Map(tracks.map((track, i) => [track.id, gains[i]])),
        );
        this.status(
          `RMS matched over ${range.start.toFixed(2)}–${range.end.toFixed(2)} s · ${tracks.map((track, i) => `${track.name}: ${(20 * Math.log10(gains[i])).toFixed(2)} dB`).join(" · ")}`,
        );
      } else {
        const rows: string[][] = [];
        const db = (value: number) =>
          Number.isNaN(value)
            ? "n/a"
            : value === -Infinity
              ? "−∞"
              : value.toFixed(2);
        for (const track of tracks.filter((t) => t !== reference)) {
          if (track.buffer.sampleRate !== reference.buffer.sampleRate) {
            rows.push([track.name, "Different sample rate", "—", "—"]);
            continue;
          }
          const result = await measureResidual(
            reference.buffer,
            track.buffer,
            range,
            reference.gain,
            track.gain,
            cancelled,
          );
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          rows.push([
            track.name,
            db(result.rmsDbfs),
            db(result.peakDbfs),
            db(result.relativeDb),
          ]);
        }
        if (cancelled()) {
          throw new Error("Measurement cancelled: comparison changed");
        }
        this._measurementDialog?.remove();
        const dialog = document.createElement("dialog");
        this._measurementDialog = dialog;
        dialog.className = "earExportDialog comparisonResidualDialog";
        dialog.setAttribute("aria-label", "Residual measurements");
        const title = document.createElement("h3");
        title.textContent = `Residual vs ${reference.name}`;
        const hint = document.createElement("p");
        hint.textContent = `${range.start.toFixed(2)}–${range.end.toFixed(2)} s · current RMS matching gains · current session audio; apply Align separately to estimate a delay.`;
        const table = document.createElement("table");
        for (const [i, row] of [
          ["File", "RMS dBFS", "Peak dBFS", "Relative dB"],
          ...rows,
        ].entries()) {
          const tr = document.createElement("tr");
          for (const value of row) {
            const cell = document.createElement(i === 0 ? "th" : "td");
            cell.textContent = value;
            tr.append(cell);
          }
          table.append(tr);
        }
        const close = document.createElement("button");
        close.textContent = "Close";
        close.onclick = () => dialog.close();
        dialog.onclose = () => {
          dialog.remove();
          if (this._measurementDialog === dialog) {
            this._measurementDialog = null;
          }
        };
        dialog.append(title, hint, table, close);
        document.body.append(dialog);
        dialog.showModal();
        this.status("Residual measurements ready");
      }
    } catch (error) {
      if (!this._disposed) {
        this.status(String(error));
      }
    } finally {
      this._measurementBusy = false;
    }
  }
  private bindMenu(target: HTMLElement, stft: boolean): void {
    target.oncontextmenu = (event) => {
      const items: ContextMenuItem[] = [];
      if (stft) {
        for (const [layout, label] of [
          ["auto", "Automatic grid"],
          ["row", "Horizontal row"],
          ["column", "Vertical column"],
        ] as const) {
          items.push({
            label,
            checked: this.session.stftLayout === layout,
            action: () => {
              this.session.setStftLayout(layout as StftLayout);
            },
          });
        }
      } else if (this.session.pane === "live") {
        items.push({
          label: "Overlay",
          checked: true,
          action: () => undefined,
        });
      }
      const figure = stft
        ? this.element<HTMLElement>("[data-deck]")
        : target.closest<HTMLElement>(".comparisonFigure") ?? target;
      items.push({
        label: figure.classList.contains("comparisonFullscreen")
          ? "Exit fullscreen"
          : "Fullscreen",
        separator: items.length > 0,
        action: () => {
          figure.classList.toggle("comparisonFullscreen");
          if (stft) {
            this.renderFigures();
          } else if (this.session.pane === "live") {
            this._liveView?.resize();
          } else if (this.session.pane === "loudness") {
            this.drawProfiles();
          }
        },
      });
      items.push({
        label: "Reset view",
        action: () => this.session.resetView(),
      });
      if (this.session.activeTracks.length > 1) {
        items.push({
          label: "Match RMS levels (shared region)",
          separator: true,
          action: () => void this.runMeasurement(false),
        });
        items.push({
          label: "Measure residual vs focused file…",
          action: () => void this.runMeasurement(true),
        });
      }
      items.push({
        label: "Reset matching gains",
        action: () => this.session.setPlaybackGains(new Map()),
      });
      this._menu.open(event, items);
    };
  }
  private exitFullscreen(): void {
    const fullscreen = this._root.querySelectorAll(".comparisonFullscreen");
    fullscreen.forEach((el) => el.classList.remove("comparisonFullscreen"));
    this._menu.close();
    if (fullscreen.length) {
      this.renderFigures();
    }
  }
  private togglePlay(): void {
    if (this.transport.playing) {
      this.transport.pause();
    } else {
      void this.transport.play().catch((error) => this.status(String(error)));
    }
  }
  private tick = (): void => {
    if (this._disposed) {
      return;
    }
    this.transport.tick();
    const time = this.transport.position;
    const play = this.element<HTMLButtonElement>("[data-play]");
    play.textContent = this.transport.playing ? "Pause" : "Play";
    play.setAttribute(
      "aria-label",
      this.transport.playing ? "Pause comparison" : "Play comparison",
    );
    const seek = this.element<HTMLInputElement>("[data-seek]");
    seek.max = String(this.session.duration);
    seek.value = String(time);
    this.element("[data-time]").textContent =
      `/ ${this.session.duration.toFixed(2)} s`;
    const timeInput = this.element<HTMLInputElement>("[data-time-input]");
    timeInput.max = String(this.session.duration);
    if (document.activeElement !== timeInput) {
      timeInput.value = time.toFixed(2);
    }
    const progress =
      ((time - this.session.view.start) /
        Math.max(0.001, this.session.view.end - this.session.view.start)) *
      100;
    for (const line of this._root.querySelectorAll<HTMLElement>(
      ".comparisonPlayhead",
    )) {
      line.style.left = `${progress}%`;
      line.hidden = progress < 0 || progress > 100;
    }
    if (this.transport.playing) {
      void this.requestLive(time);
    }
    this.transport.meter.getFloatTimeDomainData(this._meterData);
    this.transport.meterRight.getFloatTimeDomainData(this._meterDataRight);
    let peakL = 0,
      peakR = 0;
    for (let i = 0; i < this._meterData.length; i++) {
      peakL = Math.max(peakL, Math.abs(this._meterData[i]));
      peakR = Math.max(peakR, Math.abs(this._meterDataRight[i]));
    }
    const peak = Math.max(peakL, peakR);
    for (const [key, value] of [
      ["left", peakL],
      ["right", peakR],
    ] as const) {
      const bar = this.element<HTMLElement>(`[data-meter-${key}]`);
      bar.style.width = `${Math.max(0, Math.min(100, ((20 * Math.log10(Math.max(1e-6, value)) + 60) / 60) * 100))}%`;
      bar.dataset.overload = String(value > 1);
    }
    const meter = this.element("[data-meter]");
    meter.textContent =
      peak > 1e-6
        ? `${(20 * Math.log10(peak)).toFixed(1)} dBFS${peak > 1 ? " · OVER" : ""}`
        : "−∞ dBFS";
    meter.dataset.overload = String(peak > 1);
    this._raf = requestAnimationFrame(this.tick);
  };
  public dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._alignment.dispose();
    cancelAnimationFrame(this._raf);
    this._analysis?.dispose();
    this.transport.removeEventListener("change", this._onTransportChange);
    this.transport.dispose();
    this._waveforms.dispose();
    this._monitor.dispose();
    this._measurementDialog?.remove();
    this._headphoneEq.dispose();
    this._liveView?.dispose();
    this._liveView = null;
    this._stft.clear();
    this._comparisonSettings.dispose();
    this._shortcuts.dispose();
    this._settingsOverlay.dispose();
    this._liveSettingsComponent?.dispose();
    this._liveSettingsAnalyze?.dispose();
    this._liveSettings?.dispose();
    this._liveSettings = null;
    this._menu.dispose();
    this._loudness.cancelProfiles();
    this._rpc.dispose();
    if (this._workerUrl) {
      URL.revokeObjectURL(this._workerUrl);
    }
    if (this._loudnessWorkerUrl) {
      URL.revokeObjectURL(this._loudnessWorkerUrl);
    }
    this._loader.dispose();
    for (const [requestId, resolve] of this._exportRequests) {
      resolve({ type: "compare.exported", requestId });
    }
    this._exportRequests.clear();
    this.session.removeEventListener("change", this._onSessionChange);
    window.removeEventListener("pagehide", this._onPageHide);
    window.removeEventListener("message", this._onMessage);
    document.removeEventListener("keydown", this._onKey);
    window.removeEventListener("resize", this._onResize);
  }
}
