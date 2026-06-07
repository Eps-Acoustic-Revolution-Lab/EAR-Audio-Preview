import "./knobComponent.css";
import Component from "../../component";

const START_ANGLE = -132;
const END_ANGLE = 132;
const ANGLE_RANGE = END_ANGLE - START_ANGLE;

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleInDegrees: number,
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
}

function getArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  if (Math.abs(endAngle - startAngle) < 0.1) {
    return "";
  }
  const isReverse = startAngle > endAngle;
  const start = polarToCartesian(cx, cy, r, isReverse ? startAngle : endAngle);
  const end = polarToCartesian(cx, cy, r, isReverse ? endAngle : startAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) <= 180 ? "0" : "1";
  const sweepFlag = "0";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`;
}

export type KnobCenterMode = "tick" | "playPause" | "none";

export interface KnobOptions {
  size?: number;
  min?: number;
  max?: number;
  step?: number;
  color?: string;
  warnColor?: string;
  /** Values above this render with warnColor (e.g. 100 = unity cap). */
  warnThreshold?: number;
  compact?: boolean;
  label?: string;
  unit?: string;
  centerMode?: KnobCenterMode;
  arcStartValue?: number;
  disabled?: boolean;
  /** Parent handles pointer; knob only renders. */
  externalPointer?: boolean;
}

const PLAY_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>`;

export default class KnobComponent extends Component {
  private _root: HTMLElement;
  private _hit: HTMLElement;
  private _trackPath: SVGPathElement;
  private _activePath: SVGPathElement;
  private _warnPath: SVGPathElement;
  private _tickWrap: HTMLElement;
  private _tick: HTMLElement;
  private _centerIcon: HTMLElement | null;
  private _valueEl: HTMLElement | null;
  private _labelEl: HTMLElement | null;

  private _value: number;
  private _min: number;
  private _max: number;
  private _step: number;
  private _color: string;
  private _warnColor: string;
  private _warnThreshold: number;
  private _size: number;
  private _arcStartValue: number;
  private _externalPointer: boolean;
  private _disabled: boolean;
  private _centerMode: KnobCenterMode;
  private _compact: boolean;
  private _isPlaying = false;
  private _isDragging = false;
  private _dragStartPct = 0;
  private _onChange: (value: number) => void;
  private _onTap: (() => void) | undefined;
  private _gestureLocked = false;

  constructor(
    mountSelector: string,
    initialValue: number,
    onChange: (value: number) => void,
    options: KnobOptions = {},
    onTap?: () => void,
  ) {
    super();
    this._onChange = onChange;
    this._onTap = onTap;
    this._min = options.min ?? 0;
    this._max = options.max ?? 100;
    this._step = options.step ?? 1;
    this._color = options.color ?? "#00c3ff";
    this._warnColor = options.warnColor ?? "#f06464";
    this._warnThreshold =
      options.warnThreshold ?? Number.POSITIVE_INFINITY;
    this._size = options.size ?? 56;
    this._arcStartValue = options.arcStartValue ?? this._min;
    this._disabled = options.disabled ?? false;
    this._externalPointer = options.externalPointer ?? false;
    this._centerMode = options.centerMode ?? "tick";
    this._compact = options.compact ?? false;
    this._value = Math.min(this._max, Math.max(this._min, initialValue));

    const mount = document.querySelector(mountSelector) as HTMLElement;
    if (!mount) {
      throw new Error(`Knob mount not found: ${mountSelector}`);
    }

    const faceInset = Math.max(4, Math.round(this._size * 0.09));
    mount.innerHTML = `
      <div class="earEqKnob${this._compact ? " earEqKnob--compact" : ""}${this._disabled ? " earEqKnob--disabled" : ""}">
        <div class="earEqKnob__hit" style="width:${this._size}px;height:${this._size}px">
          <div class="earEqKnob__ring"></div>
          <svg class="earEqKnob__svg" width="${this._size}" height="${this._size}">
            <path class="earEqKnob__track" fill="none" stroke="#222222" stroke-width="3" stroke-linecap="round"></path>
            <path class="earEqKnob__active" fill="none" stroke-width="3" stroke-linecap="round"></path>
            <path class="earEqKnob__warn" fill="none" stroke-width="3" stroke-linecap="round"></path>
          </svg>
          <div class="earEqKnob__face" style="top:${faceInset}px;left:${faceInset}px;right:${faceInset}px;bottom:${faceInset}px">
            <div class="earEqKnob__tickWrap"><div class="earEqKnob__tick"></div></div>
            <div class="earEqKnob__centerIcon" hidden></div>
          </div>
        </div>
        ${options.label ? `<div class="earEqKnob__label">${options.label}</div>` : ""}
        ${!this._compact ? `<div class="earEqKnob__value"></div>` : ""}
      </div>`;

    this._root = mount.querySelector(".earEqKnob") as HTMLElement;
    this._hit = mount.querySelector(".earEqKnob__hit") as HTMLElement;
    this._trackPath = mount.querySelector(".earEqKnob__track") as SVGPathElement;
    this._activePath = mount.querySelector(".earEqKnob__active") as SVGPathElement;
    this._warnPath = mount.querySelector(".earEqKnob__warn") as SVGPathElement;
    this._tickWrap = mount.querySelector(".earEqKnob__tickWrap") as HTMLElement;
    this._tick = mount.querySelector(".earEqKnob__tick") as HTMLElement;
    this._centerIcon = mount.querySelector(".earEqKnob__centerIcon");
    this._valueEl = mount.querySelector(".earEqKnob__value");
    this._labelEl = mount.querySelector(".earEqKnob__label");

    this._applyCenterMode();
    this._render();
    if (!this._externalPointer) {
      this._wirePointer();
    }
  }

  public get value(): number {
    return this._value;
  }

  public set value(v: number) {
    this._value = Math.min(this._max, Math.max(this._min, v));
    this._render();
  }

  public set disabled(disabled: boolean) {
    this._disabled = disabled;
    this._root.classList.toggle("earEqKnob--disabled", disabled);
  }

  public setPlaying(playing: boolean): void {
    this._isPlaying = playing;
    if (this._centerMode === "playPause" && this._centerIcon) {
      this._centerIcon.innerHTML = playing ? PAUSE_ICON_SVG : PLAY_ICON_SVG;
    }
  }

  public setGestureLocked(locked: boolean): void {
    this._gestureLocked = locked;
  }

  public adjustBy(delta: number): void {
    if (this._disabled || this._gestureLocked) {
      return;
    }
    const next = Math.min(
      this._max,
      Math.max(this._min, this._value + delta),
    );
    if (next !== this._value) {
      this._value = next;
      this._onChange(this._value);
      this._render();
    }
  }

  private _pct(val: number): number {
    return (val - this._min) / (this._max - this._min);
  }

  private _fromPct(perc: number): number {
    let v = perc * (this._max - this._min) + this._min;
    if (this._step > 0) {
      v = Math.round(v / this._step) * this._step;
    }
    return Math.min(this._max, Math.max(this._min, v));
  }

  private _applyCenterMode(): void {
    if (this._centerMode === "playPause") {
      this._tickWrap.hidden = true;
      if (this._centerIcon) {
        this._centerIcon.hidden = false;
        this._centerIcon.innerHTML = this._isPlaying
          ? PAUSE_ICON_SVG
          : PLAY_ICON_SVG;
      }
    } else if (this._centerMode === "none") {
      this._tickWrap.hidden = true;
      if (this._centerIcon) {
        this._centerIcon.hidden = true;
      }
    }
  }

  private _angleForValue(val: number): number {
    const pct = Math.max(0, Math.min(1, this._pct(val)));
    return START_ANGLE + pct * ANGLE_RANGE;
  }

  private _setArcPath(
    path: SVGPathElement,
    color: string,
    fromAngle: number,
    toAngle: number,
    cx: number,
    cy: number,
    radius: number,
    visible: boolean,
  ): void {
    if (!visible || Math.abs(toAngle - fromAngle) <= 0.5) {
      path.style.display = "none";
      return;
    }
    path.setAttribute("d", getArcPath(cx, cy, radius, toAngle, fromAngle));
    path.style.stroke = color;
    path.style.opacity = this._isDragging ? "1" : "0.85";
    path.style.filter = this._isDragging
      ? "drop-shadow(0px 0px 4px currentColor)"
      : "drop-shadow(0px 0px 2px currentColor)";
    path.style.display = "";
  }

  private _render(): void {
    const currentAngle = this._angleForValue(this._value);
    const originAngle = this._angleForValue(this._arcStartValue);
    const warnAngle = this._angleForValue(this._warnThreshold);
    const radius = this._size / 2 - 2;
    const cx = this._size / 2;
    const cy = this._size / 2;

    this._trackPath.setAttribute(
      "d",
      getArcPath(cx, cy, radius, START_ANGLE, END_ANGLE),
    );

    if (this._value > this._warnThreshold) {
      this._setArcPath(
        this._activePath,
        this._color,
        originAngle,
        warnAngle,
        cx,
        cy,
        radius,
        true,
      );
      this._setArcPath(
        this._warnPath,
        this._warnColor,
        warnAngle,
        currentAngle,
        cx,
        cy,
        radius,
        true,
      );
    } else {
      this._setArcPath(
        this._activePath,
        this._color,
        originAngle,
        currentAngle,
        cx,
        cy,
        radius,
        Math.abs(currentAngle - originAngle) > 0.5,
      );
      this._warnPath.style.display = "none";
    }

    if (this._centerMode === "tick") {
      this._tickWrap.style.transform = `rotate(${currentAngle}deg)`;
      this._tick.classList.toggle("earEqKnob__tick--dragging", this._isDragging);
    }

    if (this._valueEl) {
      this._valueEl.textContent = `${Math.round(this._value)}`;
    }

    const volLabel =
      this._value > this._warnThreshold
        ? `${Math.round(this._value)}% (+${Math.round(this._value - this._warnThreshold)}% boost)`
        : `${Math.round(this._value)}%`;
    this._hit.title = `Volume ${volLabel}`;
  }

  public setDragging(dragging: boolean): void {
    this._isDragging = dragging;
    this._render();
  }

  private _wirePointer(): void {
    let pointerId: number | null = null;
    let startY = 0;
    let moved = false;
    const dragThreshold = 4;

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) {
        return;
      }
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dy) >= dragThreshold) {
        moved = true;
        this._isDragging = true;
        this._dragStartPct = this._pct(this._value);
      }
      if (moved) {
        e.preventDefault();
        const deltaPct = -dy * 0.005;
        const newPct = Math.max(0, Math.min(1, this._dragStartPct + deltaPct));
        const newVal = this._fromPct(newPct);
        if (newVal !== this._value) {
          this._value = newVal;
          this._onChange(this._value);
          this._render();
        }
        startY = e.clientY;
        this._dragStartPct = newPct;
      }
    };

    const endPointer = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) {
        return;
      }
      this._hit.releasePointerCapture(pointerId);
      pointerId = null;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", endPointer);
      document.removeEventListener("pointercancel", endPointer);
      if (!moved && this._onTap) {
        this._onTap();
      }
      this._isDragging = false;
      moved = false;
      this._render();
    };

    this._addEventlistener(this._hit, "pointerdown", (e: PointerEvent) => {
      if (this._disabled || this._gestureLocked) {
        return;
      }
      e.preventDefault();
      pointerId = e.pointerId;
      startY = e.clientY;
      moved = false;
      this._dragStartPct = this._pct(this._value);
      this._hit.setPointerCapture(pointerId);
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", endPointer);
      document.addEventListener("pointercancel", endPointer);
    });
  }
}
