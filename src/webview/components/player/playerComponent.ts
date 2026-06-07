import "./playerComponent.css";
import { EventType } from "../../events";
import Component from "../../component";
import PlayerService from "../../services/playerService";
import PlayerSettingsService from "../../services/playerSettingsService";

export interface PlayerComponentOptions {
  seekOnly?: boolean;
}

export default class PlayerComponent extends Component {
  private _componentRoot: HTMLElement;
  private _playerService: PlayerService;

  constructor(
    componentRootID: string,
    playerService: PlayerService,
    playerSettingsService: PlayerSettingsService,
    options: PlayerComponentOptions = {},
  ) {
    super();
    this._playerService = playerService;

    this._componentRoot = document.querySelector(componentRootID);

    const seekMarkup = `
      <div class="seekBarBox">
        <div class="progressTrack">
          <div class="progressFill" style="transform: scaleX(0); transform-origin: left center; width: 100%; height: 100%;"></div>
        </div>
        <input type="range" class="userInputSeekBar inputSeekBar" value="0" min="0" max="100" />
      </div>`;

    if (options.seekOnly) {
      this._componentRoot.innerHTML = `
      <div class="playerComponent playerComponent--seekOnly">
        ${seekMarkup}
      </div>
    `;
    } else {
      this._componentRoot.innerHTML = `
      <div class="playerComponent">
        ${seekMarkup}
      </div>
    `;
    }

    const userinputSeekbar = <HTMLInputElement>(
      this._componentRoot.querySelector(".userInputSeekBar")
    );
    this._addEventlistener(userinputSeekbar, EventType.INPUT, () => {
      if (!this._playerService.isPlaying) {
        this._playerService.previewSeekFromPercent(
          Number(userinputSeekbar.value),
        );
      }
    });
    this._addEventlistener(userinputSeekbar, EventType.CHANGE, () => {
      this._playerService.onSeekbarInput(Number(userinputSeekbar.value));
      userinputSeekbar.value = "100";
    });
    const progressFill = <HTMLElement>(
      this._componentRoot.querySelector(".progressFill")
    );
    this._addEventlistener(
      this._playerService,
      EventType.UPDATE_SEEKBAR,
      (e: CustomEventInit) => {
        const scale = Math.min(1, Math.max(0, e.detail.value / 100));
        progressFill.style.transform = `scaleX(${scale})`;
      },
    );

    void playerSettingsService;
  }

  public dispose() {
    if (this._playerService.isPlaying) {
      this._playerService.pause();
    }
    super.dispose();
  }
}
