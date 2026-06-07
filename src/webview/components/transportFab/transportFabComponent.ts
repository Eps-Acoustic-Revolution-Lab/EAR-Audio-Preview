import "./transportFabComponent.css";
import { EventType } from "../../events";
import Component from "../../component";
import PlayerService from "../../services/playerService";
import PlayerSettingsService from "../../services/playerSettingsService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import KnobComponent from "../knob/knobComponent";
import LiveMonitoringBarComponent from "../liveMeters/liveMonitoringBarComponent";
import PlayerComponent from "../player/playerComponent";
import {
  initialKnobPercentFromSettings,
  KNOB_VOLUME_MAX,
  KNOB_VOLUME_UNITY,
  knobPercentToGain,
} from "../../utils/volumeMapping";

const META_FAB_SIZE_PX = 52;
const DOCK_INSET_PX = 12;
const META_TRANSPORT_GAP_PX = 8;
const FAB_SIZE_PX = 52;
const LONG_PRESS_MS = 450;
const POSITION_STORAGE_KEY = "earPreview.transportFabPosition";

function defaultFabLeft(): number {
  return DOCK_INSET_PX + META_FAB_SIZE_PX + META_TRANSPORT_GAP_PX;
}

function defaultFabBottom(): number {
  return DOCK_INSET_PX;
}

function applyKnobVolume(knobValue: number, playerService: PlayerService): void {
  playerService.volume = knobPercentToGain(knobValue);
}

interface StoredFabPosition {
  left: number;
  bottom: number;
}

export default class TransportFabComponent extends Component {
  private _fabWrap: HTMLElement;
  private _expandChip: HTMLButtonElement;
  private _popover: HTMLElement;
  private _popoverPanel: HTMLElement;
  private _backdrop: HTMLElement;
  private _playPill: HTMLButtonElement | null = null;
  private _knob: KnobComponent;
  private _monitorBar: LiveMonitoringBarComponent;
  private _seekPlayer: PlayerComponent;
  private _isOpen = false;
  private _loading = true;
  private _playerService: PlayerService;
  private _fabLeft = defaultFabLeft();
  private _fabBottom = defaultFabBottom();
  private _fabDragging = false;

  constructor(
    dockSelector: string,
    playerService: PlayerService,
    playerSettingsService: PlayerSettingsService,
    analyzeSettingsService: AnalyzeSettingsService,
  ) {
    super();
    this._playerService = playerService;

    const dock = document.querySelector(dockSelector) as HTMLElement;
    if (!dock) {
      throw new Error(`Transport dock not found: ${dockSelector}`);
    }
    dock.innerHTML = `
      <div class="transportDock__fabWrap" title="Scroll: volume · Tap: play/pause · Long-press: move">
        <button
          type="button"
          class="transportDock__expandChip js-transportExpand"
          aria-label="Expand transport controls"
          title="Monitor &amp; seek"
        >⋯</button>
        <div id="transportKnobMount" class="transportDock__knobMount"></div>
      </div>
      <div
        class="transportPopover transportPopover--animating"
        id="transportPopover"
        hidden
        role="dialog"
        aria-modal="true"
        aria-label="Transport controls"
      >
        <div class="transportPopover__backdrop js-transportBackdrop"></div>
        <div class="transportPopover__panel">
          <header class="transportPopover__header">
            <h2 class="transportPopover__title">Transport</h2>
            <button
              type="button"
              class="transportPopover__close js-transportClose"
              aria-label="Close transport controls"
            >×</button>
          </header>
          <div class="transportPopover__body">
            <section>
              <h3 class="transportPopover__sectionTitle">Monitor</h3>
              <div id="transportMonitorMount"></div>
            </section>
            <section class="transportPopover__future" aria-disabled="true">
              <h3 class="transportPopover__sectionTitle">Curve correction</h3>
              <p>Coming soon</p>
            </section>
            <section>
              <h3 class="transportPopover__sectionTitle">Seek</h3>
              <div class="transportPopover__seekRow">
                <button
                  type="button"
                  class="earEqPill transportPopover__playPill js-transportPanelPlay"
                  aria-label="Play"
                  title="Play / Pause"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                </button>
                <div id="transportSeekMount" class="transportPopover__seekMount"></div>
              </div>
            </section>
          </div>
        </div>
      </div>`;

    this._fabWrap = dock.querySelector(".transportDock__fabWrap") as HTMLElement;
    this._expandChip = dock.querySelector(
      ".js-transportExpand",
    ) as HTMLButtonElement;
    this._popover = dock.querySelector("#transportPopover") as HTMLElement;
    this._popoverPanel = dock.querySelector(
      ".transportPopover__panel",
    ) as HTMLElement;
    this._backdrop = dock.querySelector(".js-transportBackdrop") as HTMLElement;
    this._playPill = dock.querySelector(
      ".js-transportPanelPlay",
    ) as HTMLButtonElement;

    this._restoreFabPosition();
    this._applyFabPosition();

    const initialKnob = initialKnobPercentFromSettings(
      playerSettingsService.volumeUnitDb,
      playerSettingsService.initialVolume,
      playerSettingsService.initialVolumeDb,
    );
    const startKnob = Math.min(
      KNOB_VOLUME_MAX,
      Math.max(0, initialKnob || KNOB_VOLUME_UNITY),
    );
    this._knob = new KnobComponent(
      "#transportKnobMount",
      startKnob,
      (v) => applyKnobVolume(v, playerService),
      {
        size: FAB_SIZE_PX,
        min: 0,
        max: KNOB_VOLUME_MAX,
        step: 1,
        compact: true,
        centerMode: "playPause",
        color: "#00c3ff",
        warnColor: "#f06464",
        warnThreshold: KNOB_VOLUME_UNITY,
        externalPointer: true,
      },
    );
    this._disposables.push(this._knob);

    applyKnobVolume(startKnob, playerService);

    this._monitorBar = new LiveMonitoringBarComponent(
      "#transportMonitorMount",
      analyzeSettingsService,
    );
    this._disposables.push(this._monitorBar);

    this._seekPlayer = new PlayerComponent(
      "#transportSeekMount",
      playerService,
      playerSettingsService,
      { seekOnly: true },
    );
    this._disposables.push(this._seekPlayer);

    this._syncPlayUi();
    this._addEventlistener(
      playerService,
      EventType.UPDATE_IS_PLAYING,
      () => this._syncPlayUi(),
    );

    if (playerSettingsService.enableSpacekeyPlay) {
      this._addEventlistener(window, EventType.KEY_DOWN, (e: KeyboardEvent) => {
        if (e.isComposing || e.code !== "Space") {
          return;
        }
        e.preventDefault();
        this._togglePlayPause();
      });
    }

    this._wirePopover();
    this._wirePanelPlay();
    this._wireWheelVolume();
    this._wireFabGestures();
    this.setLoading(true);
  }

  public setLoading(loading: boolean): void {
    this._loading = loading;
    this._knob.disabled = loading;
    this._expandChip.disabled = loading;
    if (loading) {
      this.close();
    }
  }

  public close(): void {
    if (!this._isOpen) {
      return;
    }
    this._isOpen = false;
    this._popover.classList.remove("transportPopover--open");
    window.setTimeout(() => {
      if (!this._isOpen) {
        this._popover.hidden = true;
      }
    }, 150);
  }

  private _restoreFabPosition(): void {
    try {
      const raw = localStorage.getItem(POSITION_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as StoredFabPosition;
      if (
        Number.isFinite(parsed.left) &&
        Number.isFinite(parsed.bottom)
      ) {
        this._fabLeft = parsed.left;
        this._fabBottom = parsed.bottom;
      }
    } catch {
      /* ignore */
    }
  }

  private _persistFabPosition(): void {
    try {
      const payload: StoredFabPosition = {
        left: this._fabLeft,
        bottom: this._fabBottom,
      };
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  private _clampFabPosition(left: number, bottom: number): StoredFabPosition {
    const maxLeft = Math.max(
      DOCK_INSET_PX,
      window.innerWidth - FAB_SIZE_PX - DOCK_INSET_PX,
    );
    const maxBottom = Math.max(
      DOCK_INSET_PX,
      window.innerHeight - FAB_SIZE_PX - DOCK_INSET_PX,
    );
    return {
      left: Math.min(maxLeft, Math.max(DOCK_INSET_PX, left)),
      bottom: Math.min(maxBottom, Math.max(DOCK_INSET_PX, bottom)),
    };
  }

  private _applyFabPosition(): void {
    const { left, bottom } = this._clampFabPosition(
      this._fabLeft,
      this._fabBottom,
    );
    this._fabLeft = left;
    this._fabBottom = bottom;
    this._fabWrap.style.left = `${left}px`;
    this._fabWrap.style.bottom = `${bottom}px`;
    this._fabWrap.style.right = "auto";
    this._updatePopoverAnchor();
  }

  private _updatePopoverAnchor(): void {
    const rect = this._fabWrap.getBoundingClientRect();
    const panelGap = 8;
    this._popoverPanel.style.left = `${rect.left}px`;
    this._popoverPanel.style.right = "auto";
    this._popoverPanel.style.bottom = `${
      window.innerHeight - rect.top + panelGap
    }px`;
    this._popoverPanel.style.width = `min(92vw, 320px)`;
    const maxW = Math.min(320, window.innerWidth - DOCK_INSET_PX * 2);
    const clampedLeft = Math.min(
      rect.left,
      window.innerWidth - maxW - DOCK_INSET_PX,
    );
    this._popoverPanel.style.left = `${Math.max(DOCK_INSET_PX, clampedLeft)}px`;
    this._popoverPanel.style.maxWidth = `${maxW}px`;
  }

  private _wireFabGestures(): void {
    type GestureMode = "idle" | "longPressPending" | "volume" | "fabDrag";
    let mode: GestureMode = "idle";
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let volumeAnchorY = 0;
    let grabOffsetX = 0;
    let grabOffsetY = 0;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const TAP_SLOP_PX = 5;

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const endGesture = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) {
        return;
      }
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (mode === "longPressPending" && moved < TAP_SLOP_PX) {
        this._togglePlayPause();
      }
      const wasFabDrag = mode === "fabDrag";
      this._fabWrap.releasePointerCapture(pointerId);
      pointerId = null;
      mode = "idle";
      this._fabDragging = false;
      this._knob.setGestureLocked(false);
      this._knob.setDragging(false);
      this._fabWrap.classList.remove("transportDock__fabWrap--dragging");
      clearLongPress();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", endGesture);
      document.removeEventListener("pointercancel", endGesture);
      if (wasFabDrag) {
        this._persistFabPosition();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) {
        return;
      }
      if (mode === "fabDrag") {
        e.preventDefault();
        const left = e.clientX - grabOffsetX;
        const bottom =
          window.innerHeight - (e.clientY - grabOffsetY) - FAB_SIZE_PX;
        const clamped = this._clampFabPosition(left, bottom);
        this._fabLeft = clamped.left;
        this._fabBottom = clamped.bottom;
        this._fabWrap.style.left = `${this._fabLeft}px`;
        this._fabWrap.style.bottom = `${this._fabBottom}px`;
        if (this._isOpen) {
          this._updatePopoverAnchor();
        }
        return;
      }
      if (mode === "volume") {
        e.preventDefault();
        const dy = volumeAnchorY - e.clientY;
        volumeAnchorY = e.clientY;
        this._knob.adjustBy(dy * 0.12);
        return;
      }
      if (mode === "longPressPending") {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.hypot(dx, dy) < TAP_SLOP_PX) {
          return;
        }
        clearLongPress();
        if (Math.abs(dy) > Math.abs(dx)) {
          mode = "volume";
          this._knob.setDragging(true);
          volumeAnchorY = e.clientY;
        }
      }
    };

    this._addEventlistener(this._fabWrap, "pointerdown", (e: PointerEvent) => {
      if (this._loading) {
        return;
      }
      if ((e.target as Element).closest(".transportDock__expandChip")) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      pointerId = e.pointerId;
      this._fabWrap.setPointerCapture(pointerId);
      startX = e.clientX;
      startY = e.clientY;
      const rect = this._fabWrap.getBoundingClientRect();
      grabOffsetX = e.clientX - rect.left;
      grabOffsetY = e.clientY - rect.top;
      mode = "longPressPending";
      clearLongPress();
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (mode !== "longPressPending") {
          return;
        }
        mode = "fabDrag";
        this._fabDragging = true;
        this._knob.setGestureLocked(true);
        this._knob.setDragging(false);
        this._fabWrap.classList.add("transportDock__fabWrap--dragging");
      }, LONG_PRESS_MS);
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", endGesture);
      document.addEventListener("pointercancel", endGesture);
    });

    this._addEventlistener(window, "resize", () => {
      this._applyFabPosition();
    });
  }

  private _wireWheelVolume(): void {
    this._fabWrap.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (this._loading || this._fabDragging) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const step = e.deltaMode === 1 ? e.deltaY * 4 : e.deltaY * 0.04;
        this._knob.adjustBy(-step);
      },
      { passive: false },
    );
  }

  private _open(): void {
    if (this._loading) {
      return;
    }
    this._isOpen = true;
    this._popover.hidden = false;
    this._updatePopoverAnchor();
    requestAnimationFrame(() => {
      this._popover.classList.add("transportPopover--open");
    });
  }

  private _toggleOpen(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this._open();
    }
  }

  private _togglePlayPause(): void {
    if (this._loading || this._fabDragging) {
      return;
    }
    if (this._playerService.isPlaying) {
      this._playerService.pause();
    } else {
      this._playerService.play();
    }
  }

  private _syncPlayUi(): void {
    const playing = this._playerService.isPlaying;
    this._knob.setPlaying(playing);
    if (this._playPill) {
      this._playPill.innerHTML = playing
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>`
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
      this._playPill.setAttribute(
        "aria-label",
        playing ? "Pause" : "Play",
      );
    }
  }

  private _wirePopover(): void {
    this._addEventlistener(this._expandChip, EventType.CLICK, (e) => {
      e.stopPropagation();
      this._toggleOpen();
    });

    this._addEventlistener(this._backdrop, EventType.CLICK, () => this.close());

    const closeBtn = this._popover.querySelector(
      ".js-transportClose",
    ) as HTMLButtonElement;
    this._addEventlistener(closeBtn, EventType.CLICK, () => this.close());
  }

  private _wirePanelPlay(): void {
    if (!this._playPill) {
      return;
    }
    this._addEventlistener(this._playPill, EventType.CLICK, () => {
      this._togglePlayPause();
    });
  }
}
