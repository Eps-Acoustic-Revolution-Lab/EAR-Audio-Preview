import "./loudnessComponent.css";
import Component from "../../component";
import LoudnessService from "../../services/loudnessService";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import SequenceFeatureService from "../../services/sequenceFeatureService";
import LoudnessPane from "./loudnessPane";
import { EventType } from "../../events";

/**
 * Loudness workspace pane: compact inline chart + expandable fullscreen overlay.
 */
export default class LoudnessComponent extends Component {
  private _overlay: HTMLElement;
  private _inlinePane: LoudnessPane;

  constructor(
    containerEl: HTMLElement,
    loudnessService: LoudnessService,
    playerService: PlayerService,
    analyzeSettingsService: AnalyzeSettingsService,
    audioBuffer: AudioBuffer,
    sequenceFeatureService: SequenceFeatureService | null,
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

    this._inlinePane = this._register(
      new LoudnessPane(
        inlineMount,
        loudnessService,
        playerService,
        analyzeSettingsService,
        audioBuffer,
        "inline",
        undefined,
        sequenceFeatureService,
      ),
    ) as LoudnessPane;

    const overlayPane = this._register(
      new LoudnessPane(
        overlayMount,
        loudnessService,
        playerService,
        analyzeSettingsService,
        audioBuffer,
        "fullscreen",
        { onExitFullscreen: closeOverlay },
        sequenceFeatureService,
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

    this._addEventlistener(document, EventType.WORKSPACE_ACTIVE_PANE, ((
      ev: Event,
    ) => {
      const pane = (ev as CustomEvent<{ pane: string }>).detail?.pane;
      if (pane === "loudness") {
        requestAnimationFrame(() => this._inlinePane.scheduleRedraw());
      }
    }) as EventListener);
  }

  override dispose() {
    super.dispose();
  }
}
