import "./contextMenu.css";

export interface ContextMenuItem {
  label: string;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action: () => void;
}

/** A shared DOM menu, styled with the same tokens as popovers and panels. */
export class ContextMenu {
  private static _current: ContextMenu | null = null;
  private _element: HTMLDivElement | null = null;
  private _restoreFocus: HTMLElement | null = null;
  private _blur = () => this.close();
  private _outside = (event: Event) => {
    if (this._element && !this._element.contains(event.target as Node)) {
      this.close();
    }
  };
  private _key = (event: KeyboardEvent) => {
    if (!this._element) {
      return;
    }
    const buttons = Array.from(
      this._element.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length;
      buttons[target]?.focus();
    }
  };
  public open(event: MouseEvent, items: ContextMenuItem[]): void {
    event.preventDefault();
    event.stopPropagation();
    ContextMenu._current?.close();
    ContextMenu._current = this;
    this._restoreFocus = document.activeElement as HTMLElement;
    const element = document.createElement("div");
    element.className = "earContextMenu";
    element.setAttribute("role", "menu");
    for (const item of items) {
      if (item.separator) {
        const rule = document.createElement("div");
        rule.className = "earContextMenu__separator";
        rule.setAttribute("role", "separator");
        element.append(rule);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute(
        "role",
        item.checked === undefined ? "menuitem" : "menuitemradio",
      );
      if (item.checked !== undefined) {
        button.setAttribute("aria-checked", String(item.checked));
      }
      button.textContent = `${item.checked ? "✓" : "　"} ${item.label}`;
      button.disabled = item.disabled === true;
      button.addEventListener("click", () => {
        this.close();
        item.action();
      });
      element.append(button);
    }
    // Native fullscreen only shows descendants of its fullscreen element.
    const scopedRoot =
      event.target instanceof Element ? event.target.closest(".ear-sdk") : null;
    (scopedRoot ?? document.fullscreenElement ?? document.body).append(element);
    this._element = element;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(6, Math.min(event.clientX, innerWidth - rect.width - 6))}px`;
    element.style.top = `${Math.max(6, Math.min(event.clientY, innerHeight - rect.height - 6))}px`;
    document.addEventListener("pointerdown", this._outside, true);
    document.addEventListener("keydown", this._key, true);
    window.addEventListener("blur", this._blur);
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }
  public close(): void {
    this._element?.remove();
    this._element = null;
    document.removeEventListener("pointerdown", this._outside, true);
    document.removeEventListener("keydown", this._key, true);
    window.removeEventListener("blur", this._blur);
    if (ContextMenu._current === this) {
      ContextMenu._current = null;
    }
    if (this._restoreFocus?.isConnected) {
      this._restoreFocus.focus();
    }
    this._restoreFocus = null;
  }
  public dispose(): void {
    this.close();
  }
}
