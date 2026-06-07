import "./playerSettingsComponent.css";
import Component from "../../component";
import { EventType } from "../../events";
import PlayerSettingsService from "../../services/playerSettingsService";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";

export default class PlayerSettingsComponent extends Component {
  private _componentRoot: HTMLElement;
  private _playerSettingsService: PlayerSettingsService;
  private _analyzeService: AnalyzeService;
  private _analyzeSettingService: AnalyzeSettingsService;

  constructor(
    componentRootSelector: string,
    playerSettingsService: PlayerSettingsService,
    analyzeService: AnalyzeService,
    analyzeSettingService: AnalyzeSettingsService,
  ) {
    super();
    this._componentRoot = document.querySelector(componentRootSelector);
    this._playerSettingsService = playerSettingsService;
    this._analyzeService = analyzeService;
    this._analyzeSettingService = analyzeSettingService;

    this._componentRoot.innerHTML = `
    <div class="playerSetting">
      <div class="panelGroup">
        <h3 class="panelGroup__title">Playback</h3>
        <div class="panelGroup__items">
          <div class="panelGroup panelGroup--nested">
            <h4 class="panelGroup__title panelGroup__title--sub">Filters</h4>
            <div class="panelGroup__items">
              <div class="panelRow">
                <span class="panelRow__label">High-pass</span>
                <div class="panelRow__control">
                  <input class="js-playerSetting-enableHpf" type="checkbox">
                  <span class="panelRow__field"><input class="js-playerSetting-hpfFrequency" type="number" min="10" max="100000" step="10"><span class="panelRow__suffix">Hz</span></span>
                </div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Low-pass</span>
                <div class="panelRow__control">
                  <input class="js-playerSetting-enableLpf" type="checkbox">
                  <span class="panelRow__field"><input class="js-playerSetting-lpfFrequency" type="number" min="10" max="100000" step="10"><span class="panelRow__suffix">Hz</span></span>
                </div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Match spectrogram range</span>
                <div class="panelRow__control">
                  <input class="js-playerSetting-matchFilterFrequencyToSpectrogram" type="checkbox">
                </div>
              </div>
            </div>
          </div>

          <div class="panelGroup panelGroup--nested">
            <h4 class="panelGroup__title panelGroup__title--sub">Hearing protection</h4>
            <p class="playerSetting__muted">Mutes playback when the level meter peak exceeds the limit. Uses the same dBFS peak readout as the level meter column.</p>
            <div class="panelGroup__items">
              <div class="panelRow">
                <span class="panelRow__label">Enable</span>
                <div class="panelRow__control">
                  <input class="js-playerSetting-hearingProtectionEnabled" type="checkbox">
                </div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Peak limit (dBFS)</span>
                <div class="panelRow__control panelRow__control--range">
                  <input class="js-playerSetting-hearingProtectionPeakDbFs" type="range" min="${AnalyzeSettingsService.HEARING_PROTECTION_PEAK_DBFS_MIN}" max="${AnalyzeSettingsService.HEARING_PROTECTION_PEAK_DBFS_MAX}" step="0.5">
                  <span class="panelRow__value js-playerSetting-hearingProtectionPeakDbFsLabel"></span>
                </div>
              </div>
            </div>
          </div>

          <div class="panelGroup panelGroup--nested">
            <h4 class="panelGroup__title panelGroup__title--sub">Monitor band edges</h4>
            <p class="playerSetting__muted">Six ascending crossover frequencies (Hz). Band&nbsp;i listens to [edge<sub>i</sub>, edge<sub>i+1</sub>]. Applies to live playback monitoring only.</p>
            <div class="panelGroup__items playerSetting__monitorEdges">
              <div class="panelRow">
                <span class="panelRow__label">Edge 1</span>
                <div class="panelRow__control"><span class="panelRow__field"><input class="js-monitorBand-edge-0" type="number" min="10" step="1"><span class="panelRow__suffix">Hz</span></span></div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Edge 2</span>
                <div class="panelRow__control"><span class="panelRow__field"><input class="js-monitorBand-edge-1" type="number" min="10" step="1"><span class="panelRow__suffix">Hz</span></span></div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Edge 3</span>
                <div class="panelRow__control"><span class="panelRow__field"><input class="js-monitorBand-edge-2" type="number" min="10" step="1"><span class="panelRow__suffix">Hz</span></span></div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Edge 4</span>
                <div class="panelRow__control"><span class="panelRow__field"><input class="js-monitorBand-edge-3" type="number" min="10" step="1"><span class="panelRow__suffix">Hz</span></span></div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Edge 5</span>
                <div class="panelRow__control"><span class="panelRow__field"><input class="js-monitorBand-edge-4" type="number" min="10" step="1"><span class="panelRow__suffix">Hz</span></span></div>
              </div>
              <div class="panelRow">
                <span class="panelRow__label">Upper</span>
                <div class="panelRow__control"><span class="panelRow__field"><input class="js-monitorBand-edge-5" type="number" min="10" step="1"><span class="panelRow__suffix">Hz</span></span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    `;

    this.initPlayerSettingUI();
    this.initHearingProtectionUI();
    this.initMonitorBandEdgesUI();
  }

  private initHearingProtectionUI(): void {
    const as = this._analyzeSettingService;
    const enabledInput = this._componentRoot.querySelector(
      ".js-playerSetting-hearingProtectionEnabled",
    ) as HTMLInputElement;
    const peakInput = this._componentRoot.querySelector(
      ".js-playerSetting-hearingProtectionPeakDbFs",
    ) as HTMLInputElement;
    const peakLabel = this._componentRoot.querySelector(
      ".js-playerSetting-hearingProtectionPeakDbFsLabel",
    ) as HTMLElement;

    const syncPeak = () => {
      const db = as.hearingProtectionPeakDbFs;
      peakLabel.textContent = db > 0 ? `+${db.toFixed(1)}` : db.toFixed(1);
      peakInput.value = String(db);
      peakInput.disabled = !enabledInput.checked;
    };

    enabledInput.checked = as.hearingProtectionEnabled;
    syncPeak();

    this._addEventlistener(enabledInput, EventType.CHANGE, () => {
      as.hearingProtectionEnabled = enabledInput.checked;
      syncPeak();
    });
    this._addEventlistener(peakInput, EventType.INPUT, () => {
      as.hearingProtectionPeakDbFs = Number(peakInput.value);
      syncPeak();
    });
    this._addEventlistener(
      as,
      EventType.AS_UPDATE_HEARING_PROTECTION_ENABLED,
      (e: CustomEventInit<{ value: boolean }>) => {
        enabledInput.checked = e.detail.value;
        syncPeak();
      },
    );
    this._addEventlistener(
      as,
      EventType.AS_UPDATE_HEARING_PROTECTION_PEAK_DBFS,
      (e: CustomEventInit<{ value: number }>) => {
        const db = e.detail.value;
        peakInput.value = String(db);
        peakLabel.textContent = db > 0 ? `+${db.toFixed(1)}` : db.toFixed(1);
      },
    );
  }

  private initPlayerSettingUI() {
    const settings = this._playerSettingsService;

    // init enable high-pass filter checkbox
    const enableHpfInput = this._componentRoot.querySelector(
      ".js-playerSetting-enableHpf",
    ) as HTMLInputElement;
    enableHpfInput.checked = settings.enableHpf;
    this._addEventlistener(enableHpfInput, EventType.CHANGE, () => {
      settings.enableHpf = enableHpfInput.checked;
    });
    this._addEventlistener(
      settings,
      EventType.PS_UPDATE_ENABLE_HPF,
      (e: CustomEventInit) => {
        enableHpfInput.checked = e.detail.value;
      },
    );

    // init high-pass filter frequency input
    const hpfFrequencyInput = this._componentRoot.querySelector(
      ".js-playerSetting-hpfFrequency",
    ) as HTMLInputElement;
    hpfFrequencyInput.value = `${settings.hpfFrequency}`;
    this._addEventlistener(hpfFrequencyInput, EventType.CHANGE, () => {
      settings.hpfFrequency = Number(hpfFrequencyInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.PS_UPDATE_HPF_FREQUENCY,
      (e: CustomEventInit) => {
        hpfFrequencyInput.value = `${e.detail.value}`;
      },
    );

    // init enable low-pass filter checkbox
    const enableLpfInput = this._componentRoot.querySelector(
      ".js-playerSetting-enableLpf",
    ) as HTMLInputElement;
    enableLpfInput.checked = settings.enableLpf;
    this._addEventlistener(enableLpfInput, EventType.CHANGE, () => {
      settings.enableLpf = enableLpfInput.checked;
    });
    this._addEventlistener(
      settings,
      EventType.PS_UPDATE_ENABLE_LPF,
      (e: CustomEventInit) => {
        enableLpfInput.checked = e.detail.value;
      },
    );

    // init low-pass filter frequency input
    const lpfFrequencyInput = this._componentRoot.querySelector(
      ".js-playerSetting-lpfFrequency",
    ) as HTMLInputElement;
    lpfFrequencyInput.value = `${settings.lpfFrequency}`;
    this._addEventlistener(lpfFrequencyInput, EventType.CHANGE, () => {
      settings.lpfFrequency = Number(lpfFrequencyInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.PS_UPDATE_LPF_FREQUENCY,
      (e: CustomEventInit) => {
        lpfFrequencyInput.value = `${e.detail.value}`;
      },
    );

    // init match filter frequency checkbox
    const matchFilterFrequencyToSpectrogramInput =
      this._componentRoot.querySelector(
        ".js-playerSetting-matchFilterFrequencyToSpectrogram",
      ) as HTMLInputElement;
    matchFilterFrequencyToSpectrogramInput.checked =
      settings.matchFilterFrequencyToSpectrogram;
    hpfFrequencyInput.readOnly = settings.matchFilterFrequencyToSpectrogram;
    lpfFrequencyInput.readOnly = settings.matchFilterFrequencyToSpectrogram;
    this._addEventlistener(
      matchFilterFrequencyToSpectrogramInput,
      EventType.CHANGE,
      () => {
        hpfFrequencyInput.readOnly =
          matchFilterFrequencyToSpectrogramInput.checked;
        lpfFrequencyInput.readOnly =
          matchFilterFrequencyToSpectrogramInput.checked;
        settings.matchFilterFrequencyToSpectrogram =
          matchFilterFrequencyToSpectrogramInput.checked;

        if (matchFilterFrequencyToSpectrogramInput.checked) {
          hpfFrequencyInput.value = `${this._analyzeSettingService.minFrequency}`;
          lpfFrequencyInput.value = `${this._analyzeSettingService.maxFrequency}`;
          settings.hpfFrequency = Number(hpfFrequencyInput.value);
          settings.lpfFrequency = Number(lpfFrequencyInput.value);
        }
      },
    );
    this._addEventlistener(
      settings,
      EventType.PS_UPDATE_MATCH_FILTER_FREQUENCY_TO_SPECTROGRAM,
      (e: CustomEventInit) => {
        matchFilterFrequencyToSpectrogramInput.checked = e.detail.value;
      },
    );

    this._addEventlistener(this._analyzeService, EventType.ANALYZE, () => {
      if (matchFilterFrequencyToSpectrogramInput.checked) {
        hpfFrequencyInput.value = `${this._analyzeSettingService.minFrequency}`;
        settings.hpfFrequency = Number(hpfFrequencyInput.value);

        lpfFrequencyInput.value = `${this._analyzeSettingService.maxFrequency}`;
        settings.lpfFrequency = Number(lpfFrequencyInput.value);
      }
    });
  }

  private initMonitorBandEdgesUI(): void {
    const as = this._analyzeSettingService;
    const inputs = [0, 1, 2, 3, 4, 5].map(
      (i) =>
        this._componentRoot.querySelector(
          `.js-monitorBand-edge-${i}`,
        ) as HTMLInputElement,
    );

    const sync = (): void => {
      const nyquist = Math.max(11, Math.floor(as.sampleRate / 2));
      const e = as.monitorBandEdgesHz;
      inputs.forEach((inp, idx) => {
        inp.min = "10";
        inp.max = String(nyquist);
        inp.step = "1";
        inp.value =
          typeof e[idx] === "number" && Number.isFinite(e[idx])
            ? String(Math.round(e[idx] * 1000) / 1000)
            : "";
      });
    };

    sync();

    const push = (): void => {
      const vals = inputs.map((inp) => Number(inp.value));
      as.monitorBandEdgesHz = vals;
      sync();
    };

    for (const inp of inputs) {
      this._addEventlistener(inp, EventType.CHANGE, push);
    }
    this._addEventlistener(as, EventType.AS_UPDATE_MONITOR_BAND_EDGES, sync);
  }
}
