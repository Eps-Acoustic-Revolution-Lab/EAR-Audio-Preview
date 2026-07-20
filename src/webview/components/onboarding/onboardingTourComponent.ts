import "./onboardingTourComponent.css";
import Component from "../../component";
import { EventType } from "../../events";

/** Auto-advance condition for interactive "try it now" steps. */
export type OnboardingAdvanceOn =
  | { kind: "pane"; pane: string }
  | { kind: "visible"; selector: string }
  /** Advances once the overlay that was open on step entry closes again. */
  | { kind: "closed"; selector: string }
  /** Advances once the predicate turns true (polled). `reset` is called
      every time the step is (re)entered so flip-detectors can re-baseline. */
  | { kind: "custom"; check: () => boolean; reset?: () => void };

/** One tour stop. `target: null` renders a centered card with a full dim. */
export interface OnboardingTourStep {
  target: string | null;
  title: string;
  body: string;
  /** Spotlight padding override (CSS px) — small controls read better tight. */
  padPx?: number;
  /** When set, the shield lets clicks through and the step advances itself
      once the condition is met (user actually performed the action). */
  advanceOn?: OnboardingAdvanceOn;
}

export interface OnboardingTourOptions {
  /** While any of these matches a visible element, Esc is left to that
      overlay's own handler instead of closing the tour. */
  escGuardSelectors?: string[];
}

/** Default spotlight padding around the anchored element (CSS px). */
const spotlightPadPx = 6;
/** Gap between the spotlight window and the step card (CSS px). */
const cardGapPx = 12;
/** Poll cadence for `visible` advance conditions (ms). */
const visiblePollMs = 150;

function isElementVisible(selector: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el || el.hasAttribute("hidden") || el.closest("[hidden]")) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

/**
 * Cold-start onboarding tour: dims the UI, spotlights one functional area at
 * a time and explains it with a step card (Back / Next / Skip, dots, Esc).
 * The dim layer never blocks the pointer — every step lets the user try the
 * real controls underneath. Interactive steps (advanceOn) additionally jump
 * ahead on their own once the suggested action happened; Next stays
 * available as an escape hatch.
 */
export default class OnboardingTourComponent extends Component {
  private _root: HTMLElement;
  private _spotlight: HTMLElement;
  private _card: HTMLElement;
  private _steps: OnboardingTourStep[];
  private _visible: OnboardingTourStep[] = [];
  private _idx = 0;
  private _active = false;
  private _onFinished: () => void;
  private _escGuardSelectors: string[];
  private _pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    mountSelector: string,
    steps: OnboardingTourStep[],
    onFinished: () => void,
    options?: OnboardingTourOptions,
  ) {
    super();
    const mount = document.querySelector(mountSelector);
    if (!mount) {
      throw new Error(`Element not found: ${mountSelector}`);
    }
    this._steps = steps;
    this._onFinished = onFinished;
    this._escGuardSelectors = options?.escGuardSelectors ?? [];

    mount.innerHTML = `
      <div class="onboardingTour" hidden role="dialog" aria-modal="true" aria-label="Getting started tour">
        <div class="onboardingTour__spotlight"></div>
        <div class="onboardingTour__card">
          <h3 class="onboardingTour__title"></h3>
          <p class="onboardingTour__body"></p>
          <div class="onboardingTour__footer">
            <div class="onboardingTour__dots"></div>
            <button type="button" class="onboardingTour__btn js-tourSkip">Skip</button>
            <button type="button" class="onboardingTour__btn js-tourBack">Back</button>
            <button type="button" class="onboardingTour__btn onboardingTour__btn--primary js-tourNext">Next</button>
          </div>
        </div>
      </div>
    `;
    this._root = mount.querySelector(".onboardingTour") as HTMLElement;
    this._spotlight = this._root.querySelector(
      ".onboardingTour__spotlight",
    ) as HTMLElement;
    this._card = this._root.querySelector(
      ".onboardingTour__card",
    ) as HTMLElement;

    this._addEventlistener(
      this._root.querySelector(".js-tourSkip") as HTMLElement,
      EventType.CLICK,
      () => this._finish(),
    );
    this._addEventlistener(
      this._root.querySelector(".js-tourBack") as HTMLElement,
      EventType.CLICK,
      () => this._go(this._idx - 1),
    );
    this._addEventlistener(
      this._root.querySelector(".js-tourNext") as HTMLElement,
      EventType.CLICK,
      () => this._go(this._idx + 1),
    );
    this._addEventlistener(document, EventType.KEY_DOWN, (e: KeyboardEvent) => {
      if (!this._active) {
        return;
      }
      if (e.key === "Escape") {
        // An overlay that consumed Esc (preventDefault) keeps the tour open;
        // the visibility guard covers overlays that close without consuming.
        if (
          e.defaultPrevented ||
          this._escGuardSelectors.some(isElementVisible)
        ) {
          return;
        }
        e.preventDefault();
        this._finish();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this._go(this._idx + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this._go(this._idx - 1);
      }
    });
    // Interactive pane steps advance when the user really switched the pane.
    this._addEventlistener(document, EventType.WORKSPACE_ACTIVE_PANE, ((
      ev: Event,
    ) => {
      if (!this._active) {
        return;
      }
      const cond = this._visible[this._idx]?.advanceOn;
      if (cond?.kind !== "pane") {
        return;
      }
      const pane = (ev as CustomEvent<{ pane: string }>).detail?.pane;
      if (pane === cond.pane) {
        // Give the revealed pane a frame to lay out before anchoring on it.
        requestAnimationFrame(() => this._go(this._idx + 1));
      }
    }) as EventListener);
    this._addEventlistener(window, "resize", () => {
      if (this._active) {
        this._renderStep();
      }
    });
  }

  public get active(): boolean {
    return this._active;
  }

  public start(): void {
    this._visible = this._steps.filter(
      (s) => s.target === null || document.querySelector(s.target),
    );
    if (this._visible.length === 0) {
      return;
    }
    this._idx = 0;
    this._active = true;
    this._root.removeAttribute("hidden");
    this._renderStep();
  }

  private _go(idx: number): void {
    if (idx < 0) {
      return;
    }
    if (idx >= this._visible.length) {
      this._finish();
      return;
    }
    this._idx = idx;
    this._renderStep();
  }

  private _finish(): void {
    if (!this._active) {
      return;
    }
    this._active = false;
    this._clearPoll();
    this._root.setAttribute("hidden", "");
    this._onFinished();
  }

  private _clearPoll(): void {
    if (this._pollTimer !== undefined) {
      clearInterval(this._pollTimer);
      this._pollTimer = undefined;
    }
  }

  private _armAdvance(step: OnboardingTourStep): void {
    this._clearPoll();
    const cond = step.advanceOn;
    if (!cond || cond.kind === "pane") {
      return; // "pane" advances via the WORKSPACE_ACTIVE_PANE listener
    }
    // "closed" only arms while the overlay is actually open on entry, so
    // navigating Back to this step never skips it instantly.
    if (cond.kind === "closed" && !isElementVisible(cond.selector)) {
      return;
    }
    if (cond.kind === "custom") {
      cond.reset?.();
    }
    const met = (): boolean => {
      switch (cond.kind) {
        case "visible":
          return isElementVisible(cond.selector);
        case "closed":
          return !isElementVisible(cond.selector);
        default:
          return cond.check();
      }
    };
    // Prime flip-detector baselines immediately — a first poll 150 ms later
    // could otherwise record a state the user already changed.
    met();
    this._pollTimer = setInterval(() => {
      if (!this._active) {
        this._clearPoll();
        return;
      }
      if (met()) {
        this._clearPoll();
        this._go(this._idx + 1);
      }
    }, visiblePollMs);
  }

  private _renderStep(): void {
    const step = this._visible[this._idx];
    (
      this._card.querySelector(".onboardingTour__title") as HTMLElement
    ).textContent = step.title;
    (
      this._card.querySelector(".onboardingTour__body") as HTMLElement
    ).textContent = step.body;

    const dots = this._card.querySelector(
      ".onboardingTour__dots",
    ) as HTMLElement;
    dots.innerHTML = this._visible
      .map(
        (_, i) =>
          `<span class="onboardingTour__dot${
            i === this._idx ? " onboardingTour__dot--active" : ""
          }"></span>`,
      )
      .join("");

    const back = this._root.querySelector(".js-tourBack") as HTMLButtonElement;
    back.style.visibility = this._idx === 0 ? "hidden" : "visible";
    const next = this._root.querySelector(".js-tourNext") as HTMLButtonElement;
    next.textContent = this._idx === this._visible.length - 1 ? "Done" : "Next";

    // Interactive steps free the pointer so the user can act on the live UI.
    this._root.classList.toggle(
      "onboardingTour--interactive",
      step.advanceOn !== undefined,
    );
    this._armAdvance(step);

    const pad = step.padPx ?? spotlightPadPx;
    const targetEl = step.target
      ? (document.querySelector(step.target) as HTMLElement | null)
      : null;
    const r = targetEl?.getBoundingClientRect();
    if (r && r.width > 1 && r.height > 1) {
      this._spotlight.classList.remove("onboardingTour__spotlight--none");
      this._spotlight.style.top = `${Math.max(0, r.top - pad)}px`;
      this._spotlight.style.left = `${Math.max(0, r.left - pad)}px`;
      this._spotlight.style.width = `${r.width + pad * 2}px`;
      this._spotlight.style.height = `${r.height + pad * 2}px`;
      this._positionCard(r, pad);
    } else {
      // No anchor (final card) or target still collapsed → centered card.
      // Inline size must be reset, otherwise the previous step's spotlight
      // rectangle survives at the new 50%/50% origin (stray bottom-right
      // highlight).
      this._spotlight.classList.add("onboardingTour__spotlight--none");
      this._spotlight.style.top = "50%";
      this._spotlight.style.left = "50%";
      this._spotlight.style.width = "0px";
      this._spotlight.style.height = "0px";
      this._card.style.top = `${Math.max(12, window.innerHeight / 2 - 90)}px`;
      this._card.style.left = `${Math.max(
        12,
        (window.innerWidth - this._card.offsetWidth) / 2,
      )}px`;
    }
  }

  /** Place the card under the target when there is room, otherwise above;
      tall targets (near-fullscreen dialogs) get the card beside them so the
      spotlighted panel itself is never covered. */
  private _positionCard(r: DOMRect, pad: number): void {
    const cardH = this._card.offsetHeight || 140;
    const cardW = this._card.offsetWidth || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = r.bottom + pad + cardGapPx;
    const above = r.top - pad - cardGapPx - cardH;
    let top: number;
    let left: number;
    if (below + cardH <= vh - 8) {
      top = below;
      left = Math.max(8, Math.min(r.left, vw - cardW - 8));
    } else if (above >= 8) {
      top = above;
      left = Math.max(8, Math.min(r.left, vw - cardW - 8));
    } else {
      const sideTop = Math.max(8, Math.min(r.top, vh - cardH - 8));
      const rightSide = r.right + pad + cardGapPx;
      const leftSide = r.left - pad - cardGapPx - cardW;
      if (rightSide + cardW <= vw - 8) {
        top = sideTop;
        left = rightSide;
      } else if (leftSide >= 8) {
        top = sideTop;
        left = leftSide;
      } else {
        // Last resort: pin to the bottom-right corner.
        top = vh - cardH - 8;
        left = vw - cardW - 8;
      }
    }
    this._card.style.top = `${top}px`;
    this._card.style.left = `${left}px`;
  }

  override dispose() {
    this._clearPoll();
    super.dispose();
  }
}
