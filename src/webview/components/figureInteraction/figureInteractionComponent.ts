import "./figureInteractionComponent.css";
import { CursorReadoutPayload, EventType } from "../../events";
import PlayerService from "../../services/playerService";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService, {
  AnalyzeSettingsProps,
  FrequencyScale,
} from "../../services/analyzeSettingsService";
import {
  canvasYTopToLogPiecewiseYNorm,
  piecewiseLogAxisBoundaries,
  piecewiseYNormToHz,
} from "../../spectrogramFrequencyLayout";
import Component from "../../component";
import LoudnessService, { formatDbTp } from "../../services/loudnessService";

export default class FigureInteractionComponent extends Component {
  private selectionDiv: HTMLDivElement | null = null;
  private isDragging: boolean = false;
  private isTimeAxisOnly: boolean = false;
  private isValueAxisOnly: boolean = false;
  private mouseDownX: number = 0;
  private mouseDownY: number = 0;
  private currentX: number = 0;
  private currentY: number = 0;

  constructor(
    componentRootSelector: string,
    onWaveformCanvas: boolean,
    playerService: PlayerService,
    analyzeService: AnalyzeService,
    analyseSettingsService: AnalyzeSettingsService,
    audioBuffer: AudioBuffer,
    settings: AnalyzeSettingsProps,
    channelIndex: number,
    loudnessService?: LoudnessService,
  ) {
    super();
    const componentRoot = document.querySelector(componentRootSelector);

    // register seekbar (playback progress) on figures
    const visibleBar = document.createElement("div");
    visibleBar.className = "visibleBar";
    componentRoot.appendChild(visibleBar);

    this._addEventlistener(
      playerService,
      EventType.UPDATE_SEEKBAR,
      (e: CustomEventInit) => {
        const props = analyseSettingsService.toProps();
        const trng = props.maxTime - props.minTime;
        if (trng <= 0) {
          visibleBar.style.width = "0%";
          return;
        }
        const sec =
          typeof e.detail?.pos === "number" && Number.isFinite(e.detail.pos)
            ? e.detail.pos
            : (e.detail.value * audioBuffer.duration) / 100;
        const percentInFigureRange = ((sec - props.minTime) / trng) * 100;
        if (percentInFigureRange < 0) {
          visibleBar.style.width = `0%`;
          return;
        }
        if (100 < percentInFigureRange) {
          visibleBar.style.width = `100%`;
          return;
        }
        visibleBar.style.width = `${percentInFigureRange}%`;
      },
    );

    // fixed playback cue (white line); play always starts from this absolute time
    const positionBar = document.createElement("div");
    positionBar.className = "positionBar";
    positionBar.style.position = "absolute";
    positionBar.style.top = "0";
    positionBar.style.width = "2px";
    positionBar.style.height = "100%";
    positionBar.style.backgroundColor = "white";
    positionBar.style.pointerEvents = "none";
    positionBar.style.zIndex = "10";
    positionBar.style.display = "none";
    componentRoot.appendChild(positionBar);

    this._addEventlistener(
      playerService,
      EventType.UPDATE_PLAYBACK_POSITION,
      (e: CustomEventInit) => {
        const props = analyseSettingsService.toProps();
        const trng = props.maxTime - props.minTime;
        if (trng <= 0) {
          positionBar.style.display = "none";
          return;
        }
        const sec = e.detail.sec;
        const percentInFigureRange = ((sec - props.minTime) / trng) * 100;
        if (percentInFigureRange < 0 || 100 < percentInFigureRange) {
          positionBar.style.display = "none";
          return;
        }
        positionBar.style.display = "block";
        positionBar.style.left = `${percentInFigureRange}%`;
      },
    );

    const readoutEl = document.createElement("div");
    readoutEl.className = onWaveformCanvas
      ? "figureHoverReadout figureHoverReadout--waveform"
      : "figureHoverReadout figureHoverReadout--spectrogram";
    readoutEl.setAttribute("aria-live", "polite");
    readoutEl.style.visibility = "hidden";
    componentRoot.appendChild(readoutEl);

    let crossV: HTMLDivElement | null = null;
    let crossH: HTMLDivElement | null = null;
    if (!onWaveformCanvas) {
      crossV = document.createElement("div");
      crossV.className = "figureCursorCrosshair figureCursorCrosshair--v";
      crossV.style.display = "none";
      crossH = document.createElement("div");
      crossH.className = "figureCursorCrosshair figureCursorCrosshair--h";
      crossH.style.display = "none";
      componentRoot.appendChild(crossV);
      componentRoot.appendChild(crossH);
    }

    const fmtLin = (v: number) => (Number.isFinite(v) ? v.toFixed(5) : "—");
    /** Linear amplitude (±1 full scale) → dBFS, aligned with live spectrum readout. */
    const fmtDbfs = (lin: number) => {
      if (!Number.isFinite(lin) || lin <= 0) {
        return "—";
      }
      const db = 20 * Math.log10(lin);
      return Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : "—";
    };
    const fmtRmsWindow = (sec: number) => {
      if (!Number.isFinite(sec) || sec <= 0) {
        return "";
      }
      return sec >= 1 ? `${sec.toFixed(3)} s` : `${(sec * 1000).toFixed(2)} ms`;
    };
    const fmtTp = (db: number | undefined) => {
      if (db === undefined || !Number.isFinite(db)) {
        return "—";
      }
      return formatDbTp(db);
    };
    const fmtHz = (hz: number) => {
      if (!Number.isFinite(hz)) {
        return "—";
      }
      if (Math.abs(hz) >= 1000) {
        return `${(hz / 1000).toFixed(3)} kHz`;
      }
      return `${hz.toFixed(1)} Hz`;
    };

    const applyLocalHoverUi = (
      d: CursorReadoutPayload,
      xn: number,
      yn: number,
    ) => {
      if (d.kind === "clear") {
        readoutEl.style.visibility = "hidden";
        if (crossV && crossH) {
          crossV.style.display = "none";
          crossH.style.display = "none";
        }
        return;
      }
      readoutEl.style.visibility = "visible";
      const w = fmtRmsWindow(d.rmsWindowDurationSec);
      const winHtml = w
        ? `<br><span class="figureHoverReadout__meta">win ${w}</span>`
        : "";
      const tpHtml =
        d.truePeakDbTp !== undefined ? `<br>TP ${fmtTp(d.truePeakDbTp)}` : "";
      if (d.kind === "waveform") {
        readoutEl.innerHTML = `Ch ${channelIndex + 1}<br>RMS ${fmtLin(d.rms)}<br>Peak ${fmtLin(d.peak)}${tpHtml}${winHtml}`;
      } else {
        readoutEl.innerHTML = `Ch ${channelIndex + 1}<br>RMS ${fmtDbfs(d.rms)}<br>Peak ${fmtDbfs(d.peak)}<br>${fmtHz(d.frequencyHz)}${tpHtml}${winHtml}`;
      }
      readoutEl.style.position = "fixed";
      readoutEl.style.left = `${Math.min(
        lastClientX + 12,
        window.innerWidth - readoutEl.offsetWidth - 8,
      )}px`;
      readoutEl.style.top = `${Math.max(4, lastClientY - readoutEl.offsetHeight - 10)}px`;
      if (crossV && crossH) {
        crossV.style.display = "block";
        crossH.style.display = "block";
        crossV.style.left = `${xn}px`;
        crossH.style.top = `${yn}px`;
      }
    };

    const userInputDiv = document.createElement("div");
    userInputDiv.className = "userInputDiv";
    componentRoot.appendChild(userInputDiv);

    let cursorReadoutRaf = 0;
    let lastClientX = 0;
    let lastClientY = 0;
    const publishCursorReadout = () => {
      const props = analyseSettingsService.toProps();
      const rect = userInputDiv.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const xn = Math.min(Math.max(0, lastClientX - rect.left), rect.width);
      const yn = Math.min(Math.max(0, lastClientY - rect.top), rect.height);
      const trng = props.maxTime - props.minTime;
      if (trng <= 0) {
        return;
      }
      const t = props.minTime + (xn / rect.width) * trng;
      const sr = audioBuffer.sampleRate;
      const center = Math.min(
        Math.max(0, Math.floor(t * sr)),
        Math.max(0, audioBuffer.length - 1),
      );
      const win = Math.min(16384, Math.max(256, props.windowSize));
      const chData = audioBuffer.getChannelData(channelIndex);
      const { rms, peak } = AnalyzeService.windowRmsPeak(chData, center, win);
      const rmsWindowDurationSec = win / sr;
      let truePeakDbTp: number | undefined;
      if (loudnessService) {
        const { start, end } = AnalyzeService.windowBounds(
          chData.length,
          center,
          win,
        );
        const leftSlice = audioBuffer.getChannelData(0).subarray(start, end);
        const rightSlice =
          audioBuffer.numberOfChannels >= 2
            ? audioBuffer.getChannelData(1).subarray(start, end)
            : null;
        try {
          const tp = loudnessService.truePeakWindow(leftSlice, rightSlice, sr);
          if (Number.isFinite(tp.max)) {
            truePeakDbTp = tp.max;
          }
        } catch {
          truePeakDbTp = undefined;
        }
      }
      let detail: CursorReadoutPayload;
      if (onWaveformCanvas) {
        detail = {
          kind: "waveform",
          channelIndex,
          rms,
          peak,
          rmsWindowDurationSec,
          truePeakDbTp,
        };
      } else {
        const hz = AnalyzeService.spectrogramCursorYToHz(
          yn,
          rect.height,
          props.frequencyScale,
          props.minFrequency,
          props.maxFrequency,
        );
        detail = {
          kind: "spectrogram",
          channelIndex,
          rms,
          peak,
          frequencyHz: hz,
          rmsWindowDurationSec,
          truePeakDbTp,
        };
      }
      applyLocalHoverUi(detail, xn, yn);
      window.dispatchEvent(
        new CustomEvent<CursorReadoutPayload>(EventType.CURSOR_READOUT, {
          detail,
        }),
      );
    };
    const scheduleCursorReadout = (clientX: number, clientY: number) => {
      lastClientX = clientX;
      lastClientY = clientY;
      if (cursorReadoutRaf) {
        return;
      }
      cursorReadoutRaf = requestAnimationFrame(() => {
        cursorReadoutRaf = 0;
        publishCursorReadout();
      });
    };
    this._addEventlistener(
      userInputDiv,
      EventType.MOUSE_MOVE,
      (event: MouseEvent) => {
        scheduleCursorReadout(event.clientX, event.clientY);
      },
    );
    this._addEventlistener(userInputDiv, "mouseleave", () => {
      if (cursorReadoutRaf) {
        cancelAnimationFrame(cursorReadoutRaf);
        cursorReadoutRaf = 0;
      }
      applyLocalHoverUi({ kind: "clear" }, 0, 0);
      window.dispatchEvent(
        new CustomEvent<CursorReadoutPayload>(EventType.CURSOR_READOUT, {
          detail: { kind: "clear" },
        }),
      );
    });

    this._addEventlistener(
      userInputDiv,
      EventType.MOUSE_DOWN,
      (event: MouseEvent) => {
        /*
        apply selected range if isDrugging is already true.
        this condition occurs if user start dragging, move the mouse outside the figure, 
        release the mouse there, and then move the cursor over the figure again.
        */
        if (this.isDragging) {
          this.isDragging = false;
          if (this.selectionDiv) {
            componentRoot.removeChild(this.selectionDiv);
            this.selectionDiv = null;
          }
          const rect = userInputDiv.getBoundingClientRect();
          this.applySelectedRange(
            this.mouseDownX,
            this.mouseDownY,
            event.clientX,
            event.clientY,
            rect,
            onWaveformCanvas,
            settings,
            analyseSettingsService,
            analyzeService,
          );
          return;
        }

        this.mouseDownX = event.clientX;
        this.mouseDownY = event.clientY;

        // left click
        if (event.button === 0) {
          this.isDragging = true;
          // create a new div for the selection
          this.selectionDiv = document.createElement("div");
          this.selectionDiv.style.position = "absolute";
          this.selectionDiv.style.border = "1px solid red";
          this.selectionDiv.style.backgroundColor = "rgba(255, 0, 0, 0)";
          this.selectionDiv.style.pointerEvents = "none"; // to avoid interfering with the mouse events
          componentRoot.appendChild(this.selectionDiv);
          return;
        }

        // right click
        if (event.button === 2) {
          // reset the range to the default range
          if (event.ctrlKey) {
            // reset time axis only
            analyseSettingsService.resetToDefaultTimeRange();
          } else if (event.shiftKey) {
            // reset value axis only
            analyseSettingsService.resetToDefaultAmplitudeRange();
            analyseSettingsService.resetToDefaultFrequencyRange();
          } else {
            // reset both axes
            analyseSettingsService.resetToDefaultTimeRange();
            analyseSettingsService.resetToDefaultAmplitudeRange();
            analyseSettingsService.resetToDefaultFrequencyRange();
          }
          analyzeService.analyze();
        }
      },
    );

    this._addEventlistener(
      userInputDiv,
      EventType.CONTEXT_MENU,
      (event: MouseEvent) => {
        event.preventDefault();
      },
    );

    this._addEventlistener(
      userInputDiv,
      EventType.MOUSE_MOVE,
      (event: MouseEvent) => {
        if (!this.isDragging || !this.selectionDiv) {
          return;
        }
        this.currentX = event.clientX;
        this.currentY = event.clientY;
        this.drawSelectionDiv(userInputDiv);
      },
    );

    this._addEventlistener(
      userInputDiv,
      EventType.MOUSE_UP,
      (event: MouseEvent) => {
        if (!this.isDragging || !this.selectionDiv) {
          return;
        }
        this.isDragging = false;

        // Remove the selection div
        if (this.selectionDiv) {
          componentRoot.removeChild(this.selectionDiv);
          this.selectionDiv = null;
        }

        // calculate the position of the mouse up event
        const mouseUpX = event.clientX;
        const mouseUpY = event.clientY;
        const rect = userInputDiv.getBoundingClientRect();

        // treat as click if mouse moved less than threshold
        if (
          Math.abs(this.mouseDownX - mouseUpX) < 3 &&
          Math.abs(this.mouseDownY - mouseUpY) < 3
        ) {
          // set playback position marker (does not start playing)
          const clickProps = analyseSettingsService.toProps();
          const clickTrng = clickProps.maxTime - clickProps.minTime;
          if (clickTrng <= 0 || rect.width <= 0) {
            return;
          }
          const xPercentInFigureRange =
            ((mouseUpX - rect.left) / rect.width) * 100;
          const sec =
            (xPercentInFigureRange / 100) * clickTrng + clickProps.minTime;
          playerService.setPlaybackPosition(sec);
          return;
        }

        // treat as drag
        this.applySelectedRange(
          mouseUpX,
          mouseUpY,
          this.mouseDownX,
          this.mouseDownY,
          rect,
          onWaveformCanvas,
          settings,
          analyseSettingsService,
          analyzeService,
        );
      },
    );

    // When the control key or shift key is pressed, even if the mouse is not moving,
    // if the selectuionDiv already exists, update the selection range.
    this._addEventlistener(
      window,
      EventType.KEY_DOWN,
      (event: KeyboardEvent) => {
        if (!this.isDragging || !this.selectionDiv) {
          return;
        }
        // ignore if pressed keys are not ctrl or shift
        if (!event.ctrlKey && !event.shiftKey) {
          return;
        }
        if (event.ctrlKey) {
          this.isTimeAxisOnly = true;
          this.isValueAxisOnly = false;
        }
        if (event.shiftKey) {
          this.isTimeAxisOnly = false;
          this.isValueAxisOnly = true;
        }
        this.drawSelectionDiv(userInputDiv);
      },
    );

    // When the control key or shift key is released, update flags about selection range.
    this._addEventlistener(window, EventType.KEY_UP, (event: KeyboardEvent) => {
      // ignore if released keys are not ctrl or shift
      if (event.key !== "Shift" && event.key !== "Control") {
        return;
      }
      this.isTimeAxisOnly = false;
      this.isValueAxisOnly = false;

      if (this.isDragging && this.selectionDiv) {
        this.drawSelectionDiv(userInputDiv);
      }
    });
  }

  private drawSelectionDiv(userInputDiv: HTMLDivElement) {
    const rect = userInputDiv.getBoundingClientRect();

    // draw selection range
    // note: direction of y-axis is top to bottom
    if (this.isTimeAxisOnly) {
      // select time axis only
      this.selectionDiv.style.left =
        Math.min(this.mouseDownX, this.currentX) - rect.left + "px";
      this.selectionDiv.style.top = "0%";
      this.selectionDiv.style.width =
        Math.abs(this.mouseDownX - this.currentX) + "px";
      this.selectionDiv.style.height = "100%";
    } else if (this.isValueAxisOnly) {
      // select value axis only
      this.selectionDiv.style.left = "0%";
      this.selectionDiv.style.top =
        Math.min(this.mouseDownY, this.currentY) - rect.top + "px";
      this.selectionDiv.style.width = "100%";
      this.selectionDiv.style.height =
        Math.abs(this.mouseDownY - this.currentY) + "px";
    } else {
      // select both axes
      this.selectionDiv.style.left =
        Math.min(this.mouseDownX, this.currentX) - rect.left + "px";
      this.selectionDiv.style.top =
        Math.min(this.mouseDownY, this.currentY) - rect.top + "px";
      this.selectionDiv.style.width =
        Math.abs(this.mouseDownX - this.currentX) + "px";
      this.selectionDiv.style.height =
        Math.abs(this.mouseDownY - this.currentY) + "px";
    }
  }

  private applySelectedRange(
    mouseUpX: number,
    mouseUpY: number,
    mouseDownX: number,
    mouseDownY: number,
    rect: DOMRect,
    onWaveformCanvas: boolean,
    settings: AnalyzeSettingsProps,
    analyseSettingsService: AnalyzeSettingsService,
    analyzeService: AnalyzeService,
  ) {
    const minX = Math.min(mouseUpX, mouseDownX) - rect.left;
    const maxX = Math.max(mouseUpX, mouseDownX) - rect.left;
    const minY = Math.min(mouseUpY, mouseDownY) - rect.top;
    const maxY = Math.max(mouseUpY, mouseDownY) - rect.top;

    if (!this.isValueAxisOnly) {
      const timeRange = settings.maxTime - settings.minTime;
      const minTime = (minX / rect.width) * timeRange + settings.minTime;
      const maxTime = (maxX / rect.width) * timeRange + settings.minTime;
      analyseSettingsService.minTime = minTime;
      analyseSettingsService.maxTime = maxTime;
    }

    // note: direction of y-axis is top to bottom
    if (!this.isTimeAxisOnly) {
      if (onWaveformCanvas) {
        // WaveformCanvas
        const amplitudeRange = settings.maxAmplitude - settings.minAmplitude;
        const minAmplitude =
          (1 - maxY / rect.height) * amplitudeRange + settings.minAmplitude;
        const maxAmplitude =
          (1 - minY / rect.height) * amplitudeRange + settings.minAmplitude;
        analyseSettingsService.minAmplitude = minAmplitude;
        analyseSettingsService.maxAmplitude = maxAmplitude;
      } else {
        // SpectrogramCanvas
        let minFrequency, maxFrequency, frequencyRange;
        switch (settings.frequencyScale) {
          case FrequencyScale.Linear:
            frequencyRange = settings.maxFrequency - settings.minFrequency;
            minFrequency =
              (1 - maxY / rect.height) * frequencyRange + settings.minFrequency;
            maxFrequency =
              (1 - minY / rect.height) * frequencyRange + settings.minFrequency;
            break;
          case FrequencyScale.Log: {
            const bounds = piecewiseLogAxisBoundaries(
              settings.minFrequency,
              settings.maxFrequency,
            );
            const yNormLo = canvasYTopToLogPiecewiseYNorm(maxY, rect.height);
            const yNormHi = canvasYTopToLogPiecewiseYNorm(minY, rect.height);
            const hzA = piecewiseYNormToHz(yNormLo, bounds);
            const hzB = piecewiseYNormToHz(yNormHi, bounds);
            minFrequency = Math.min(hzA, hzB);
            maxFrequency = Math.max(hzA, hzB);
            break;
          }
          case FrequencyScale.Mel: {
            const melMin = AnalyzeService.hzToMel(settings.minFrequency);
            const melMax = AnalyzeService.hzToMel(settings.maxFrequency);
            const melSpan = melMax - melMin;
            minFrequency = AnalyzeService.melToHz(
              melMin + (1 - maxY / rect.height) * melSpan,
            );
            maxFrequency = AnalyzeService.melToHz(
              melMin + (1 - minY / rect.height) * melSpan,
            );
            break;
          }
        }
        analyseSettingsService.minFrequency = minFrequency;
        analyseSettingsService.maxFrequency = maxFrequency;
      }
    }

    // analyze
    analyzeService.analyze();
  }
}
