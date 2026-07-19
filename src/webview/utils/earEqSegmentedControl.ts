import { updateEarEqSlidingFocus } from "./earEqSlidingFocus";

export interface EarEqSegmentOption {
  value: string;
  label: string;
}

export interface EarEqSegmentedControlOptions {
  /** Extra class on the strip root (e.g. editExport__channelSegment). */
  className?: string;
  /** Called when user picks a new value (not when setValue is silent). */
  onChange?: (value: string) => void;
}

/**
 * Mutually exclusive option strip with a solid sliding focus (workspace tabs pattern).
 */
export default class EarEqSegmentedControl {
  readonly root: HTMLElement;
  private readonly _focus: HTMLElement;
  private readonly _onChange?: (value: string) => void;
  private _value: string;
  private _resizeObserver: ResizeObserver | null = null;

  constructor(
    options: EarEqSegmentOption[],
    initialValue: string,
    opts: EarEqSegmentedControlOptions = {},
  ) {
    if (!options.length) {
      throw new Error("EarEqSegmentedControl requires at least one option");
    }
    this._onChange = opts.onChange;
    this._value = options.some((o) => o.value === initialValue)
      ? initialValue
      : options[0].value;

    this.root = document.createElement("div");
    this.root.className = ["earEqSegment", opts.className]
      .filter(Boolean)
      .join(" ");
    this.root.setAttribute("role", "group");

    this._focus = document.createElement("div");
    this._focus.className = "earEqSlidingFocus earEqSegment__focus";
    this._focus.setAttribute("aria-hidden", "true");
    this.root.appendChild(this._focus);

    for (const opt of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "earEqSegment__option";
      btn.dataset.value = opt.value;
      btn.textContent = opt.label;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        this.setValue(opt.value);
      });
      this.root.appendChild(btn);
    }

    this.setValue(this._value, true);

    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.updateFocus());
      this._resizeObserver.observe(this.root);
    }
  }

  public get value(): string {
    return this._value;
  }

  public setValue(value: string, silent = false): void {
    const options = this.root.querySelectorAll<HTMLElement>(
      ".earEqSegment__option",
    );
    const hit = [...options].some((btn) => btn.dataset.value === value);
    if (!hit) {
      return;
    }
    this._value = value;
    for (const btn of this.root.querySelectorAll<HTMLElement>(
      ".earEqSegment__option",
    )) {
      const active = btn.dataset.value === value;
      btn.classList.toggle("earEqSegment__option--active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
    requestAnimationFrame(() => this.updateFocus());
    if (!silent) {
      this._onChange?.(value);
    }
  }

  public updateFocus(): void {
    updateEarEqSlidingFocus(
      this.root,
      this._focus,
      ".earEqSegment__option--active",
    );
  }

  public dispose(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
  }
}
