import { EventType } from "../../events";
import Component from "../../component";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import {
  monitorBandCount,
  monitorBandSoloBypassActive,
  type LiveMonitoringMode,
} from "../../utils/liveMonitoring";
import type HeadphoneEqSettingsService from "../../services/headphoneEqSettingsService";
import EqMonitorStripComponent from "./eqMonitorStripComponent";

export default class LiveMonitoringBarComponent extends Component {
  constructor(
    rootSelector: string,
    analyzeSettingsService: AnalyzeSettingsService,
    headphoneEqSettings?: HeadphoneEqSettingsService,
    onOpenCurveCorrection?: () => void,
  ) {
    super();
    const root = document.querySelector(rootSelector) as HTMLElement;
    if (!root) {
      return;
    }

    const bandLabels = ["SUB", "LOW", "LOW-MID", "HIGH-MID", "HIGH"];

    root.innerHTML = `
      <div class="liveMonitoringBar" role="toolbar" aria-label="Live monitoring">
        <div class="liveMonitoringBar__core">
          <span class="liveMonitoringBar__label">Monitor</span>
          <button type="button" class="earEqPill js-lm-mode js-lm-lr" title="Stereo">LR</button>
          <button type="button" class="earEqPill js-lm-mode js-lm-swap-mode" title="Stereo, left/right outputs swapped">SW⇄LR</button>
          <button type="button" class="earEqPill js-lm-mode js-lm-l" title="Solo L">L</button>
          <button type="button" class="earEqPill js-lm-mode js-lm-r" title="Solo R">R</button>
          <button type="button" class="earEqPill js-lm-mode js-lm-m" title="Mid">M</button>
          <button type="button" class="earEqPill js-lm-mode js-lm-s" title="Side">S</button>
          <div class="liveMonitoringBar__bands" role="group" aria-label="Monitor band solo">${bandLabels
            .map(
              (_, i) =>
                `<button type="button" class="earEqPill js-lm-band" data-band="${i}" title="Band ${i + 1}">${bandLabels[i]}</button>`,
            )
            .join("")}
            <button type="button" class="earEqPill js-lm-bands-reset" title="Clear band solo (full bandwidth)">RESET</button>
          </div>
        </div>
        <div id="eqMonitorStripMount" class="liveMonitoringBar__eqStrip"></div>
      </div>`;

    const setModeActive = (mode: LiveMonitoringMode) => {
      for (const b of root.querySelectorAll<HTMLButtonElement>(".js-lm-mode")) {
        b.classList.remove("earEqPill--active");
      }
      const map: Record<LiveMonitoringMode, string> = {
        lr: ".js-lm-lr",
        swap: ".js-lm-swap-mode",
        l: ".js-lm-l",
        r: ".js-lm-r",
        m: ".js-lm-m",
        s: ".js-lm-s",
      };
      root.querySelector(map[mode])?.classList.add("earEqPill--active");
    };

    const syncBands = () => {
      const mask = analyzeSettingsService.monitorBandSoloMask;
      const bypass = monitorBandSoloBypassActive(mask);
      for (let i = 0; i < monitorBandCount; i++) {
        const btn = root.querySelector(
          `.js-lm-band[data-band="${i}"]`,
        ) as HTMLButtonElement | null;
        if (!btn) {
          continue;
        }
        const lit = !bypass && ((mask >> i) & 1) !== 0;
        btn.classList.toggle("earEqPill--active", lit);
      }
    };

    setModeActive(analyzeSettingsService.liveMonitoringMode);
    syncBands();

    const wireMode = (sel: string, mode: LiveMonitoringMode) => {
      const btn = root.querySelector(sel) as HTMLButtonElement;
      this._addEventlistener(btn, EventType.CLICK, () => {
        analyzeSettingsService.liveMonitoringMode = mode;
      });
    };
    wireMode(".js-lm-lr", "lr");
    wireMode(".js-lm-swap-mode", "swap");
    wireMode(".js-lm-l", "l");
    wireMode(".js-lm-r", "r");
    wireMode(".js-lm-m", "m");
    wireMode(".js-lm-s", "s");

    const resetBandsBtn = root.querySelector(
      ".js-lm-bands-reset",
    ) as HTMLButtonElement;
    this._addEventlistener(resetBandsBtn, EventType.CLICK, () => {
      analyzeSettingsService.resetMonitorBandSolo();
    });

    for (let i = 0; i < monitorBandCount; i++) {
      const btn = root.querySelector(
        `.js-lm-band[data-band="${i}"]`,
      ) as HTMLButtonElement;
      this._addEventlistener(btn, EventType.CLICK, () => {
        analyzeSettingsService.toggleMonitorBandSolo(i);
      });
    }

    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_LIVE_MONITORING_MODE,
      (e: CustomEvent<{ value: LiveMonitoringMode }>) => {
        setModeActive(e.detail.value);
      },
    );
    this._addEventlistener(
      analyzeSettingsService,
      EventType.AS_UPDATE_MONITOR_BAND_SOLO_MASK,
      () => syncBands(),
    );

    if (headphoneEqSettings && onOpenCurveCorrection) {
      const eqStrip = new EqMonitorStripComponent(
        "#eqMonitorStripMount",
        headphoneEqSettings,
        onOpenCurveCorrection,
      );
      this._disposables.push(eqStrip);
    }
  }
}
