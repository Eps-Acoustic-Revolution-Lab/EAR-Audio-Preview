import "../../styles/figure.css";
import Component from "../../component";
import { EventType } from "../../events";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import PlayerService from "../../services/playerService";
import WaveFormComponent from "../waveform/waveFormComponent";
import FigureInteractionComponent from "../figureInteraction/figureInteractionComponent";
import LoudnessService from "../../services/loudnessService";
import {
  encodeMidSideTimeDomain,
  type LiveMonitoringMode,
} from "../../utils/liveMonitoring";

function clampWaveformScale(v: number): number {
  return Math.min(
    AnalyzeSettingsService.WAVEFORM_CANVAS_VERTICAL_SCALE_MAX,
    Math.max(AnalyzeSettingsService.WAVEFORM_CANVAS_VERTICAL_SCALE_MIN, v),
  );
}

/** Full-width waveform row; always mounted after decode (no STFT / analyze). */
export default class WaveBandComponent extends Component {
  private _channelsRoot: HTMLElement;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _audioBuffer: AudioBuffer;
  private _playerService: PlayerService;
  private _analyzeService: AnalyzeService;
  private _loudnessService: LoudnessService | undefined;
  private _rootSelector: string;
  private _figures: FigureInteractionComponent[] = [];

  constructor(
    rootSelector: string,
    audioBuffer: AudioBuffer,
    analyzeSettingsService: AnalyzeSettingsService,
    playerService: PlayerService,
    analyzeService: AnalyzeService,
    loudnessService?: LoudnessService,
  ) {
    super();
    this._rootSelector = rootSelector;
    this._audioBuffer = audioBuffer;
    this._analyzeSettingsService = analyzeSettingsService;
    this._playerService = playerService;
    this._analyzeService = analyzeService;
    this._loudnessService = loudnessService;

    const root = document.querySelector(rootSelector) as HTMLElement;
    this._channelsRoot = root;

    const onWaveSetting = () => {
      this._rebuildChannels();
    };
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_MIN_TIME,
      onWaveSetting,
    );
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_MAX_TIME,
      onWaveSetting,
    );
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_MIN_AMPLITUDE,
      onWaveSetting,
    );
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_MAX_AMPLITUDE,
      onWaveSetting,
    );
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_WAVEFORM_VERTICAL_SCALE,
      onWaveSetting,
    );
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_MONITORING_MODE,
      onWaveSetting,
    );

    this._rebuildChannels();
    this._wireResizeHandle();
  }

  private _createMonoBuffer(data: Float32Array): AudioBuffer {
    const buffer = this._playerService.audioContext.createBuffer(
      1,
      data.length,
      this._audioBuffer.sampleRate,
    );
    buffer.copyToChannel(data, 0);
    return buffer;
  }

  private _displayChannels(): {
    data: Float32Array;
    audioBuffer: AudioBuffer;
    ch: number;
    numOfCh: number;
  }[] {
    const mode: LiveMonitoringMode =
      this._analyzeSettingsService.liveMonitoringMode;
    const channels = this._audioBuffer.numberOfChannels;
    if (mode === "lr" || mode === "swap" || channels < 2) {
      return Array.from({ length: channels }, (_, ch) => ({
        data: this._audioBuffer.getChannelData(ch),
        audioBuffer: this._audioBuffer,
        ch,
        numOfCh: channels,
      }));
    }
    if (mode === "l") {
      return [
        {
          data: this._audioBuffer.getChannelData(0),
          audioBuffer: this._audioBuffer,
          ch: 0,
          numOfCh: channels,
        },
      ];
    }
    if (mode === "r") {
      return [
        {
          data: this._audioBuffer.getChannelData(1),
          audioBuffer: this._audioBuffer,
          ch: 1,
          numOfCh: channels,
        },
      ];
    }

    const left = this._audioBuffer.getChannelData(0);
    const right = this._audioBuffer.getChannelData(1);
    const mid = new Float32Array(left.length);
    const side = new Float32Array(left.length);
    encodeMidSideTimeDomain(left, right, mid, side);
    const data = mode === "m" ? mid : side;
    return [
      { data, audioBuffer: this._createMonoBuffer(data), ch: 0, numOfCh: 1 },
    ];
  }

  private _rebuildChannels() {
    for (const f of this._figures) {
      f.dispose();
    }
    this._figures = [];
    this._channelsRoot.innerHTML = "";

    const settings = this._analyzeSettingsService.toProps();
    const displayChannels = this._displayChannels();
    displayChannels.forEach((entry, index) => {
      const boxClass = `js-waveBandCh${index}`;
      const box = document.createElement("div");
      box.className = `canvasBox waveBand__channel ${boxClass}`;
      this._channelsRoot.appendChild(box);

      new WaveFormComponent(
        `${this._rootSelector} .${boxClass}`,
        AnalyzeSettingsService.WAVEFORM_CANVAS_WIDTH,
        AnalyzeSettingsService.WAVEFORM_CANVAS_HEIGHT *
          this._analyzeSettingsService.waveformVerticalScale,
        settings,
        this._audioBuffer.sampleRate,
        entry.data,
        entry.ch,
        entry.numOfCh,
      );

      const fig = new FigureInteractionComponent(
        `${this._rootSelector} .${boxClass}`,
        true,
        this._playerService,
        this._analyzeService,
        this._analyzeSettingsService,
        entry.audioBuffer,
        entry.ch,
        this._loudnessService,
      );
      this._figures.push(fig);
    });
  }

  private _wireResizeHandle() {
    const band = this._channelsRoot.closest("#waveBand") as HTMLElement | null;
    const handle = band?.querySelector(
      ".waveBand__resizeHandle",
    ) as HTMLElement | null;
    if (!band || !handle) {
      return;
    }

    this._addEventlistener(handle, EventType.MOUSE_DOWN, (e: MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startScale = this._analyzeSettingsService.waveformVerticalScale;
      const move = (ev: MouseEvent) => {
        const dy = ev.clientY - startY;
        this._analyzeSettingsService.waveformVerticalScale = clampWaveformScale(
          startScale + dy * 0.006,
        );
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  public dispose() {
    for (const f of this._figures) {
      f.dispose();
    }
    this._figures = [];
    super.dispose();
  }
}
