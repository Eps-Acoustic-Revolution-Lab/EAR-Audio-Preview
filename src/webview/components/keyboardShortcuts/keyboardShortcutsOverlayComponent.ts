import "./keyboardShortcutsOverlayComponent.css";
import Component from "../../component";
import { EventType } from "../../events";

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutItem[];
}

export default class KeyboardShortcutsOverlayComponent extends Component {
  private _overlay: HTMLElement;
  private _keysPressed = new Set<string>();
  private _isVisible = false;
  private readonly _modKey: string;

  constructor(selector: string) {
    super();

    const isMac = navigator.platform.toLowerCase().includes("mac");
    this._modKey = isMac ? "Cmd" : "Ctrl";

    const root = document.querySelector(selector);
    if (!root) {
      throw new Error(`Element not found: ${selector}`);
    }

    root.innerHTML = this._generateHTML();
    this._overlay = root.querySelector(
      ".keyboardShortcutsOverlay",
    ) as HTMLElement;

    this._initEventListeners();
  }

  private _generateHTML(): string {
    const groups = this._getShortcutGroups();

    const groupsHTML = groups
      .map(
        (group) => `
        <div class="keyboardShortcutsGroup">
          <h3 class="keyboardShortcutsGroup__title">${group.title}</h3>
          <div class="keyboardShortcutsGroup__items">
            ${group.shortcuts
              .map(
                (shortcut) => `
              <div class="keyboardShortcutsItem">
                <div class="keyboardShortcutsItem__keys">
                  ${shortcut.keys.map((key) => `<kbd class="keyboardShortcutsKey">${key}</kbd>`).join("")}
                </div>
                <div class="keyboardShortcutsItem__description">${shortcut.description}</div>
              </div>
            `,
              )
              .join("")}
          </div>
        </div>
      `,
      )
      .join("");

    return `
      <div class="keyboardShortcutsOverlay keyboardShortcutsOverlay--animating" hidden role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div class="keyboardShortcutsOverlay__backdrop"></div>
        <div class="keyboardShortcutsOverlay__dialog">
          <h2 class="keyboardShortcutsOverlay__title">Keyboard Shortcuts</h2>
          <div class="keyboardShortcutsOverlay__grid">
            ${groupsHTML}
          </div>
        </div>
      </div>
    `;
  }

  private _getShortcutGroups(): ShortcutGroup[] {
    return [
      {
        title: "Playback Control",
        shortcuts: [
          { keys: ["Space"], description: "Play / Pause" },
          { keys: ["Click waveform"], description: "Set cue position" },
        ],
      },
      {
        title: "Zoom & Navigation",
        shortcuts: [
          { keys: ["Drag"], description: "Zoom to selection" },
          {
            keys: [this._modKey, "+", "Drag"],
            description: "Zoom time axis only",
          },
          {
            keys: ["Shift", "+", "Drag"],
            description: "Zoom frequency/amplitude axis only",
          },
          { keys: ["Right-click"], description: "Reset view (all axes)" },
          {
            keys: [this._modKey, "+", "Right-click"],
            description: "Reset time axis only",
          },
          {
            keys: ["Shift", "+", "Right-click"],
            description: "Reset frequency/amplitude axis only",
          },
        ],
      },
      {
        title: "View Control",
        shortcuts: [
          { keys: ["Esc"], description: "Exit fullscreen (Live Spec)" },
          { keys: ["Click", "↗"], description: "Enter fullscreen" },
        ],
      },
      {
        title: "Help",
        shortcuts: [
          { keys: ["?"], description: "Show keyboard shortcuts" },
          {
            keys: [this._modKey, "+", "/"],
            description: "Toggle settings for current view",
          },
          {
            keys: ["Gear icon"],
            description: "Toggle settings for current view",
          },
        ],
      },
    ];
  }

  private _initEventListeners(): void {
    this._addEventlistener(document, EventType.KEY_DOWN, (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        this._keysPressed.add(e.code);
        if (!this._isVisible) {
          this._show();
        }
      } else if (e.key === "Escape" && this._isVisible) {
        e.preventDefault();
        this._hide();
      }
    });

    this._addEventlistener(document, EventType.KEY_UP, (e: KeyboardEvent) => {
      this._keysPressed.delete(e.code);
      if (this._keysPressed.size === 0 && this._isVisible) {
        this._hide();
      }
    });

    const backdrop = this._overlay.querySelector(
      ".keyboardShortcutsOverlay__backdrop",
    );
    if (backdrop) {
      this._addEventlistener(backdrop, EventType.CLICK, () => {
        this._hide();
      });
    }
  }

  private _show(): void {
    this._isVisible = true;
    this._overlay.removeAttribute("hidden");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._overlay.classList.add("keyboardShortcutsOverlay--open");
      });
    });
  }

  private _hide(): void {
    this._isVisible = false;
    this._keysPressed.clear();
    this._overlay.classList.remove("keyboardShortcutsOverlay--open");
    setTimeout(() => {
      this._overlay.setAttribute("hidden", "");
    }, 150);
  }
}
