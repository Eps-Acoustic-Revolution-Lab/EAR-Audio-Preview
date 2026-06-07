import Component from "../../component";
import PlayerService from "../../services/playerService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import GoniometerComponent from "./goniometerComponent";
import SpectralAnalyzerComponent from "./spectralAnalyzerComponent";
import PhaseCorrelationSpectrumComponent from "./phaseCorrelationSpectrumComponent";

const minPaneHeight = 120;
const minPaneWidth = 100;
const gonioInfoBarPx = 20;

const gonioRowHtml = `
  <div class="liveAnalysis__gonioRow">
    <div class="goniometerPane" data-gonio-polar-mount></div>
    <div class="liveAnalysis__gonioColHandle" data-gonio-col-handle aria-hidden="true"></div>
    <div class="phaseCorrelationPane" data-gonio-phase-mount></div>
  </div>`;

type LiveAnalysisLayoutMode = "inline" | "overlay";

interface LiveAnalysisSplits {
  row: number;
  col: number;
}

/** Top row ~42% — leaves room for spectrum while keeping polar square-friendly. */
const defaultSplits: LiveAnalysisSplits = { row: 0.42, col: 0.34 };

export default class LiveAnalysisComponent extends Component {
  private _inner: HTMLElement;
  private _gonioWrap: HTMLElement;
  private _spectrumWrap: HTMLElement;
  private _rowHandle: HTMLElement;
  private _colHandle: HTMLElement;
  private _overlay: HTMLElement;
  private _overlayInner: HTMLElement;
  private _overlayGonioWrap: HTMLElement;
  private _overlaySpectrumWrap: HTMLElement;
  private _overlayRowHandle: HTMLElement;
  private _overlayColHandle: HTMLElement;

  private _goniometer: GoniometerComponent;
  private _phaseCorrelation: PhaseCorrelationSpectrumComponent;
  private _spectrum: SpectralAnalyzerComponent;
  private _overlayGoniometer: GoniometerComponent;
  private _overlayPhaseCorrelation: PhaseCorrelationSpectrumComponent;
  private _overlaySpectrum: SpectralAnalyzerComponent;

  private _inlineSplits: LiveAnalysisSplits = { ...defaultSplits };
  private _overlaySplits: LiveAnalysisSplits = { ...defaultSplits };
  private _draggingRow = false;
  private _draggingCol = false;

  constructor(
    containerEl: HTMLElement,
    playerService: PlayerService,
    analyzeSettingsService: AnalyzeSettingsService,
  ) {
    super();

    containerEl.innerHTML = `
      <div class="liveAnalysisComponent" id="liveAnalysisInner">
        <div class="liveAnalysis__goniometer" id="gonioWrap">${gonioRowHtml}</div>
        <div class="liveAnalysis__resizeHandle" id="liveResizeHandle" aria-hidden="true"></div>
        <div class="liveAnalysis__spectrum" id="spectrumWrap"></div>
      </div>
      <div class="liveAnalysis__overlay hidden" id="liveOverlay">
        <div class="liveAnalysisComponent liveAnalysisComponent--overlay" id="liveOverlayInner">
          <div class="liveAnalysis__goniometer" id="overlayGonioWrap">${gonioRowHtml}</div>
          <div class="liveAnalysis__resizeHandle" id="overlayHandle" aria-hidden="true"></div>
          <div class="liveAnalysis__spectrum" id="overlaySpectrumWrap"></div>
        </div>
      </div>`;

    this._inner = containerEl.querySelector("#liveAnalysisInner");
    this._gonioWrap = containerEl.querySelector("#gonioWrap");
    this._spectrumWrap = containerEl.querySelector("#spectrumWrap");
    this._rowHandle = containerEl.querySelector("#liveResizeHandle");
    this._colHandle = this._gonioWrap.querySelector(
      "[data-gonio-col-handle]",
    ) as HTMLElement;
    this._overlay = containerEl.querySelector("#liveOverlay");
    this._overlayInner = containerEl.querySelector("#liveOverlayInner");
    this._overlayGonioWrap = containerEl.querySelector("#overlayGonioWrap");
    this._overlaySpectrumWrap = containerEl.querySelector(
      "#overlaySpectrumWrap",
    );
    this._overlayRowHandle = containerEl.querySelector("#overlayHandle");
    this._overlayColHandle = this._overlayGonioWrap.querySelector(
      "[data-gonio-col-handle]",
    ) as HTMLElement;

    const polarMount = this._gonioWrap.querySelector(
      "[data-gonio-polar-mount]",
    ) as HTMLElement;
    const phaseMount = this._gonioWrap.querySelector(
      "[data-gonio-phase-mount]",
    ) as HTMLElement;
    const overlayPolarMount = this._overlayGonioWrap.querySelector(
      "[data-gonio-polar-mount]",
    ) as HTMLElement;
    const overlayPhaseMount = this._overlayGonioWrap.querySelector(
      "[data-gonio-phase-mount]",
    ) as HTMLElement;

    this._goniometer = this._register(
      new GoniometerComponent(
        polarMount,
        playerService,
        analyzeSettingsService,
      ),
    );
    this._phaseCorrelation = this._register(
      new PhaseCorrelationSpectrumComponent(
        phaseMount,
        playerService,
        analyzeSettingsService,
      ),
    );
    this._spectrum = this._register(
      new SpectralAnalyzerComponent(
        this._spectrumWrap,
        playerService,
        analyzeSettingsService,
      ),
    );
    this._overlayGoniometer = this._register(
      new GoniometerComponent(
        overlayPolarMount,
        playerService,
        analyzeSettingsService,
      ),
    );
    this._overlayPhaseCorrelation = this._register(
      new PhaseCorrelationSpectrumComponent(
        overlayPhaseMount,
        playerService,
        analyzeSettingsService,
      ),
    );
    this._overlaySpectrum = this._register(
      new SpectralAnalyzerComponent(
        this._overlaySpectrumWrap,
        playerService,
        analyzeSettingsService,
      ),
    );

    this._applyAllLayout();

    this._initRowResizeHandle(this._rowHandle, "inline");
    this._initRowResizeHandle(this._overlayRowHandle, "overlay");

    this._initColResizeHandle(this._colHandle, "inline");
    this._initColResizeHandle(this._overlayColHandle, "overlay");

    this._addEventlistener(this._inner, "contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      this._openOverlay();
    });
    this._addEventlistener(this._overlay, "contextmenu", (e: MouseEvent) => {
      e.preventDefault();
      this._closeOverlay();
    });
    this._addEventlistener(document, "keydown", (e: KeyboardEvent) => {
      if (e.code === "Escape" && !this._overlay.classList.contains("hidden")) {
        this._closeOverlay();
      }
    });

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        this._applyAllLayout();
      });
      ro.observe(this._inner);
      ro.observe(this._overlayInner);
      this._register({ dispose: () => ro.disconnect() });
    }
  }

  private _splitsFor(mode: LiveAnalysisLayoutMode): LiveAnalysisSplits {
    return mode === "overlay" ? this._overlaySplits : this._inlineSplits;
  }

  private _applyAllLayout() {
    this._applyRowSplit("inline");
    this._applyGonioColSplit("inline");
    this._applyRowSplit("overlay");
    this._applyGonioColSplit("overlay");
  }

  private _applyRowSplit(mode: LiveAnalysisLayoutMode) {
    const splits = this._splitsFor(mode);
    if (mode === "inline") {
      const gonioH = this._inlineGonioHeight(splits);
      if (gonioH === null) {
        return;
      }
      this._gonioWrap.style.height = `${gonioH}px`;
      this._gonioWrap.style.flex = "0 0 auto";
      return;
    }

    const total = this._overlayInner?.clientHeight ?? 600;
    const handleH = this._overlayRowHandle.offsetHeight;
    const available = total - handleH;
    const gonioH = Math.max(
      minPaneHeight,
      Math.min(available - minPaneHeight, splits.row * available),
    );
    this._overlayGonioWrap.style.height = `${gonioH}px`;
    this._overlayGonioWrap.style.flex = "0 0 auto";
  }

  /** Inline top-row height sized so polar plot can be square (no letterboxing). */
  private _inlineGonioHeight(splits: LiveAnalysisSplits): number | null {
    const total = this._inner?.clientHeight ?? 300;
    const totalW = this._inner?.clientWidth ?? 400;
    const handleH = this._rowHandle.offsetHeight;
    const availableH = total - handleH;
    if (availableH <= minPaneHeight * 2) {
      return null;
    }

    const handleW = this._colHandle?.offsetWidth ?? 4;
    const availableW = Math.max(0, totalW - handleW);
    const targetPolarW = Math.max(
      minPaneWidth,
      splits.col * availableW,
    );
    const rowBudget = splits.row * availableH - gonioInfoBarPx;
    let squareSide = Math.max(
      minPaneWidth,
      Math.min(targetPolarW, rowBudget),
    );
    let gonioH = Math.max(
      minPaneHeight,
      Math.min(availableH - minPaneHeight, squareSide + gonioInfoBarPx),
    );
    squareSide = Math.max(
      minPaneWidth,
      Math.min(targetPolarW, gonioH - gonioInfoBarPx),
    );
    gonioH = Math.max(
      minPaneHeight,
      Math.min(availableH - minPaneHeight, squareSide + gonioInfoBarPx),
    );
    return gonioH;
  }

  private _applyGonioColSplit(mode: LiveAnalysisLayoutMode) {
    const splits = this._splitsFor(mode);
    const gonioWrap =
      mode === "inline" ? this._gonioWrap : this._overlayGonioWrap;
    const colHandle =
      mode === "inline" ? this._colHandle : this._overlayColHandle;
    const row = gonioWrap.querySelector(
      ".liveAnalysis__gonioRow",
    ) as HTMLElement | null;
    const polar = gonioWrap.querySelector(
      "[data-gonio-polar-mount]",
    ) as HTMLElement | null;
    const phase = gonioWrap.querySelector(
      "[data-gonio-phase-mount]",
    ) as HTMLElement | null;
    if (!row || !polar || !phase) {
      return;
    }

    const handleW = colHandle?.offsetWidth ?? 4;
    const available = Math.max(0, row.clientWidth - handleW);
    if (available <= minPaneWidth * 2) {
      return;
    }

    const targetPolarW = Math.max(
      minPaneWidth,
      Math.min(available - minPaneWidth, splits.col * available),
    );
    const rowH = row.clientHeight;
    const squareSide = Math.max(
      minPaneWidth,
      Math.min(targetPolarW, Math.max(0, rowH - gonioInfoBarPx)),
    );
    polar.style.flex = `0 0 ${squareSide}px`;
    phase.style.flex = "1 1 0";
    polar.style.setProperty("--gonio-square-px", `${squareSide}px`);
  }

  private _initRowResizeHandle(
    handle: HTMLElement,
    mode: LiveAnalysisLayoutMode,
  ) {
    this._addEventlistener(handle, "mousedown", (e: MouseEvent) => {
      e.preventDefault();
      this._draggingRow = true;
      const splits = this._splitsFor(mode);
      const parent = handle.parentElement;
      if (!parent) {
        return;
      }
      const onMove = (mv: MouseEvent) => {
        if (!this._draggingRow) {
          return;
        }
        const rect = parent.getBoundingClientRect();
        const y = mv.clientY - rect.top;
        const handleH = handle.offsetHeight;
        const available = rect.height - handleH;
        if (available <= minPaneHeight * 2) {
          return;
        }
        splits.row = Math.max(
          minPaneHeight / available,
          Math.min(1 - minPaneHeight / available, y / available),
        );
        this._applyRowSplit(mode);
        this._applyGonioColSplit(mode);
      };
      const onUp = () => {
        this._draggingRow = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  private _initColResizeHandle(
    handle: HTMLElement,
    mode: LiveAnalysisLayoutMode,
  ) {
    this._addEventlistener(handle, "mousedown", (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this._draggingCol = true;
      const splits = this._splitsFor(mode);
      const gonioWrap =
        mode === "inline" ? this._gonioWrap : this._overlayGonioWrap;
      const row = gonioWrap.querySelector(
        ".liveAnalysis__gonioRow",
      ) as HTMLElement;
      const onMove = (mv: MouseEvent) => {
        if (!this._draggingCol) {
          return;
        }
        const rect = row.getBoundingClientRect();
        const handleW = handle.offsetWidth;
        const available = rect.width - handleW;
        if (available <= minPaneWidth * 2) {
          return;
        }
        const x = mv.clientX - rect.left;
        splits.col = Math.max(
          minPaneWidth / available,
          Math.min(1 - minPaneWidth / available, x / available),
        );
        this._applyGonioColSplit(mode);
      };
      const onUp = () => {
        this._draggingCol = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  private _openOverlay() {
    this._overlay.classList.remove("hidden");
    this._applyRowSplit("overlay");
    this._applyGonioColSplit("overlay");
  }

  private _closeOverlay() {
    this._overlay.classList.add("hidden");
  }
}
