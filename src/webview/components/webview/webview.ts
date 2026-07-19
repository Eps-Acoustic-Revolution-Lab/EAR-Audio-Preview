import "./webview.css";
import "../liveMeters/liveMeters.css";
import { EventType } from "../../events";
import {
  ExtMessage,
  ExtMessageType,
  PostMessage,
  WebviewMessageType,
} from "../../../message";
import Component from "../../component";
import { Config } from "../../../config";
import { IAudioDecoder } from "../../decoders/audioDecoderInterface";
import PlayerService from "../../services/playerService";
import PlayerSettingsService from "../../services/playerSettingsService";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import InfoTableComponent from "../infoTable/infoTableComponent";
import MetaFabComponent from "../metaFab/metaFabComponent";
import TransportFabComponent from "../transportFab/transportFabComponent";
import SettingTab from "../settingTab/settingTabComponent";
import AnalyzerComponent from "../analyzer/analyzerComponent";
import LevelMeterComponent from "../liveMeters/levelMeterComponent";
import LiveAnalysisComponent from "../liveMeters/liveAnalysisComponent";
import WaveBandComponent from "../waveBand/waveBandComponent";
import LoudnessComponent from "../loudness/loudnessComponent";
import LoudnessService from "../../services/loudnessService";
import SequenceFeatureService from "../../services/sequenceFeatureService";
import EssentiaHostClient from "../../services/essentiaHostClient";
import AutoEqHostClient from "../../services/autoEqHostClient";
import EqPresetHostClient from "../../services/eqPresetHostClient";
import {
  bindAutoEqHost,
  unbindAutoEqHost,
} from "../../services/autoEqApiClient";
import { setLoudnessWorkletModuleUrl } from "../../utils/loudnessWorkletLoader";
import { setActiveWorkspacePane } from "../../workspacePane";
import { updateEarEqSlidingFocus } from "../../utils/earEqSlidingFocus";
import EditExportComponent from "../editExport/editExportComponent";
import EditExportSettingsService from "../../services/editExportSettingsService";
import EditListenService from "../../services/editListenService";
import SettingsOverlayComponent from "../settingsOverlay/settingsOverlayComponent";
import KeyboardShortcutsOverlayComponent from "../keyboardShortcuts/keyboardShortcutsOverlayComponent";
import HeadphoneEqSettingsService from "../../services/headphoneEqSettingsService";
import CurveCorrectionOverlayComponent from "../curveCorrection/curveCorrectionOverlayComponent";
import "../curveCorrection/curveCorrectionOverlayComponent.css";

type CreateAudioContext = (sampleRate: number) => AudioContext;
type CreateDecoder = (
  fileData: Uint8Array,
  ext: string,
) => Promise<IAudioDecoder>;

/** Ring geometry matches viewBox / circle `r` in webview template (px). */
const fabLoadRingRadiusPx = 23;
const fabLoadRingCircumference = 2 * Math.PI * fabLoadRingRadiusPx;
/** Portion of the ring reserved for file transfer into the webview (rest = decode + UI). */
const loadProgressReceiveShare = 0.38;

function updateWorkspaceTabFocus(): void {
  const strip = document.getElementById("workspaceStrip");
  const focus = strip?.querySelector(
    ".workspaceChrome__focus",
  ) as HTMLElement | null;
  if (!strip || !focus) {
    return;
  }
  updateEarEqSlidingFocus(strip, focus, ".workspacePane__tab--active");
}

export default class WebView extends Component {
  private _fileData: Uint8Array;

  private _postMessage: PostMessage;
  private _createAudioContext: CreateAudioContext;
  private _createDecoder: CreateDecoder;
  private _fileExt: string = "";

  private _config: Config;

  private _metaFab: MetaFabComponent | null = null;
  private _transportFab: TransportFabComponent | null = null;
  private _settingsFab: HTMLButtonElement | null = null;
  private _fabPercentEl: HTMLSpanElement | null = null;
  private _loadRingSvg: SVGSVGElement | null = null;
  private _loadRingBar: SVGCircleElement | null = null;
  private _decodeProgressRaf = 0;
  private _decodeProgressStartedAt = 0;
  private _visualLoadProgress = 0;
  private _reduceMotion = false;

  constructor(
    postMessage: PostMessage,
    createAudioContext: CreateAudioContext,
    createDecoder: CreateDecoder,
  ) {
    super();
    this._postMessage = postMessage;
    this._createAudioContext = createAudioContext;
    this._createDecoder = createDecoder;
    this._register({
      dispose: () => this._cancelDecodeProgressRaf(),
    });
    this.initWebview();
  }

  private initWebview() {
    this._isDisposed = false;
    this._fileData = undefined;

    this._addEventlistener(
      window,
      EventType.VSCODE_MESSAGE,
      (e: MessageEvent<ExtMessage>) => this.onReceiveMessage(e.data),
    );

    const root = document.getElementById("root");
    root.innerHTML = `
      <div id="stickyHeaderChrome" class="stickyHeaderChrome">
        <div class="workspaceChrome">
          <div
            id="workspaceStrip"
            class="workspaceChrome__tabs"
            role="tablist"
            aria-label="Visualization mode"
          >
            <div class="workspaceChrome__focus earEqSlidingFocus" aria-hidden="true"></div>
            <button
              type="button"
              class="workspacePane__tab js-paneSelect-stft"
              role="tab"
              aria-selected="false"
              aria-controls="deckStft"
              id="tabStft"
            >STFT</button>
            <button
              type="button"
              class="workspacePane__tab js-paneSelect-liveSpec"
              role="tab"
              aria-selected="false"
              aria-controls="deckLive"
              id="tabLiveSpec"
            >Live Spec</button>
            <button
              type="button"
              class="workspacePane__tab js-paneSelect-edit"
              role="tab"
              aria-selected="false"
              aria-controls="deckEdit"
              id="tabEdit"
            >Edit &amp; Export</button>
            <button
              type="button"
              class="workspacePane__tab js-paneSelect-loudness"
              role="tab"
              aria-selected="false"
              aria-controls="deckLoudness"
              id="tabLoudness"
            >Loudness</button>
          </div>
          <button
            type="button"
            class="workspaceChrome__meterToggle js-toggleLevelMeter"
            aria-pressed="false"
            aria-label="Toggle level meter"
            title="Level meter"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="4" y="10" width="4" height="10" rx="1"/>
              <rect x="10" y="4" width="4" height="16" rx="1"/>
              <rect x="16" y="13" width="4" height="7" rx="1"/>
            </svg>
          </button>
          <button
            type="button"
            class="workspaceChrome__settingsBtn js-openSettings"
            aria-label="Pane settings"
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-controls="settingsOverlay"
            title="Settings (⌘/)"
          >
            <svg class="workspaceChrome__settingsIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>
      <div id="mainVisualizer" class="mainVisualizer">
        <div class="mainVisualizer__vizColumn">
          <div id="waveBand" class="waveBand">
            <div class="waveBand__channels"></div>
            <div class="waveBand__resizeHandle" title="Drag to resize waveform height" aria-hidden="true"></div>
          </div>
          <div id="graphDeck" class="graphDeck">
            <div
              id="deckStft"
              class="graphDeck__pane graphDeck__pane--stft"
              role="tabpanel"
              aria-labelledby="tabStft"
              hidden
            >
              <div class="graphDeck__body">
                <div id="stftGraphMount" class="graphDeck__graph workspacePane__graph" hidden></div>
              </div>
            </div>
            <div
              id="deckLive"
              class="graphDeck__pane graphDeck__pane--live"
              role="tabpanel"
              aria-labelledby="tabLiveSpec"
              hidden
            >
              <div class="graphDeck__body">
                <div id="liveSpecGraphMount" class="graphDeck__graph workspacePane__graph" hidden></div>
              </div>
            </div>
            <div
              id="deckEdit"
              class="graphDeck__pane graphDeck__pane--edit"
              role="tabpanel"
              aria-labelledby="tabEdit"
              hidden
            >
              <div class="graphDeck__body">
                <div id="editGraphMount" class="graphDeck__graph workspacePane__graph" hidden></div>
              </div>
            </div>
            <div
              id="deckLoudness"
              class="graphDeck__pane graphDeck__pane--loudness"
              role="tabpanel"
              aria-labelledby="tabLoudness"
              hidden
            >
              <div class="graphDeck__body">
                <div id="loudnessGraphMount" class="graphDeck__graph workspacePane__graph" hidden></div>
              </div>
            </div>
          </div>
        </div>
        <div id="meterColumnResizeHandle" class="meterColumnResizeHandle" title="Drag to resize level meter width" aria-hidden="true"></div>
        <div id="liveMetersRight"></div>
      </div>
      <div id="settingsOverlayMount"></div>
      <div id="keyboardShortcutsOverlay"></div>
      <div id="curveCorrectionOverlayMount"></div>
      <div id="transportDock" class="transportDock"></div>
      <div id="settingsDock" class="settingsDock">
        <div id="metaPopoverMount"></div>
        <button
          type="button"
          class="settingsDock__fab js-settingsFab"
          id="settingsFab"
          aria-label="Audio info"
          aria-busy="false"
          disabled
          title="Loading audio…"
        >
          <svg
            class="settingsDock__fabRingSvg settingsDock__fabRingSvg--hidden"
            viewBox="0 0 52 52"
            width="52"
            height="52"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              class="settingsDock__fabRingTrack"
              cx="26"
              cy="26"
              r="${fabLoadRingRadiusPx}"
              fill="none"
              stroke-width="2"
            />
            <circle
              class="settingsDock__fabRingBar"
              cx="26"
              cy="26"
              r="${fabLoadRingRadiusPx}"
              fill="none"
              stroke-width="2.75"
              stroke-linecap="round"
              transform="rotate(-90 26 26)"
            />
          </svg>
          <span
            class="settingsDock__fabPercent js-settingsFabPercent"
            aria-hidden="true"
          >0%</span>
          <span class="settingsDock__fabIcon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">
              <line x1="4" y1="7" x2="20" y2="7"/>
              <line x1="4" y1="12" x2="16" y2="12"/>
              <line x1="4" y1="17" x2="12" y2="17"/>
            </svg>
          </span>
        </button>
      </div>
    `;

    this._postMessage({ type: WebviewMessageType.CONFIG });

    this._reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._settingsFab = document.getElementById(
      "settingsFab",
    ) as HTMLButtonElement | null;
    this._fabPercentEl = this._settingsFab?.querySelector(
      ".js-settingsFabPercent",
    ) as HTMLSpanElement | null;
    this._loadRingSvg = this._settingsFab?.querySelector(
      ".settingsDock__fabRingSvg",
    ) as SVGSVGElement | null;
    this._loadRingBar = this._loadRingSvg?.querySelector(
      ".settingsDock__fabRingBar",
    ) as SVGCircleElement | null;
    this._primeLoadRingGeometry();
    this._metaFab = new MetaFabComponent("#metaPopoverMount", "#settingsFab");
    this._disposables.push(this._metaFab);
    document.documentElement.dataset.workspacePane = "stft";
  }

  private _primeLoadRingGeometry() {
    if (!this._loadRingBar) {
      return;
    }
    this._loadRingBar.style.strokeDasharray = `${fabLoadRingCircumference}`;
    this._paintLoadRingProgress(0);
  }

  private _paintLoadRingProgress(unit: number) {
    if (!this._loadRingBar) {
      return;
    }
    const u = Math.max(0, Math.min(1, unit));
    this._loadRingBar.style.strokeDashoffset = `${fabLoadRingCircumference * (1 - u)}`;
    if (
      this._settingsFab?.classList.contains("settingsDock__fab--loading") &&
      this._fabPercentEl
    ) {
      const pct = Math.min(100, Math.max(0, Math.round(u * 100)));
      this._fabPercentEl.textContent = `${pct}%`;
    }
  }

  private _showLoadRing() {
    this._metaFab?.setLoading(true);
    this._transportFab?.setLoading(true);
    this._settingsFab?.classList.add("settingsDock__fab--loading");
    this._loadRingSvg?.classList.remove("settingsDock__fabRingSvg--hidden");
    this._settingsFab?.setAttribute("aria-busy", "true");
    this._settingsFab?.setAttribute("title", "Loading audio…");
    this._paintLoadRingProgress(this._visualLoadProgress);
  }

  private _setReceiveLoadProgress(end: number, whole: number) {
    if (whole <= 0) {
      return;
    }
    const ratio = Math.min(1, end / whole);
    this._visualLoadProgress = loadProgressReceiveShare * ratio;
    this._paintLoadRingProgress(this._visualLoadProgress);
    this._showLoadRing();
  }

  private _cancelDecodeProgressRaf() {
    if (this._decodeProgressRaf !== 0) {
      cancelAnimationFrame(this._decodeProgressRaf);
      this._decodeProgressRaf = 0;
    }
  }

  private _beginDecodePhaseProgress() {
    this._cancelDecodeProgressRaf();
    this._visualLoadProgress = Math.max(
      this._visualLoadProgress,
      loadProgressReceiveShare,
    );
    this._paintLoadRingProgress(this._visualLoadProgress);
    if (this._reduceMotion) {
      return;
    }
    this._decodeProgressStartedAt = performance.now();
    const tick = () => {
      const elapsed = performance.now() - this._decodeProgressStartedAt;
      const headroom = 1 - loadProgressReceiveShare - 0.03;
      const asymptote =
        loadProgressReceiveShare + headroom * (1 - Math.exp(-elapsed / 3200));
      const target = Math.min(asymptote, 0.97);
      this._visualLoadProgress += (target - this._visualLoadProgress) * 0.06;
      this._paintLoadRingProgress(this._visualLoadProgress);
      this._decodeProgressRaf = requestAnimationFrame(tick);
    };
    this._decodeProgressRaf = requestAnimationFrame(tick);
  }

  private _finishAndHideLoadRing(success: boolean) {
    this._cancelDecodeProgressRaf();
    this._paintLoadRingProgress(1);
    if (!this._settingsFab) {
      return;
    }
    this._settingsFab.setAttribute("aria-busy", "false");
    this._metaFab?.setLoading(false);
    this._transportFab?.setLoading(false);
    if (success) {
      this._settingsFab.disabled = false;
      this._settingsFab.setAttribute("title", "Audio file info");
      this._settingsFab.setAttribute("aria-label", "Audio file info");
    } else {
      this._settingsFab.disabled = true;
      this._settingsFab.setAttribute("title", "Could not load audio");
    }
    requestAnimationFrame(() => {
      this._settingsFab?.classList.remove("settingsDock__fab--loading");
    });
    window.setTimeout(() => {
      this._loadRingSvg?.classList.add("settingsDock__fabRingSvg--hidden");
      this._visualLoadProgress = 0;
      this._paintLoadRingProgress(0);
      if (this._fabPercentEl) {
        this._fabPercentEl.textContent = "0%";
      }
    }, 220);
  }

  private async onReceiveMessage(msg: ExtMessage) {
    switch (msg.type) {
      case ExtMessageType.CONFIG:
        if (ExtMessageType.isCONFIG(msg)) {
          this._config = msg.data;
          this._fileExt = msg.data.fileExt ?? "";
          if (msg.data.loudnessWorkletUri) {
            setLoudnessWorkletModuleUrl(msg.data.loudnessWorkletUri);
          }
          console.log(msg.data);
          this._postMessage({
            type: WebviewMessageType.DATA,
            data: { start: 0, end: 500000 },
          });
        }
        break;

      case ExtMessageType.DATA:
        if (ExtMessageType.isDATA(msg)) {
          // init fileData after receiving first data
          if (!this._fileData) {
            console.log("start receiving data");
            this._fileData = new Uint8Array(msg.data.wholeLength);
            this._visualLoadProgress = 0;
            this._primeLoadRingGeometry();
            this._showLoadRing();
          }

          // set fileData
          console.log(
            `received data: ${msg.data.start} ~ ${msg.data.end} / ${msg.data.wholeLength}`,
          );
          const samples = new Uint8Array(msg.data.samples);
          this._fileData.set(samples, msg.data.start);

          this._setReceiveLoadProgress(msg.data.end, msg.data.wholeLength);

          // request next data
          if (msg.data.end < msg.data.wholeLength) {
            this._postMessage({
              type: WebviewMessageType.DATA,
              data: { start: msg.data.end, end: msg.data.end + 3000000 },
            });
            break;
          }

          console.log("finish receiving data");
          this._setReceiveLoadProgress(
            msg.data.wholeLength,
            msg.data.wholeLength,
          );
          this._beginDecodePhaseProgress();
          try {
            await this.activateUI();
            this._finishAndHideLoadRing(true);
          } catch (err) {
            this._finishAndHideLoadRing(false);
            this._postMessage({
              type: WebviewMessageType.ERROR,
              data: { message: err.message },
            });
          }
        }
        break;

      case ExtMessageType.RELOAD: {
        this.dispose();
        this.initWebview();
        break;
      }

      case ExtMessageType.SEQUENCE_FEATURES:
        if (ExtMessageType.isSequenceFeatures(msg)) {
          SequenceFeatureService.handleExtensionResponse(msg);
        }
        break;

      case ExtMessageType.STFT_RESULT:
        if (ExtMessageType.isStftResult(msg)) {
          EssentiaHostClient.handleExtensionResponse(msg);
        }
        break;

      case ExtMessageType.AUTOEQ_RESULT:
        if (ExtMessageType.isAutoEqResult(msg)) {
          AutoEqHostClient.handleExtensionResponse(msg);
        }
        break;

      case ExtMessageType.EQ_PRESET_OP_RESULT:
        if (ExtMessageType.isEqPresetOpResult(msg)) {
          EqPresetHostClient.handleExtensionResponse(msg);
        }
        break;
    }
  }

  private async activateUI() {
    const decoder = await this._createDecoder(this._fileData, this._fileExt);

    // Phase 1: show header info immediately (fast path)
    console.log("read header info");
    decoder.readAudioInfo();
    const infoTableComponent = new InfoTableComponent(
      this._metaFab?.audioMetaSelector ?? "#audioMeta",
    );
    infoTableComponent.showInfo(
      decoder.numChannels,
      decoder.sampleRate,
      decoder.fileSize,
      decoder.format,
      decoder.encoding,
      decoder.bitDepth,
    );

    // decode audio data
    console.log("decode");
    decoder.decode();

    console.log("show other ui");
    infoTableComponent.showAdditionalInfo(decoder.duration);
    this._disposables.push(infoTableComponent);

    const audioContext = this._createAudioContext(decoder.sampleRate);
    const audioBuffer = audioContext.createBuffer(
      decoder.numChannels,
      decoder.length,
      decoder.sampleRate,
    );
    for (let ch = 0; ch < decoder.numChannels; ch++) {
      const d = Float32Array.from(decoder.samples[ch]);
      audioBuffer.copyToChannel(d, ch);
    }

    const playerSettingsService = PlayerSettingsService.fromDefaultSetting(
      this._config.playerDefault,
      audioBuffer,
    );

    const analyzeService = new AnalyzeService(audioBuffer);
    analyzeService.attachEssentiaHostClient(
      new EssentiaHostClient(this._postMessage),
    );
    const loudnessService = new LoudnessService(audioBuffer);
    const analyzeSettingsService = AnalyzeSettingsService.fromDefaultSetting(
      this._config.analyzeDefault,
      audioBuffer,
    );

    analyzeSettingsService.waveformVisible = true;
    analyzeSettingsService.showLiveAnalysis = false;

    const headphoneEqSettings = new HeadphoneEqSettingsService();
    headphoneEqSettings.loadPersisted(this._config.headphoneEq);
    this._disposables.push(headphoneEqSettings);

    const autoEqHostClient = new AutoEqHostClient(this._postMessage);
    bindAutoEqHost((req) => autoEqHostClient.request(req));
    this._register({
      dispose: () => {
        unbindAutoEqHost();
      },
    });

    const eqPresetHostClient = new EqPresetHostClient(this._postMessage);

    const curveCorrectionOverlay = new CurveCorrectionOverlayComponent(
      "#curveCorrectionOverlayMount",
      headphoneEqSettings,
      decoder.sampleRate,
      this._postMessage,
      eqPresetHostClient,
    );
    this._disposables.push(curveCorrectionOverlay);

    const playerService = new PlayerService(
      audioContext,
      audioBuffer,
      playerSettingsService,
      analyzeSettingsService,
      headphoneEqSettings,
    );
    this._disposables.push(playerService);

    const transportFab = new TransportFabComponent(
      "#transportDock",
      playerService,
      playerSettingsService,
      analyzeSettingsService,
      headphoneEqSettings,
      () => curveCorrectionOverlay.open(),
    );
    this._transportFab = transportFab;
    this._disposables.push(transportFab);

    const waveBandComponent = new WaveBandComponent(
      "#waveBand .waveBand__channels",
      audioBuffer,
      analyzeSettingsService,
      playerService,
      analyzeService,
      loudnessService,
    );
    this._disposables.push(waveBandComponent);

    let persistTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedPersist = () => {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        this._postMessage({
          type: WebviewMessageType.SAVE_ANALYZE_UI,
          data: analyzeSettingsService.toCachedDefaults(),
        });
      }, 500);
    };
    analyzeSettingsService.setPersistHook(debouncedPersist);
    this._register({
      dispose: () => {
        analyzeSettingsService.setPersistHook(undefined);
        clearTimeout(persistTimer);
      },
    });

    const settingsOverlay = new SettingsOverlayComponent(
      "#settingsOverlayMount",
    );
    const settingTabComponent = new SettingTab(
      "#settingTab",
      playerSettingsService,
      analyzeService,
      analyzeSettingsService,
    );
    const keyboardShortcutsOverlay = new KeyboardShortcutsOverlayComponent(
      "#keyboardShortcutsOverlay",
    );
    this._disposables.push(
      analyzeService,
      analyzeSettingsService,
      settingsOverlay,
      settingTabComponent,
      keyboardShortcutsOverlay,
    );

    // Wire level meter, monitoring bar, workspace panes (lazy STFT / Live).
    const mainVisualizer = document.getElementById(
      "mainVisualizer",
    ) as HTMLElement;
    const meterColumnResizeHandle = document.getElementById(
      "meterColumnResizeHandle",
    ) as HTMLElement;
    const liveMetersRight = document.getElementById(
      "liveMetersRight",
    ) as HTMLElement;

    const levelMeterComponent = new LevelMeterComponent(
      liveMetersRight,
      playerService,
      analyzeSettingsService,
    );
    this._disposables.push(levelMeterComponent);

    let meterColumnWidthPx = 112;
    const clampMeterColumnWidth = (width: number) =>
      Math.max(72, Math.min(220, width));
    const updateMeterColumn = () => {
      mainVisualizer.style.setProperty(
        "--meter-col-width",
        analyzeSettingsService.showLevelMeter
          ? `${meterColumnWidthPx}px`
          : "0px",
      );
      if (meterColumnResizeHandle) {
        meterColumnResizeHandle.hidden = !analyzeSettingsService.showLevelMeter;
      }
    };
    const meterToggleBtn = document.querySelector(
      ".js-toggleLevelMeter",
    ) as HTMLButtonElement;
    const syncMeterToggle = () => {
      const on = analyzeSettingsService.showLevelMeter;
      meterToggleBtn.classList.toggle("workspaceChrome__meterToggle--on", on);
      meterToggleBtn.setAttribute("aria-pressed", String(on));
    };
    this._addEventlistener(meterToggleBtn, EventType.CLICK, () => {
      analyzeSettingsService.showLevelMeter =
        !analyzeSettingsService.showLevelMeter;
    });
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_SHOW_LEVEL_METER,
      syncMeterToggle,
    );
    syncMeterToggle();

    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_SHOW_LEVEL_METER,
      updateMeterColumn,
    );
    updateMeterColumn();

    /* Mousemove arrives faster than the refresh rate; coalesce column-width
       updates so the flex re-layout runs at most once per frame. */
    let meterColumnRaf = 0;
    const scheduleMeterColumnUpdate = () => {
      if (meterColumnRaf) {
        return;
      }
      meterColumnRaf = requestAnimationFrame(() => {
        meterColumnRaf = 0;
        updateMeterColumn();
      });
    };
    const flushMeterColumnUpdate = () => {
      if (meterColumnRaf) {
        cancelAnimationFrame(meterColumnRaf);
        meterColumnRaf = 0;
      }
      updateMeterColumn();
    };

    this._addEventlistener(
      meterColumnResizeHandle,
      EventType.MOUSE_DOWN,
      (e: MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = meterColumnWidthPx;
        const move = (ev: MouseEvent) => {
          meterColumnWidthPx = clampMeterColumnWidth(
            startWidth + (startX - ev.clientX),
          );
          scheduleMeterColumnUpdate();
        };
        const up = () => {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          flushMeterColumnUpdate();
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      },
    );

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => updateMeterColumn());
      resizeObserver.observe(mainVisualizer);
      this._register({ dispose: () => resizeObserver.disconnect() });
    }

    let stftAnalyzer: AnalyzerComponent | undefined;
    const stftGraphMount = document.getElementById(
      "stftGraphMount",
    ) as HTMLElement | null;
    const ensureStftMounted = async () => {
      if (stftAnalyzer || !stftGraphMount) {
        return;
      }
      stftGraphMount.removeAttribute("hidden");
      analyzeSettingsService.spectrogramVisible = true;
      stftAnalyzer = new AnalyzerComponent(
        "#stftGraphMount",
        audioBuffer,
        analyzeService,
        analyzeSettingsService,
        playerService,
        loudnessService,
      );
      this._disposables.push(stftAnalyzer);
    };

    let liveAnalysisComponent: LiveAnalysisComponent | undefined;
    const liveSpecGraphMount = document.getElementById(
      "liveSpecGraphMount",
    ) as HTMLElement | null;
    const ensureLiveMounted = () => {
      if (liveAnalysisComponent || !liveSpecGraphMount) {
        return;
      }
      analyzeSettingsService.showLiveAnalysis = true;
      liveSpecGraphMount.removeAttribute("hidden");
      liveAnalysisComponent = new LiveAnalysisComponent(
        liveSpecGraphMount,
        playerService,
        analyzeSettingsService,
      );
      this._disposables.push(liveAnalysisComponent);
      updateMeterColumn();
    };

    let loudnessComponent: LoudnessComponent | undefined;
    const loudnessGraphMount = document.getElementById(
      "loudnessGraphMount",
    ) as HTMLElement | null;
    const ensureLoudnessMounted = async () => {
      if (loudnessComponent || !loudnessGraphMount) {
        return;
      }
      const sequenceFeatureService = new SequenceFeatureService(
        audioBuffer,
        this._postMessage,
      );
      this._disposables.push(sequenceFeatureService);
      loudnessGraphMount.removeAttribute("hidden");
      loudnessComponent = new LoudnessComponent(
        loudnessGraphMount,
        loudnessService,
        playerService,
        analyzeSettingsService,
        audioBuffer,
        sequenceFeatureService,
      );
      this._disposables.push(loudnessComponent);
    };

    const editExportSettingsService =
      EditExportSettingsService.create(audioBuffer);
    const editListenService = new EditListenService(
      audioBuffer,
      editExportSettingsService,
      playerSettingsService,
      analyzeSettingsService,
      playerService,
    );
    this._disposables.push(editListenService);
    let editExportComponent: EditExportComponent | undefined;
    const editGraphMount = document.getElementById(
      "editGraphMount",
    ) as HTMLElement | null;
    const ensureEditMounted = () => {
      if (editExportComponent || !editGraphMount) {
        return;
      }
      editGraphMount.removeAttribute("hidden");
      editExportComponent = new EditExportComponent(
        "#editGraphMount",
        audioBuffer,
        editExportSettingsService,
        editListenService,
        playerSettingsService,
        analyzeSettingsService,
        playerService,
        this._postMessage,
      );
      this._disposables.push(editExportComponent);
    };

    const wirePaneSelect = (
      sel: string,
      pane: "stft" | "liveSpec" | "edit" | "loudness",
      onSelect?: () => void | Promise<void>,
    ) => {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      if (!btn) {
        return;
      }
      this._addEventlistener(btn, EventType.CLICK, () => {
        void (async () => {
          setActiveWorkspacePane(pane);
          await onSelect?.();
        })();
      });
    };
    wirePaneSelect(".js-paneSelect-stft", "stft", ensureStftMounted);
    wirePaneSelect(".js-paneSelect-liveSpec", "liveSpec", ensureLiveMounted);
    wirePaneSelect(".js-paneSelect-edit", "edit", ensureEditMounted);
    wirePaneSelect(
      ".js-paneSelect-loudness",
      "loudness",
      ensureLoudnessMounted,
    );

    this._addEventlistener(document, EventType.WORKSPACE_ACTIVE_PANE, ((
      ev: Event,
    ) => {
      const e = ev as CustomEvent<{ pane: string }>;
      const p = e.detail?.pane;
      for (const el of document.querySelectorAll<HTMLElement>(
        ".workspacePane__tab--active",
      )) {
        el.classList.remove("workspacePane__tab--active");
      }
      const stftDeck = document.getElementById("deckStft");
      const liveDeck = document.getElementById("deckLive");
      const editDeck = document.getElementById("deckEdit");
      const loudnessDeck = document.getElementById("deckLoudness");
      if (p === "none" || !p) {
        if (stftDeck && liveDeck && editDeck && loudnessDeck) {
          stftDeck.setAttribute("hidden", "");
          liveDeck.setAttribute("hidden", "");
          editDeck.setAttribute("hidden", "");
          loudnessDeck.setAttribute("hidden", "");
        }
        document
          .getElementById("tabStft")
          ?.setAttribute("aria-selected", "false");
        document
          .getElementById("tabLiveSpec")
          ?.setAttribute("aria-selected", "false");
        document
          .getElementById("tabEdit")
          ?.setAttribute("aria-selected", "false");
        document
          .getElementById("tabLoudness")
          ?.setAttribute("aria-selected", "false");
        requestAnimationFrame(updateWorkspaceTabFocus);
        return;
      }
      const map: Record<string, string> = {
        stft: ".js-paneSelect-stft",
        liveSpec: ".js-paneSelect-liveSpec",
        edit: ".js-paneSelect-edit",
        loudness: ".js-paneSelect-loudness",
      };
      const hit = map[p];
      if (hit) {
        document
          .querySelector(hit)
          ?.classList.add("workspacePane__tab--active");
      }
      if (
        p === "stft" ||
        p === "liveSpec" ||
        p === "edit" ||
        p === "loudness"
      ) {
        if (stftDeck && liveDeck && editDeck && loudnessDeck) {
          stftDeck.toggleAttribute("hidden", p !== "stft");
          liveDeck.toggleAttribute("hidden", p !== "liveSpec");
          editDeck.toggleAttribute("hidden", p !== "edit");
          loudnessDeck.toggleAttribute("hidden", p !== "loudness");
        }
        const tabSel: Record<string, [string, string, string, string]> = {
          stft: ["true", "false", "false", "false"],
          liveSpec: ["false", "true", "false", "false"],
          edit: ["false", "false", "true", "false"],
          loudness: ["false", "false", "false", "true"],
        };
        const tri = tabSel[p];
        document
          .getElementById("tabStft")
          ?.setAttribute("aria-selected", tri[0]);
        document
          .getElementById("tabLiveSpec")
          ?.setAttribute("aria-selected", tri[1]);
        document
          .getElementById("tabEdit")
          ?.setAttribute("aria-selected", tri[2]);
        document
          .getElementById("tabLoudness")
          ?.setAttribute("aria-selected", tri[3]);
      }
      if (p === "edit") {
        void ensureEditMounted();
        editListenService.enter();
      } else {
        editListenService.leave();
      }
      requestAnimationFrame(updateWorkspaceTabFocus);
    }) as EventListener);

    this._addEventlistener(window, "resize", () => {
      requestAnimationFrame(updateWorkspaceTabFocus);
    });

    setActiveWorkspacePane("none");

    decoder.dispose();
  }
}
