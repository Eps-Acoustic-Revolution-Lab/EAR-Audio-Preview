import "./settingTabComponent.css";
import Component from "../../component";
import { EventType } from "../../events";
import PlayerSettingsService from "../../services/playerSettingsService";
import PlayerSettingsComponent from "../playerSettings/playerSettingsComponent";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import AnalyzeSettingsComponent from "../analyzeSettings/analyzeSettingsComponent";
import EasyCutComponent from "../easyCut/easyCutComponent";
import { PostMessage } from "../../../message";

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default class SettingTab extends Component {
  private _componentRoot: HTMLElement;
  private _dockOpen = false;

  constructor(
    coponentRootSelector: string,
    playerSettingsService: PlayerSettingsService,
    analyzeService: AnalyzeService,
    analyzeSettingsService: AnalyzeSettingsService,
    audioBuffer: AudioBuffer,
    postMessage: PostMessage,
  ) {
    super();

    this._componentRoot = document.querySelector(coponentRootSelector);

    this._componentRoot.innerHTML = `
      <div class="settingTab">
        <div class="settingTab__body">
          <div class="settingTab__menu" role="tablist" aria-orientation="vertical" aria-label="Setting sections">
            <button type="button" class="settingTab__button settingTab__button--active js-settingTabButton-options">Options</button>
            <button type="button" class="settingTab__button js-settingTabButton-player">player</button>
            <button type="button" class="settingTab__button js-settingTabButton-easyCut">easyCut</button>
          </div>
          <div class="settingTab__content">
            <div class="js-settingTabContent-analyze"></div>
            <div class="js-settingTabContent-player"></div>
            <div class="js-settingTabContent-easyCut"></div>
          </div>
        </div>
        <div class="settingTab__footer">
          <button
            type="button"
            class="settingTab__saveSpectrogram js-saveSpectrogram"
            title="Redraw spectrogram with current analysis settings"
          >
            Save
          </button>
        </div>
      </div>
    `;

    this.hideAllContent();
    const analyzeContent = this._componentRoot.querySelector(
      ".js-settingTabContent-analyze",
    ) as HTMLElement;
    analyzeContent.style.display = "block";
    const optionsBtn = this._componentRoot.querySelector(
      ".js-settingTabButton-options",
    ) as HTMLButtonElement;
    optionsBtn.classList.add("settingTab__button--active");

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
    new EasyCutComponent(
      `${coponentRootSelector} .js-settingTabContent-easyCut`,
      audioBuffer,
      analyzeSettingsService,
      postMessage,
    );

    const saveSpectrogramBtn = this._componentRoot.querySelector(
      ".js-saveSpectrogram",
    ) as HTMLButtonElement | null;
    if (saveSpectrogramBtn) {
      this._addEventlistener(saveSpectrogramBtn, EventType.CLICK, () => {
        analyzeService.analyze();
      });
    }

    const optionsTabButton = this._componentRoot.querySelector(
      ".js-settingTabButton-options",
    ) as HTMLButtonElement;
    this._addEventlistener(optionsTabButton, EventType.CLICK, () => {
      this.hideAllContent();
      this.resetActivebutton();
      analyzeContent.style.display = "block";
      optionsTabButton.classList.add("settingTab__button--active");
    });

    const playerTabButton = this._componentRoot.querySelector(
      ".js-settingTabButton-player",
    ) as HTMLButtonElement;
    this._addEventlistener(playerTabButton, EventType.CLICK, () => {
      this.hideAllContent();
      this.resetActivebutton();
      const playerTabContent = this._componentRoot.querySelector(
        ".js-settingTabContent-player",
      ) as HTMLElement;
      playerTabContent.style.display = "block";
      playerTabButton.classList.add("settingTab__button--active");
    });

    const easyCutTabButton = this._componentRoot.querySelector(
      ".js-settingTabButton-easyCut",
    ) as HTMLButtonElement;
    this._addEventlistener(easyCutTabButton, EventType.CLICK, () => {
      this.hideAllContent();
      this.resetActivebutton();
      const easyCutTabContent = this._componentRoot.querySelector(
        ".js-settingTabContent-easyCut",
      ) as HTMLElement;
      easyCutTabContent.style.display = "block";
      easyCutTabButton.classList.add("settingTab__button--active");
    });

    this._initSettingsDock();
  }

  private _initSettingsDock() {
    const dock = this._componentRoot.closest("#settingsDock");
    if (!dock) {
      return;
    }

    const fab = dock.querySelector(
      ".js-settingsFab",
    ) as HTMLButtonElement | null;
    const backdrop = dock.querySelector(
      ".js-settingsBackdrop",
    ) as HTMLElement | null;
    const sheet = dock.querySelector(".js-settingsSheet") as HTMLElement | null;
    if (!fab || !backdrop || !sheet) {
      return;
    }

    sheet.classList.add("settingsDock__sheet--animating");

    const closeSheet = () => {
      if (!this._dockOpen) {
        return;
      }
      this._dockOpen = false;
      fab.setAttribute("aria-expanded", "false");
      sheet.classList.remove("settingsDock__sheet--open");
      backdrop.setAttribute("hidden", "");
      sheet.setAttribute("hidden", "");
      fab.focus();
    };

    const openSheet = () => {
      if (this._dockOpen) {
        return;
      }
      this._dockOpen = true;
      fab.setAttribute("aria-expanded", "true");
      backdrop.removeAttribute("hidden");
      sheet.removeAttribute("hidden");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sheet.classList.add("settingsDock__sheet--open");
        });
      });
      const firstFocus = sheet.querySelector<HTMLElement>(focusableSelector);
      firstFocus?.focus();
    };

    const toggleSheet = () => {
      if (this._dockOpen) {
        closeSheet();
      } else {
        openSheet();
      }
    };

    this._addEventlistener(fab, EventType.CLICK, toggleSheet);
    this._addEventlistener(backdrop, EventType.CLICK, closeSheet);

    this._addEventlistener(document, EventType.KEY_DOWN, (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !this._dockOpen) {
        return;
      }
      e.preventDefault();
      closeSheet();
    });

    this._addEventlistener(sheet, EventType.KEY_DOWN, (e: KeyboardEvent) => {
      if (!this._dockOpen || e.key !== "Tab") {
        return;
      }
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  private resetActivebutton() {
    const activeButton = this._componentRoot.querySelector(
      ".settingTab__button--active",
    ) as HTMLButtonElement | null;
    activeButton?.classList.remove("settingTab__button--active");
  }

  private hideAllContent() {
    const content = this._componentRoot.querySelector(
      ".settingTab__content",
    ) as HTMLElement;
    for (const c of content.children) {
      (c as HTMLElement).style.display = "none";
    }
  }
}
