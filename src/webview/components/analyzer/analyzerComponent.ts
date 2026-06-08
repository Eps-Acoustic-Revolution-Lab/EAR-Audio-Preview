import "./analyzerComponent.css";
import { EventType } from "../../events";
import Component from "../../component";
import PlayerService from "../../services/playerService";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService, {
  FftBackend,
} from "../../services/analyzeSettingsService";
import SpectrogramComponent from "../spectrogram/spectrogramComponent";
import FigureInteractionComponent from "../figureInteraction/figureInteractionComponent";
import LoudnessService from "../../services/loudnessService";
import {
  encodeMidSideTimeDomain,
  type LiveMonitoringMode,
} from "../../utils/liveMonitoring";

type DisplayAnalyzeChannel = {
  analyzeService: AnalyzeService;
  audioBuffer: AudioBuffer;
  ch: number;
  numOfCh: number;
};

export default class AnalyzerComponent extends Component {
  private _componentRootSelector: string;
  private _componentRoot: HTMLElement;

  private _audioBuffer: AudioBuffer;
  private _analyzeService: AnalyzeService;
  private _analyzeSettingsService: AnalyzeSettingsService;
  private _playerService: PlayerService;
  private _loudnessService: LoudnessService | undefined;

  /** Mid/side path uses a dedicated buffer + {@link AnalyzeService}; released on re-render and dispose. */
  private _midSideDerived:
    | { analyzeService: AnalyzeService; audioBuffer: AudioBuffer }
    | undefined;

  private _analyzeResultBox: HTMLElement;

  constructor(
    componentRootSelector: string,
    audioBuffer: AudioBuffer,
    analyzeService: AnalyzeService,
    analyzeSettingsService: AnalyzeSettingsService,
    playerService: PlayerService,
    loudnessService?: LoudnessService,
  ) {
    super();
    this._audioBuffer = audioBuffer;
    this._analyzeService = analyzeService;
    this._analyzeSettingsService = analyzeSettingsService;
    this._playerService = playerService;
    this._loudnessService = loudnessService;

    this._componentRootSelector = componentRootSelector;
    this._componentRoot = document.querySelector(this._componentRootSelector);
    this._componentRoot.innerHTML = `
      <div class="analyzerComponent">
        <div class="analyzeResultBox"></div>
      </div>
    `;

    this._analyzeResultBox =
      this._componentRoot.querySelector(".analyzeResultBox");
    this._analyzeResultBox.style.display = "block";

    this._addEventlistener(this._analyzeService, EventType.ANALYZE, () => {
      void this.renderAnalyzeResult();
    });
    this._addEventlistener(
      this._analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_MONITORING_MODE,
      () => void this.renderAnalyzeResult(),
    );

    this._analyzeService.analyze();
  }

  public dispose(): void {
    this._disposeMidSideDerived();
    super.dispose();
  }

  private _disposeMidSideDerived(): void {
    if (!this._midSideDerived) {
      return;
    }
    this._midSideDerived.analyzeService.dispose();
    this._midSideDerived = undefined;
  }

  private clearAnalyzeResult() {
    for (const c of Array.from(this._analyzeResultBox.children)) {
      this._analyzeResultBox.removeChild(c);
    }
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

  private _displayChannels(): DisplayAnalyzeChannel[] {
    const mode: LiveMonitoringMode =
      this._analyzeSettingsService.liveMonitoringMode;
    const channels = this._audioBuffer.numberOfChannels;
    if (mode === "lr" || mode === "swap" || channels < 2) {
      return Array.from({ length: channels }, (_, ch) => ({
        analyzeService: this._analyzeService,
        audioBuffer: this._audioBuffer,
        ch,
        numOfCh: channels,
      }));
    }
    if (mode === "l" || mode === "r") {
      return [
        {
          analyzeService: this._analyzeService,
          audioBuffer: this._audioBuffer,
          ch: mode === "l" ? 0 : 1,
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
    const audioBuffer = this._createMonoBuffer(data);
    const analyzeService = new AnalyzeService(audioBuffer);
    this._analyzeService.shareHostClientWith(analyzeService);
    this._midSideDerived = { analyzeService, audioBuffer };
    return [{ analyzeService, audioBuffer, ch: 0, numOfCh: 1 }];
  }

  private async renderAnalyzeResult() {
    this.clearAnalyzeResult();
    this._disposeMidSideDerived();

    const settings = this._analyzeSettingsService.toProps();
    const displayChannels = this._displayChannels();

    if (settings.fftBackend === FftBackend.Essentia) {
      await Promise.all(
        displayChannels.map((entry) =>
          entry.analyzeService.ensureHostStftReady(entry.ch, settings),
        ),
      );
    }

    displayChannels.forEach((entry, index) => {
      if (this._analyzeSettingsService.spectrogramVisible) {
        const canvasBox = document.createElement("div");
        const canvasBoxClass = `js-canvasBoxSpectrogram${index}`;
        canvasBox.classList.add("canvasBox", canvasBoxClass);
        this._analyzeResultBox.appendChild(canvasBox);

        new SpectrogramComponent(
          `${this._componentRootSelector} .analyzeResultBox .${canvasBoxClass}`,
          AnalyzeSettingsService.spectrogramRenderWidth(
            this._analyzeSettingsService.highResolutionSpectrogram,
          ),
          AnalyzeSettingsService.spectrogramRenderHeightBase(
            this._analyzeSettingsService.highResolutionSpectrogram,
          ) * this._analyzeSettingsService.spectrogramVerticalScale,
          entry.analyzeService,
          settings,
          entry.audioBuffer.sampleRate,
          entry.ch,
          entry.numOfCh,
        );

        new FigureInteractionComponent(
          `${this._componentRootSelector} .analyzeResultBox .${canvasBoxClass}`,
          false,
          this._playerService,
          entry.analyzeService,
          this._analyzeSettingsService,
          entry.audioBuffer,
          entry.ch,
          this._loudnessService,
        );
      }
    });
  }
}
