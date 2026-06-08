import "./metaFabComponent.css";
import Component from "../../component";
import { EventType } from "../../events";

export default class MetaFabComponent extends Component {
  private _fab: HTMLButtonElement;
  private _popover: HTMLElement;
  private _backdrop: HTMLElement;
  private _isOpen = false;
  private _loading = true;

  constructor(mountSelector: string, fabSelector: string) {
    super();

    const mount = document.querySelector(mountSelector);
    if (!mount) {
      throw new Error(`Element not found: ${mountSelector}`);
    }

    const fab = document.querySelector(fabSelector) as HTMLButtonElement | null;
    if (!fab) {
      throw new Error(`Element not found: ${fabSelector}`);
    }
    this._fab = fab;

    mount.innerHTML = `
      <div
        class="metaPopover metaPopover--animating"
        id="metaPopover"
        hidden
        role="dialog"
        aria-modal="true"
        aria-label="Audio file info"
      >
        <div class="metaPopover__backdrop js-metaPopoverBackdrop"></div>
        <div class="metaPopover__panel">
          <header class="metaPopover__header">
            <h2 class="metaPopover__title">Audio file info</h2>
            <button
              type="button"
              class="metaPopover__close js-metaPopoverClose"
              aria-label="Close audio info"
            >×</button>
          </header>
          <div class="metaPopover__body" id="audioMeta"></div>
        </div>
      </div>
    `;

    this._popover = mount.querySelector(".metaPopover") as HTMLElement;
    this._backdrop = mount.querySelector(
      ".js-metaPopoverBackdrop",
    ) as HTMLElement;

    this._initEventListeners();
  }

  public get audioMetaSelector(): string {
    return "#audioMeta";
  }

  public setLoading(loading: boolean): void {
    this._loading = loading;
    if (loading) {
      this.close();
    }
  }

  public close(): void {
    if (!this._isOpen) {
      return;
    }
    this._isOpen = false;
    this._popover.classList.remove("metaPopover--open");
    this._fab.setAttribute("aria-expanded", "false");
    window.setTimeout(() => {
      if (!this._isOpen) {
        this._popover.hidden = true;
      }
    }, 150);
  }

  private _open(): void {
    if (this._loading || this._fab.disabled) {
      return;
    }
    this._isOpen = true;
    this._popover.hidden = false;
    requestAnimationFrame(() => {
      this._popover.classList.add("metaPopover--open");
    });
    this._fab.setAttribute("aria-expanded", "true");
  }

  private _toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this._open();
    }
  }

  private _initEventListeners(): void {
    this._fab.setAttribute("aria-expanded", "false");
    this._fab.setAttribute("aria-haspopup", "dialog");

    this._addEventlistener(this._fab, EventType.CLICK, (e) => {
      e.stopPropagation();
      if (this._loading || this._fab.disabled) {
        return;
      }
      this._toggle();
    });

    this._addEventlistener(this._backdrop, EventType.CLICK, () => this.close());

    const closeBtn = this._popover.querySelector(
      ".js-metaPopoverClose",
    ) as HTMLButtonElement;
    this._addEventlistener(closeBtn, EventType.CLICK, () => this.close());

    this._addEventlistener(document, EventType.KEY_DOWN, (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Escape" && this._isOpen) {
        ke.preventDefault();
        this.close();
        this._fab.focus();
      }
    });
  }
}
