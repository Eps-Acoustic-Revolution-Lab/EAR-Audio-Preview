import "./loudnessComponent.css";
import Component from "../../component";
import LoudnessService from "../../services/loudnessService";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import LoudnessPane from "./loudnessPane";

/**
 * Loudness workspace pane: compact inline chart + expandable fullscreen overlay.
 */
export default class LoudnessComponent extends Component {
  private _overlay: HTMLElement;

  constructor(
    containerEl: HTMLElement,
    loudnessService: LoudnessService,
    playerService: PlayerService,
    analyzeSettingsService: AnalyzeSettingsService,
    audioBuffer: AudioBuffer,
  ) {
    super();

    containerEl.innerHTML = `
      <div class="loudnessHost">
        <div class="loudnessHost__inline">
          <button type="button" class="loudnessHost__expandBtn" title="Expand">\u2197</button>
          <div class="js-loudnessInlineMount"></div>
        </div>
        <div class="loudnessHost__overlay hidden" role="presentation">
          <div class="js-loudnessOverlayMount"></div>
        </div>
      </div>`;

    const inlineMount = containerEl.querySelector(
      ".js-loudnessInlineMount",
    ) as HTMLElement;
    const overlayMount = containerEl.querySelector(
      ".js-loudnessOverlayMount",
    ) as HTMLElement;
    const expandBtn = containerEl.querySelector(
      ".loudnessHost__expandBtn",
    ) as HTMLButtonElement;
    this._overlay = containerEl.querySelector(
      ".loudnessHost__overlay",
    ) as HTMLElement;

    const closeOverlay = () => {
      this._overlay.classList.add("hidden");
    };

    this._register(
      new LoudnessPane(
        inlineMount,
        loudnessService,
        playerService,
        analyzeSettingsService,
        audioBuffer,
        "inline",
      ),
    );

    const overlayPane = this._register(
      new LoudnessPane(
        overlayMount,
        loudnessService,
        playerService,
        analyzeSettingsService,
        audioBuffer,
        "fullscreen",
        { onExitFullscreen: closeOverlay },
      ),
    );

    const openOverlay = () => {
      this._overlay.classList.remove("hidden");
      overlayPane.scheduleRedraw();
    };

    this._addEventlistener(expandBtn, "click", openOverlay);

    this._addEventlistener(this._overlay, "contextmenu", (ev: MouseEvent) => {
      ev.preventDefault();
      closeOverlay();
    });

    this._addEventlistener(document, "keydown", (e: KeyboardEvent) => {
      if (e.code === "Escape" && !this._overlay.classList.contains("hidden")) {
        closeOverlay();
      }
    });
  }

  override dispose() {
    super.dispose();
  }
}
