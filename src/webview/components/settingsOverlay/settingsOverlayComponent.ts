import "./settingsOverlayComponent.css";
import Component from "../../component";
import { EventType } from "../../events";
import {
  getActiveWorkspacePane,
  type WorkspacePaneId,
} from "../../workspacePane";

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PANE_SETTINGS_TITLES: Record<WorkspacePaneId, string> = {
  none: "Settings",
  stft: "STFT Settings",
  liveSpec: "Live Spectrum Settings",
  edit: "Edit & Export",
  loudness: "Loudness",
};

export default class SettingsOverlayComponent extends Component {
  private _overlay: HTMLElement;
  private _dialog: HTMLElement;
  private _gearBtn: HTMLButtonElement | null;
  private _isOpen = false;

  constructor(selector: string) {
    super();

    const root = document.querySelector(selector);
    if (!root) {
      throw new Error(`Element not found: ${selector}`);
    }

    root.innerHTML = `
      <div class="settingsOverlay settingsOverlay--animating" id="settingsOverlay" hidden role="presentation">
        <div class="settingsOverlay__backdrop js-settingsBackdrop"></div>
        <div
          class="settingsOverlay__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settingsOverlayTitle"
        >
          <header class="settingsOverlay__header">
            <h2 id="settingsOverlayTitle" class="settingsOverlay__title">Settings</h2>
            <button
              type="button"
              class="settingsOverlay__close js-settingsClose"
              aria-label="Close settings"
            >×</button>
          </header>
          <div class="settingsOverlay__body">
            <div id="settingTab"></div>
          </div>
        </div>
      </div>
    `;

    this._overlay = root.querySelector(".settingsOverlay") as HTMLElement;
    this._dialog = root.querySelector(".settingsOverlay__dialog") as HTMLElement;
    this._gearBtn = document.querySelector(
      ".js-openSettings",
    ) as HTMLButtonElement | null;

    this._syncTitle();
    this._initEventListeners();
  }

  private _syncTitle(): void {
    const titleEl = document.getElementById("settingsOverlayTitle");
    if (!titleEl) {
      return;
    }
    const pane = getActiveWorkspacePane();
    titleEl.textContent = PANE_SETTINGS_TITLES[pane] ?? PANE_SETTINGS_TITLES.none;
  }

  private _focusGearButton(): void {
    this._gearBtn?.focus();
  }

  private _close(): void {
    if (!this._isOpen) {
      return;
    }
    this._isOpen = false;
    this._overlay.classList.remove("settingsOverlay--open");
    this._overlay.setAttribute("hidden", "");
    this._gearBtn?.setAttribute("aria-expanded", "false");
    this._focusGearButton();
  }

  private _open(): void {
    if (this._isOpen) {
      return;
    }
    this._isOpen = true;
    this._syncTitle();
    this._overlay.removeAttribute("hidden");
    this._gearBtn?.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      this._overlay.classList.add("settingsOverlay--open");
    });
    const firstFocus = this._dialog.querySelector<HTMLElement>(focusableSelector);
    firstFocus?.focus();
  }

  private _toggle(): void {
    if (this._isOpen) {
      this._close();
    } else {
      this._open();
    }
  }

  private _initEventListeners(): void {
    const backdrop = this._overlay.querySelector(".js-settingsBackdrop");
    const closeBtn = this._overlay.querySelector(".js-settingsClose");

    if (this._gearBtn) {
      this._addEventlistener(this._gearBtn, EventType.CLICK, () => {
        this._toggle();
      });
    }

    if (backdrop) {
      this._addEventlistener(backdrop, EventType.CLICK, () => {
        this._close();
      });
    }

    if (closeBtn) {
      this._addEventlistener(closeBtn, EventType.CLICK, () => {
        this._close();
      });
    }

    this._addEventlistener(document, EventType.WORKSPACE_ACTIVE_PANE, () => {
      this._syncTitle();
    });

    this._addEventlistener(document, EventType.KEY_DOWN, (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }

      if (e.key === "/" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this._toggle();
        return;
      }

      if (e.key === "Escape" && this._isOpen) {
        e.preventDefault();
        this._close();
      }
    });

    this._addEventlistener(this._dialog, EventType.KEY_DOWN, (e: KeyboardEvent) => {
      if (!this._isOpen || e.key !== "Tab") {
        return;
      }
      const focusables = Array.from(
        this._dialog.querySelectorAll<HTMLElement>(focusableSelector),
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
}
