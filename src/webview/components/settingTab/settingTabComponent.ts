import "./settingTabComponent.css";
import Component from "../../component";
import { EventType } from "../../events";
import PlayerSettingsService from "../../services/playerSettingsService";
import PlayerSettingsComponent from "../playerSettings/playerSettingsComponent";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import AnalyzeSettingsComponent from "../analyzeSettings/analyzeSettingsComponent";
import { getActiveWorkspacePane } from "../../workspacePane";

export default class SettingTab extends Component {
  private _componentRoot: HTMLElement;

  constructor(
    coponentRootSelector: string,
    playerSettingsService: PlayerSettingsService,
    analyzeService: AnalyzeService,
    analyzeSettingsService: AnalyzeSettingsService,
  ) {
    super();

    this._componentRoot = document.querySelector(coponentRootSelector);

    this._componentRoot.innerHTML = `
      <div class="settingTab">
        <div class="settingTab__scroll">
          <div class="js-settingTabContent-analyze"></div>
          <div class="settingTab__playbackSection js-settingTabContent-player"></div>
        </div>
        <footer class="settingTab__footer js-settingTabFooter">
          <button
            type="button"
            class="settingTab__saveSpectrogram panelAction js-saveSpectrogram"
            title="Redraw spectrogram with current analysis settings"
          >
            Save
          </button>
        </footer>
      </div>
    `;

    new PlayerSettingsComponent(
      `${coponentRootSelector} .js-settingTabContent-player`,
      playerSettingsService,
      analyzeService,
      analyzeSettingsService,
    );
    new AnalyzeSettingsComponent(
      `${coponentRootSelector} .js-settingTabContent-analyze`,
      analyzeService,
      analyzeSettingsService,
    );

    const saveSpectrogramBtn = this._componentRoot.querySelector(
      ".js-saveSpectrogram",
    ) as HTMLButtonElement | null;
    if (saveSpectrogramBtn) {
      this._addEventlistener(saveSpectrogramBtn, EventType.CLICK, () => {
        analyzeService.analyze();
      });
    }

    this._syncFooterVisibility();
    this._addEventlistener(document, EventType.WORKSPACE_ACTIVE_PANE, () => {
      this._syncFooterVisibility();
    });
  }

  private _syncFooterVisibility(): void {
    const footer = this._componentRoot.querySelector(
      ".js-settingTabFooter",
    ) as HTMLElement | null;
    if (!footer) {
      return;
    }
    if (getActiveWorkspacePane() === "stft") {
      footer.removeAttribute("hidden");
    } else {
      footer.setAttribute("hidden", "");
    }
  }
}
