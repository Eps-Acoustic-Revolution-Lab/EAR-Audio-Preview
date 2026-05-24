import "./analyzeSettingsComponent.css";
import Component from "../../component";
import { EventType } from "../../events";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService, {
  AnalyzeSettingsProps,
  FftBackend,
  WindowType,
} from "../../services/analyzeSettingsService";
import {
  formatReleaseDbPerSecLabel,
  liveReleaseDbpsMax,
  liveReleaseDbpsMin,
  liveSpectrumPeakHoldSecMax,
  liveSpectrumPeakHoldSecMin,
} from "../../utils/liveBallistics";

export default class AnalyzeSettingsComponent extends Component {
  private _componentRoot: HTMLElement;
  private _analyzeService: AnalyzeService;
  private _analyzeSettingsService: AnalyzeSettingsService;

  constructor(
    componentRootSelector: string,
    analyzeService: AnalyzeService,
    analyzeSettingsService: AnalyzeSettingsService,
  ) {
    super();
    this._componentRoot = document.querySelector(componentRootSelector);
    this._analyzeService = analyzeService;
    this._analyzeSettingsService = analyzeSettingsService;

    this._componentRoot.innerHTML = `
    <div class="analyzeSetting">
      <div class="workspacePaneSection workspacePaneSection--stft">
      <h3>Common Settings</h3>
      <div>
          time range:
          <input class="analyzeSetting__input js-analyzeSetting-minTime" type="number" step="0.1">s ~
          <input class="analyzeSetting__input js-analyzeSetting-maxTime" type="number" step="0.1">s
      </div>

      <h3>WaveForm Settings</h3>
      <div>
          <input class="js-analyzeSetting-waveformVisible" type="checkbox">visible
      </div>
      <div>
          waveform amplitude range:
          <input class="analyzeSetting__input js-analyzeSetting-minAmplitude" type="number" step="0.1"> ~
          <input class="analyzeSetting__input js-analyzeSetting-maxAmplitude" type="number" step="0.1">
      </div>

      <h3>Spectrogram Settings</h3>
      <div>
          <input class="js-analyzeSetting-spectrogramVisible" type="checkbox">visible
      </div>
      <div>
          <input class="js-analyzeSetting-highResolutionSpectrogram" type="checkbox">high-resolution spectrogram (larger canvas, sharper)
      </div>
      <div>
          window size:
          <select class="analyzeSetting__select js-analyzeSetting-windowSize">
              <option value="auto" class="js-analyzeSetting-windowSize-autoOpt">Auto</option>
              <option value="0">256</option>
              <option value="1">512</option>
              <option value="2">1024</option>
              <option value="3">2048</option>
              <option value="4">4096</option>
              <option value="5">8192</option>
              <option value="6">16384</option>
              <option value="7">32768</option>
          </select>
          window type:
          <select class="analyzeSetting__select js-analyzeSetting-windowType">
              <option value="0">Hann</option>
              <option value="1">Hamming</option>
              <option value="2">Blackman-Harris</option>
              <option value="3">Triangular</option>
          </select>
          FFT backend:
          <select class="analyzeSetting__select js-analyzeSetting-fftBackend">
              <option value="0">Ooura (faster)</option>
              <option value="1">Essentia WASM (multi-window)</option>
          </select>
      </div>
      <div>
          frequency scale:
          <select class="analyzeSetting__select js-analyzeSetting-frequencyScale">
              <option value="0">Linear</option>
              <option value="1">Log</option>
              <option value="2">Mel</option>
          </select>
          mel filter num:
          <input class="analyzeSetting__input js-analyzeSetting-melFilterNum" type="number" step="10">
      </div>
      <div>
          frequency range:
          <input class="analyzeSetting__input js-analyzeSetting-minFrequency" type="number" step="1000">Hz ~
          <input class="analyzeSetting__input js-analyzeSetting-maxFrequency" type="number" step="1000">Hz
      </div>
      <div>
      <div>
          spectrogram amplitude range:
              <input class="analyzeSetting__input js-analyzeSetting-spectrogramAmplitudeLow" type="number" step="10">dB ~
              <input class="analyzeSetting__input js-analyzeSetting-spectrogramAmplitudeHigh" type="number" step="10">dB
          </div>
          <div>
              color:
              <canvas class="analyzeSetting__canvas js-analyzeSetting-spectrogramColorAxis" width="800px" height="40px"></canvas>
              <canvas class="analyzeSetting__canvas js-analyzeSetting-spectrogramColor" width="100px" height="5px"></canvas>
          </div>
      </div>
      </div>

      <div class="workspacePaneSection workspacePaneSection--live">
      <h3>Live spectrum</h3>
      <div>
          Live FFT Size:
          <select class="analyzeSetting__select js-analyzeSetting-liveAnalysisFftSize">
              <option value="512">512</option>
              <option value="1024">1024</option>
              <option value="2048">2048</option>
              <option value="4096">4096</option>
          </select>
      </div>
      <div>
          Sound field mode:
          <select class="analyzeSetting__select js-analyzeSetting-liveSoundFieldMode">
              <option value="polarSample">Polar Sample</option>
              <option value="polarLevel">Polar Level</option>
              <option value="lissajous">Lissajous</option>
          </select>
      </div>
      <div>
          Polar Level gate (% of peak, 0 = off):
          <input class="analyzeSetting__input js-analyzeSetting-livePolarLevelGatePct" type="range" min="0" max="100" step="1">
          <span class="js-analyzeSetting-livePolarLevelGatePctLabel"></span>
      </div>
      <div>
          Polar Sample radius gamma:
          <input class="analyzeSetting__input js-analyzeSetting-livePolarSampleRadiusGamma" type="range" min="0.5" max="2" step="0.05">
          <span class="js-analyzeSetting-livePolarSampleRadiusGammaLabel"></span>
      </div>
      <div>
          Polar Sample fill brightness (%):
          <input class="analyzeSetting__input js-analyzeSetting-livePolarSampleFillBrightnessPct" type="range" min="0" max="50" step="1">
          <span class="js-analyzeSetting-livePolarSampleFillBrightnessPctLabel"></span>
      </div>
      <div>
          Sound field release (dB/s):
          <input class="analyzeSetting__input js-analyzeSetting-livePolarFieldReleaseDbPerSec" type="range" min="${liveReleaseDbpsMin}" max="${liveReleaseDbpsMax}" step="0.5">
          <span class="js-analyzeSetting-livePolarFieldReleaseDbPerSecLabel"></span>
      </div>
      <div>
          Spectrum release (dB/s):
          <input class="analyzeSetting__input js-analyzeSetting-liveSpectrumReleaseDbPerSec" type="range" min="${liveReleaseDbpsMin}" max="${liveReleaseDbpsMax}" step="0.5">
          <span class="js-analyzeSetting-liveSpectrumReleaseDbPerSecLabel"></span>
      </div>
      <div>
          Spectrum peak hold (s):
          <input class="analyzeSetting__input js-analyzeSetting-liveSpectrumPeakHoldSec" type="range" min="${liveSpectrumPeakHoldSecMin}" max="${liveSpectrumPeakHoldSecMax}" step="0.05">
          <span class="js-analyzeSetting-liveSpectrumPeakHoldSecLabel"></span>
      </div>
      <div>
          Level meter release (dB/s):
          <input class="analyzeSetting__input js-analyzeSetting-liveLevelMeterReleaseDbPerSec" type="range" min="${liveReleaseDbpsMin}" max="${liveReleaseDbpsMax}" step="0.5">
          <span class="js-analyzeSetting-liveLevelMeterReleaseDbPerSecLabel"></span>
      </div>
      <div>
          Live spectrum tilt (dB/oct @ 1 kHz, roll-off toward HF):
          <select class="analyzeSetting__select js-analyzeSetting-liveSpectrumTilt">
              <option value="0">Off</option>
              <option value="1.5">Roll 1.5</option>
              <option value="3">Roll 3</option>
              <option value="4.5">Roll 4.5</option>
              <option value="6">Roll 6</option>
          </select>
      </div>
      </div>

      <div class="workspacePaneSection workspacePaneSection--edit">
      <p class="workspacePaneSection__editHint">Edit &amp; export options will appear here.</p>
      </div>
    </div>
    `;

    this.initAnalyzerSettingUI();
  }

  private initAnalyzerSettingUI() {
    const settings = this._analyzeSettingsService;

    // init waveform visible checkbox
    const waveformVisible = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-waveformVisible")
    );
    waveformVisible.checked = settings.waveformVisible;
    this._addEventlistener(waveformVisible, EventType.CHANGE, () => {
      settings.waveformVisible = waveformVisible.checked;
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_WAVEFORM_VISIBLE,
      (e: CustomEventInit) => {
        waveformVisible.checked = e.detail.value;
      },
    );

    // init spectrogram visible checkbox
    const spectrogramVisible = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-spectrogramVisible")
    );
    spectrogramVisible.checked = settings.spectrogramVisible;
    this._addEventlistener(spectrogramVisible, EventType.CHANGE, () => {
      settings.spectrogramVisible = spectrogramVisible.checked;
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_SPECTROGRAM_VISIBLE,
      (e: CustomEventInit) => {
        spectrogramVisible.checked = e.detail.value;
      },
    );

    const highResolutionSpectrogram = <HTMLInputElement>(
      this._componentRoot.querySelector(
        ".js-analyzeSetting-highResolutionSpectrogram",
      )
    );
    highResolutionSpectrogram.checked = settings.highResolutionSpectrogram;
    this._addEventlistener(highResolutionSpectrogram, EventType.CHANGE, () => {
      settings.highResolutionSpectrogram = highResolutionSpectrogram.checked;
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_HIGH_RESOLUTION_SPECTROGRAM,
      (e: CustomEventInit) => {
        highResolutionSpectrogram.checked = e.detail.value;
      },
    );

    // init fft window size index select
    const windowSizeSelect = <HTMLSelectElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-windowSize")
    );
    const syncWindowSizeSelectUi = () => {
      const opt = windowSizeSelect.querySelector<HTMLOptionElement>(
        ".js-analyzeSetting-windowSize-autoOpt",
      );
      if (opt) {
        opt.textContent = settings.fftWindowAuto
          ? `Auto (${settings.inferredAutoWindowSamples})`
          : "Auto";
      }
      if (settings.fftWindowAuto) {
        windowSizeSelect.value = "auto";
      } else {
        windowSizeSelect.value = String(settings.windowSizeIndex);
      }
    };
    syncWindowSizeSelectUi();
    this._addEventlistener(windowSizeSelect, EventType.CHANGE, () => {
      const v = windowSizeSelect.value;
      if (v === "auto") {
        settings.fftWindowAuto = true;
      } else {
        settings.fftWindowAuto = false;
        settings.windowSizeIndex = Number(v);
      }
      syncWindowSizeSelectUi();
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_WINDOW_SIZE_INDEX,
      () => {
        syncWindowSizeSelectUi();
      },
    );
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_FFT_WINDOW_AUTO,
      () => {
        syncWindowSizeSelectUi();
      },
    );
    this._addEventlistener(settings, EventType.AS_UPDATE_MIN_TIME, () => {
      syncWindowSizeSelectUi();
    });
    this._addEventlistener(settings, EventType.AS_UPDATE_MAX_TIME, () => {
      syncWindowSizeSelectUi();
    });

    // init window type select
    const windowTypeSelect = <HTMLSelectElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-windowType")
    );
    windowTypeSelect.selectedIndex = settings.windowType;
    this._addEventlistener(windowTypeSelect, EventType.CHANGE, () => {
      settings.windowType = Number(
        windowTypeSelect.selectedIndex,
      ) as WindowType;
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_WINDOW_TYPE,
      (e: CustomEventInit) => {
        windowTypeSelect.selectedIndex = e.detail.value;
      },
    );

    // init fft backend select
    const fftBackendSelect = <HTMLSelectElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-fftBackend")
    );
    fftBackendSelect.selectedIndex = settings.fftBackend;
    this._addEventlistener(fftBackendSelect, EventType.CHANGE, () => {
      settings.fftBackend = Number(
        fftBackendSelect.selectedIndex,
      ) as FftBackend;
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_FFT_BACKEND,
      (e: CustomEventInit) => {
        fftBackendSelect.selectedIndex = e.detail.value;
      },
    );

    // init frequency scale select
    const frequencyScaleSelect = <HTMLSelectElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-frequencyScale")
    );
    frequencyScaleSelect.selectedIndex = settings.frequencyScale;
    this._addEventlistener(frequencyScaleSelect, EventType.CHANGE, () => {
      settings.frequencyScale = Number(frequencyScaleSelect.selectedIndex);
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_FREQUENCY_SCALE,
      (e: CustomEventInit) => {
        frequencyScaleSelect.selectedIndex = e.detail.value;
      },
    );

    // init mel filter num input
    const melFilterNumInput = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-melFilterNum")
    );
    melFilterNumInput.value = `${settings.melFilterNum}`;
    this._addEventlistener(melFilterNumInput, EventType.CHANGE, () => {
      settings.melFilterNum = Number(melFilterNumInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_MEL_FILTER_NUM,
      (e: CustomEventInit) => {
        melFilterNumInput.value = `${e.detail.value}`;
      },
    );

    // init frequency range input
    const minFreqInput = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-minFrequency")
    );
    minFreqInput.value = `${settings.minFrequency}`;
    this._addEventlistener(minFreqInput, EventType.CHANGE, () => {
      settings.minFrequency = Number(minFreqInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_MIN_FREQUENCY,
      (e: CustomEventInit) => {
        minFreqInput.value = `${e.detail.value}`;
      },
    );

    const maxFreqInput = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-maxFrequency")
    );
    maxFreqInput.value = `${settings.maxFrequency}`;
    this._addEventlistener(maxFreqInput, EventType.CHANGE, () => {
      settings.maxFrequency = Number(maxFreqInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_MAX_FREQUENCY,
      (e: CustomEventInit) => {
        maxFreqInput.value = `${e.detail.value}`;
      },
    );

    // init time range input
    const minTimeInput = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-minTime")
    );
    minTimeInput.value = `${settings.minTime}`;
    this._addEventlistener(minTimeInput, EventType.CHANGE, () => {
      settings.minTime = Number(minTimeInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_MIN_TIME,
      (e: CustomEventInit) => {
        minTimeInput.value = `${e.detail.value}`;
      },
    );

    const maxTimeInput = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-maxTime")
    );
    maxTimeInput.value = `${settings.maxTime}`;
    this._addEventlistener(maxTimeInput, EventType.CHANGE, () => {
      settings.maxTime = Number(maxTimeInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_MAX_TIME,
      (e: CustomEventInit) => {
        maxTimeInput.value = `${e.detail.value}`;
      },
    );

    // init amplitude range input
    const minAmplitudeInput = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-minAmplitude")
    );
    minAmplitudeInput.value = `${settings.minAmplitude}`;
    this._addEventlistener(minAmplitudeInput, EventType.CHANGE, () => {
      settings.minAmplitude = Number(minAmplitudeInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_MIN_AMPLITUDE,
      (e: CustomEventInit) => {
        minAmplitudeInput.value = `${e.detail.value}`;
      },
    );

    const maxAmplitudeInput = <HTMLInputElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-maxAmplitude")
    );
    maxAmplitudeInput.value = `${settings.maxAmplitude}`;
    this._addEventlistener(maxAmplitudeInput, EventType.CHANGE, () => {
      settings.maxAmplitude = Number(maxAmplitudeInput.value);
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_MAX_AMPLITUDE,
      (e: CustomEventInit) => {
        maxAmplitudeInput.value = `${e.detail.value}`;
      },
    );

    // init spectrogram amplitude low input
    // (live meters controls appended after spectrogram block, see bottom of method)
    const spectrogramAmplitudeLowInput = <HTMLInputElement>(
      this._componentRoot.querySelector(
        ".js-analyzeSetting-spectrogramAmplitudeLow",
      )
    );
    spectrogramAmplitudeLowInput.value = `${settings.spectrogramAmplitudeLow}`;
    this.updateColorBar(settings.toProps());
    this._addEventlistener(
      spectrogramAmplitudeLowInput,
      EventType.CHANGE,
      () => {
        settings.spectrogramAmplitudeLow = Number(
          spectrogramAmplitudeLowInput.value,
        );
      },
    );
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_SPECTROGRAM_AMPLITUDE_LOW,
      (e: CustomEventInit) => {
        spectrogramAmplitudeLowInput.value = `${e.detail.value}`;
        this.updateColorBar(settings.toProps());
      },
    );

    // init spectrogram amplitude high input
    const spectrogramAmplitudeHighInput = <HTMLInputElement>(
      this._componentRoot.querySelector(
        ".js-analyzeSetting-spectrogramAmplitudeHigh",
      )
    );
    spectrogramAmplitudeHighInput.value = `${settings.spectrogramAmplitudeHigh}`;
    this._addEventlistener(
      spectrogramAmplitudeHighInput,
      EventType.CHANGE,
      () => {
        settings.spectrogramAmplitudeHigh = Number(
          spectrogramAmplitudeHighInput.value,
        );
      },
    );
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_SPECTROGRAM_AMPLITUDE_HIGH,
      (e: CustomEventInit) => {
        spectrogramAmplitudeHighInput.value = `${e.detail.value}`;
        this.updateColorBar(settings.toProps());
      },
    );

    const liveAnalysisFftSizeSelect = <HTMLSelectElement>(
      this._componentRoot.querySelector(
        ".js-analyzeSetting-liveAnalysisFftSize",
      )
    );
    liveAnalysisFftSizeSelect.value = String(settings.liveAnalysisFftSize);
    this._addEventlistener(liveAnalysisFftSizeSelect, EventType.CHANGE, () => {
      settings.liveAnalysisFftSize = Number(liveAnalysisFftSizeSelect.value) as
        | 512
        | 1024
        | 2048
        | 4096;
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE,
      (e: CustomEventInit) => {
        liveAnalysisFftSizeSelect.value = String(e.detail.value);
      },
    );

    const wirePctSlider = (
      inputSel: string,
      labelSel: string,
      getVal: () => number,
      setVal: (n: number) => void,
      eventType: string,
      format: (v: number) => string = (v) => String(v),
    ) => {
      const input = this._componentRoot.querySelector(
        inputSel,
      ) as HTMLInputElement;
      const label = this._componentRoot.querySelector(labelSel) as HTMLElement;
      const sync = () => {
        label.textContent = format(getVal());
      };
      input.value = String(getVal());
      sync();
      this._addEventlistener(input, EventType.INPUT, () => {
        setVal(Number(input.value));
        sync();
      });
      this._addEventlistener(
        settings,
        eventType,
        (e: CustomEventInit<{ value: number }>) => {
          input.value = String(e.detail.value);
          label.textContent = format(e.detail.value);
        },
      );
    };

    const wireReleaseSlider = (
      inputSel: string,
      labelSel: string,
      getVal: () => number,
      setVal: (n: number) => void,
      eventType: string,
    ) => {
      const input = this._componentRoot.querySelector(
        inputSel,
      ) as HTMLInputElement;
      const label = this._componentRoot.querySelector(labelSel) as HTMLElement;
      const sync = () => {
        label.textContent = formatReleaseDbPerSecLabel(getVal());
      };
      input.value = String(getVal());
      sync();
      this._addEventlistener(input, EventType.INPUT, () => {
        setVal(Number(input.value));
        sync();
      });
      this._addEventlistener(
        settings,
        eventType,
        (e: CustomEventInit<{ value: number }>) => {
          input.value = String(e.detail.value);
          label.textContent = formatReleaseDbPerSecLabel(e.detail.value);
        },
      );
    };

    wirePctSlider(
      ".js-analyzeSetting-livePolarLevelGatePct",
      ".js-analyzeSetting-livePolarLevelGatePctLabel",
      () => settings.livePolarLevelGatePct,
      (n) => {
        settings.livePolarLevelGatePct = n;
      },
      EventType.AS_UPDATE_LIVE_POLAR_LEVEL_GATE,
      (v) => `${v}%`,
    );
    wirePctSlider(
      ".js-analyzeSetting-livePolarSampleRadiusGamma",
      ".js-analyzeSetting-livePolarSampleRadiusGammaLabel",
      () => settings.livePolarSampleRadiusGamma,
      (n) => {
        settings.livePolarSampleRadiusGamma = n;
      },
      EventType.AS_UPDATE_LIVE_POLAR_SAMPLE_RADIUS_GAMMA,
      (v) => `γ ${v.toFixed(2)}`,
    );
    wirePctSlider(
      ".js-analyzeSetting-livePolarSampleFillBrightnessPct",
      ".js-analyzeSetting-livePolarSampleFillBrightnessPctLabel",
      () => settings.livePolarSampleFillBrightnessPct,
      (n) => {
        settings.livePolarSampleFillBrightnessPct = n;
      },
      EventType.AS_UPDATE_LIVE_POLAR_SAMPLE_FILL_BRIGHTNESS,
      (v) => `+${v}%`,
    );
    wireReleaseSlider(
      ".js-analyzeSetting-livePolarFieldReleaseDbPerSec",
      ".js-analyzeSetting-livePolarFieldReleaseDbPerSecLabel",
      () => settings.livePolarFieldReleaseDbPerSec,
      (n) => {
        settings.livePolarFieldReleaseDbPerSec = n;
      },
      EventType.AS_UPDATE_LIVE_POLAR_FIELD_SMOOTHING,
    );
    wireReleaseSlider(
      ".js-analyzeSetting-liveSpectrumReleaseDbPerSec",
      ".js-analyzeSetting-liveSpectrumReleaseDbPerSecLabel",
      () => settings.liveSpectrumReleaseDbPerSec,
      (n) => {
        settings.liveSpectrumReleaseDbPerSec = n;
      },
      EventType.AS_UPDATE_LIVE_SPECTRUM_SMOOTHING,
    );
    {
      const input = <HTMLInputElement>(
        this._componentRoot.querySelector(
          ".js-analyzeSetting-liveSpectrumPeakHoldSec",
        )
      );
      const label = <HTMLSpanElement>(
        this._componentRoot.querySelector(
          ".js-analyzeSetting-liveSpectrumPeakHoldSecLabel",
        )
      );
      const fmt = (sec: number) => `${sec.toFixed(2)} s`;
      const sync = () => {
        label.textContent = fmt(settings.liveSpectrumPeakHoldSec);
      };
      input.value = String(settings.liveSpectrumPeakHoldSec);
      sync();
      this._addEventlistener(input, EventType.INPUT, () => {
        settings.liveSpectrumPeakHoldSec = Number(input.value);
        sync();
      });
      this._addEventlistener(
        settings,
        EventType.AS_UPDATE_LIVE_SPECTRUM_PEAK_HOLD,
        (e: CustomEventInit<{ value: number }>) => {
          input.value = String(e.detail.value);
          label.textContent = fmt(e.detail.value);
        },
      );
    }
    wireReleaseSlider(
      ".js-analyzeSetting-liveLevelMeterReleaseDbPerSec",
      ".js-analyzeSetting-liveLevelMeterReleaseDbPerSecLabel",
      () => settings.liveLevelMeterReleaseDbPerSec,
      (n) => {
        settings.liveLevelMeterReleaseDbPerSec = n;
      },
      EventType.AS_UPDATE_LIVE_LEVEL_METER_SMOOTHING,
    );

    const liveSoundFieldModeSelect = <HTMLSelectElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-liveSoundFieldMode")
    );
    liveSoundFieldModeSelect.value = settings.liveSoundFieldMode;
    this._addEventlistener(liveSoundFieldModeSelect, EventType.CHANGE, () => {
      settings.liveSoundFieldMode = liveSoundFieldModeSelect.value as
        | "polarSample"
        | "polarLevel"
        | "lissajous";
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_LIVE_SOUND_FIELD_MODE,
      (e: CustomEventInit) => {
        liveSoundFieldModeSelect.value = String(e.detail.value);
      },
    );

    const liveSpectrumTiltSelect = <HTMLSelectElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-liveSpectrumTilt")
    );
    liveSpectrumTiltSelect.value = String(settings.liveSpectrumTiltDbPerOct);
    this._addEventlistener(liveSpectrumTiltSelect, EventType.CHANGE, () => {
      settings.liveSpectrumTiltDbPerOct = Number(
        liveSpectrumTiltSelect.value,
      ) as 0 | 1.5 | 3 | 4.5 | 6;
    });
    this._addEventlistener(
      settings,
      EventType.AS_UPDATE_LIVE_SPECTRUM_TILT,
      (e: CustomEventInit) => {
        liveSpectrumTiltSelect.value = String(e.detail.value);
      },
    );
  }

  private updateColorBar(settings: AnalyzeSettingsProps) {
    const colorCanvas = <HTMLCanvasElement>(
      this._componentRoot.querySelector(".js-analyzeSetting-spectrogramColor")
    );
    const colorAxisCanvas = <HTMLCanvasElement>(
      this._componentRoot.querySelector(
        ".js-analyzeSetting-spectrogramColorAxis",
      )
    );
    const colorContext = colorCanvas.getContext("2d", { alpha: false });
    const colorAxisContext = colorAxisCanvas.getContext("2d", { alpha: false });

    const low = settings.spectrogramAmplitudeLow;
    const high = settings.spectrogramAmplitudeHigh;
    const range = high - low;

    colorAxisContext.clearRect(
      0,
      0,
      colorAxisCanvas.width,
      colorAxisCanvas.height,
    );
    colorAxisContext.font = `15px Arial`;
    colorAxisContext.fillStyle = "white";
    for (let i = 0; i < 10; i++) {
      const amp = low + (i * range) / 10;
      const x = (i * colorAxisCanvas.width) / 10;
      colorAxisContext.fillText(
        `${amp.toFixed(0)} dB`,
        x,
        colorAxisCanvas.height,
      );
    }

    for (let i = 0; i < 100; i++) {
      const amp = low + (i * range) / 100;
      const x = (i * colorCanvas.width) / 100;
      colorContext.fillStyle = this._analyzeService.getSpectrogramColor(
        amp,
        low,
        high,
      );
      colorContext.fillRect(x, 0, colorCanvas.width / 100, colorCanvas.height);
    }
  }
}
