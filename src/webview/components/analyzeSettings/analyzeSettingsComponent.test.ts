import {
  createAudioContext,
  getRandomFloat,
  getRandomInt,
} from "../../../__mocks__/helper";
import { EventType } from "../../events";
import AnalyzeService from "../../services/analyzeService";
import AnalyzeSettingsService from "../../services/analyzeSettingsService";
import AnalyzeSettingsComponent from "./analyzeSettingsComponent";

describe("analyzeSettingsComponent", () => {
  let audioBuffer: AudioBuffer;
  let analyzeService: AnalyzeService;
  let analyzeSettingsService: AnalyzeSettingsService;
  let analyzerSettingsComponent: AnalyzeSettingsComponent;
  beforeAll(() => {
    document.body.innerHTML = '<div id="analyzeSettings"></div>';
    const audioContext = createAudioContext(44100);
    audioBuffer = audioContext.createBuffer(2, 44100, 44100);
    const ad = {
      waveformVisible: undefined,
      waveformVerticalScale: undefined,
      spectrogramVisible: undefined,
      spectrogramVerticalScale: undefined,
      windowSizeIndex: undefined,
      minAmplitude: undefined,
      maxAmplitude: undefined,
      minFrequency: undefined,
      maxFrequency: undefined,
      spectrogramAmplitudeRange: undefined,
      frequencyScale: undefined,
      melFilterNum: undefined,
    };
    analyzeService = new AnalyzeService(audioBuffer);
    analyzeSettingsService = AnalyzeSettingsService.fromDefaultSetting(
      ad,
      audioBuffer,
    );
    analyzerSettingsComponent = new AnalyzeSettingsComponent(
      "#analyzeSettings",
      analyzeService,
      analyzeSettingsService,
    );
  });

  afterAll(() => {
    analyzeService.dispose();
    analyzeSettingsService.dispose();
    analyzerSettingsComponent.dispose();
  });

  beforeEach(() => {
    document.documentElement.dataset.workspacePane = "stft";
  });

  test("waveform-visible should be updated when recieving update-waveform-visible event", () => {
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_WAVEFORM_VISIBLE, {
        detail: {
          value: true,
        },
      }),
    );
    const waveformVisible = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-waveformVisible")
    );
    expect(waveformVisible.checked).toBe(true);

    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_WAVEFORM_VISIBLE, {
        detail: {
          value: false,
        },
      }),
    );
    expect(waveformVisible.checked).toBe(false);
  });

  test("spectrogram-visible should be updated when recieving update-spectrogram-visible event", () => {
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_SPECTROGRAM_VISIBLE, {
        detail: {
          value: true,
        },
      }),
    );
    const spectrogramVisible = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-spectrogramVisible")
    );
    expect(spectrogramVisible.checked).toBe(true);

    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_SPECTROGRAM_VISIBLE, {
        detail: {
          value: false,
        },
      }),
    );
    expect(spectrogramVisible.checked).toBe(false);
  });

  test("window size should be updated when user change window-size-select", () => {
    const index = getRandomInt(0, 7);
    const windowSize = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768][index];
    const windowSizeSelect = <HTMLSelectElement>(
      document.querySelector(".js-analyzeSetting-windowSize")
    );
    windowSizeSelect.value = String(index);
    windowSizeSelect.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.windowSize).toBe(windowSize);
  });
  test("window-size-select should be updated when window size index changes on service", () => {
    const index = getRandomInt(0, 7);
    analyzeSettingsService.fftWindowAuto = false;
    analyzeSettingsService.windowSizeIndex = index;
    const windowSizeSelect = <HTMLSelectElement>(
      document.querySelector(".js-analyzeSetting-windowSize")
    );
    expect(windowSizeSelect.value).toBe(String(index));
  });

  test("frequency scale should be updated when user change frequency-scale-select", () => {
    const frequencyScale = getRandomInt(0, 2);
    const frequencyScaleSelect = <HTMLSelectElement>(
      document.querySelector(".js-analyzeSetting-frequencyScale")
    );
    frequencyScaleSelect.selectedIndex = frequencyScale;
    frequencyScaleSelect.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.frequencyScale).toBe(frequencyScale);
  });
  test("frequency-scale-select should be updated when recieving update-frequency-scale event", () => {
    const frequencyScale = getRandomInt(0, 2);
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_FREQUENCY_SCALE, {
        detail: {
          value: frequencyScale,
        },
      }),
    );
    const frequencyScaleSelect = <HTMLSelectElement>(
      document.querySelector(".js-analyzeSetting-frequencyScale")
    );
    expect(frequencyScaleSelect.selectedIndex).toBe(frequencyScale);
  });

  test("mel-filter-num should be updated when user change mel-filter-num-input", () => {
    const melFilterNum = getRandomFloat(20, 200);
    const melFilterNumInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-melFilterNum")
    );
    melFilterNumInput.value = melFilterNum.toString();
    melFilterNumInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.melFilterNum).toBe(Math.trunc(melFilterNum));
  });
  test("mel-filter-num-input should be updated when recieving update-mel-filter-num event", () => {
    const melFilterNum = getRandomFloat(20, 200);
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_MEL_FILTER_NUM, {
        detail: {
          value: melFilterNum,
        },
      }),
    );
    const melFilterNumInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-melFilterNum")
    );
    expect(Number(melFilterNumInput.value)).toBe(melFilterNum);
  });

  test("min-frequency should be updated when user change min-frequency-input", () => {
    const minFrequency = getRandomFloat(0, audioBuffer.sampleRate / 2);
    const minFrequencyInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-minFrequency")
    );
    minFrequencyInput.value = minFrequency.toString();
    minFrequencyInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.minFrequency).toBeCloseTo(minFrequency);
  });
  test("min-frequency-input should be updated when recieving update-min-frequency event", () => {
    const minFrequency = getRandomFloat(0, audioBuffer.sampleRate / 2);
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_MIN_FREQUENCY, {
        detail: {
          value: minFrequency,
        },
      }),
    );
    const minFrequencyInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-minFrequency")
    );
    expect(Number(minFrequencyInput.value)).toBeCloseTo(minFrequency);
  });

  test("max-frequency should be updated when user change max-frequency-input", () => {
    const maxFrequency = getRandomFloat(
      analyzeSettingsService.minFrequency,
      audioBuffer.sampleRate / 2,
    );
    const maxFrequencyInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-maxFrequency")
    );
    maxFrequencyInput.value = maxFrequency.toString();
    maxFrequencyInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.maxFrequency).toBeCloseTo(maxFrequency);
  });
  test("max-frequency-input should be updated when recieving update-max-frequency event", () => {
    const maxFrequency = getRandomFloat(
      analyzeSettingsService.minFrequency,
      audioBuffer.sampleRate / 2,
    );
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_MAX_FREQUENCY, {
        detail: {
          value: maxFrequency,
        },
      }),
    );
    const maxFrequencyInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-maxFrequency")
    );
    expect(Number(maxFrequencyInput.value)).toBeCloseTo(maxFrequency);
  });

  test("min-time should be updated when user change min-time-input", () => {
    const minTime = getRandomFloat(0, audioBuffer.duration);
    const minTimeInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-minTime")
    );
    minTimeInput.value = minTime.toString();
    minTimeInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.minTime).toBeCloseTo(minTime);
  });
  test("min-time-input should be updated when recieving update-min-time event", () => {
    const minTime = getRandomFloat(0, audioBuffer.duration);
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_MIN_TIME, {
        detail: {
          value: minTime,
        },
      }),
    );
    const minTimeInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-minTime")
    );
    expect(Number(minTimeInput.value)).toBeCloseTo(minTime);
  });

  test("max-time should be updated when user change max-time-input", () => {
    const maxTime = getRandomFloat(
      analyzeSettingsService.minTime,
      audioBuffer.duration,
    );
    const maxTimeInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-maxTime")
    );
    maxTimeInput.value = maxTime.toString();
    maxTimeInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.maxTime).toBeCloseTo(maxTime);
  });
  test("max-time-input should be updated when recieving update-max-time event", () => {
    const maxTime = getRandomFloat(
      analyzeSettingsService.minTime,
      audioBuffer.duration,
    );
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_MAX_TIME, {
        detail: {
          value: maxTime,
        },
      }),
    );
    const maxTimeInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-maxTime")
    );
    expect(Number(maxTimeInput.value)).toBeCloseTo(maxTime);
  });

  test("min-amplitude should be updated when user change min-amplitude-input", () => {
    const minAmplitude = getRandomFloat(
      -1,
      analyzeSettingsService.maxAmplitude,
    );
    const minAmplitudeInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-minAmplitude")
    );
    minAmplitudeInput.value = minAmplitude.toString();
    minAmplitudeInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.minAmplitude).toBeCloseTo(minAmplitude);
  });
  test("min-amplitude-input should be updated when recieving update-min-amplitude event", () => {
    const minAmplitude = getRandomFloat(
      -1,
      analyzeSettingsService.maxAmplitude,
    );
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_MIN_AMPLITUDE, {
        detail: {
          value: minAmplitude,
        },
      }),
    );
    const minAmplitudeInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-minAmplitude")
    );
    expect(Number(minAmplitudeInput.value)).toBeCloseTo(minAmplitude);
  });

  test("max-amplitude should be updated when user change max-amplitude-input", () => {
    const maxAmplitude = getRandomFloat(analyzeSettingsService.minAmplitude, 1);
    const maxAmplitudeInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-maxAmplitude")
    );
    maxAmplitudeInput.value = maxAmplitude.toString();
    maxAmplitudeInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.maxAmplitude).toBeCloseTo(maxAmplitude);
  });
  test("max-amplitude-input should be updated when recieving update-max-amplitude event", () => {
    const maxAmplitude = getRandomFloat(analyzeSettingsService.minAmplitude, 1);
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_MAX_AMPLITUDE, {
        detail: {
          value: maxAmplitude,
        },
      }),
    );
    const maxAmplitudeInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-maxAmplitude")
    );
    expect(Number(maxAmplitudeInput.value)).toBeCloseTo(maxAmplitude);
  });

  test("spectrogramAmplitudeLow should be updated when user changes spectrogramAmplitudeLow input", () => {
    const low = getRandomFloat(-90, -10);
    const lowInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-spectrogramAmplitudeLow")
    );
    lowInput.value = low.toString();
    lowInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.spectrogramAmplitudeLow).toBeCloseTo(low);
  });
  test("spectrogramAmplitudeLow input should be updated when receiving AS_UPDATE_SPECTROGRAM_AMPLITUDE_LOW event", () => {
    const low = getRandomFloat(-90, -10);
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_SPECTROGRAM_AMPLITUDE_LOW, {
        detail: { value: low },
      }),
    );
    const lowInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-spectrogramAmplitudeLow")
    );
    expect(Number(lowInput.value)).toBeCloseTo(low);
  });
  test("spectrogramAmplitudeHigh should be updated when user changes spectrogramAmplitudeHigh input", () => {
    const high = getRandomFloat(-10, 0);
    const highInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-spectrogramAmplitudeHigh")
    );
    highInput.value = high.toString();
    highInput.dispatchEvent(new Event(EventType.CHANGE));
    expect(analyzeSettingsService.spectrogramAmplitudeHigh).toBeCloseTo(high);
  });
  test("spectrogramAmplitudeHigh input should be updated when receiving AS_UPDATE_SPECTROGRAM_AMPLITUDE_HIGH event", () => {
    const high = getRandomFloat(-10, 0);
    analyzeSettingsService.dispatchEvent(
      new CustomEvent(EventType.AS_UPDATE_SPECTROGRAM_AMPLITUDE_HIGH, {
        detail: { value: high },
      }),
    );
    const highInput = <HTMLInputElement>(
      document.querySelector(".js-analyzeSetting-spectrogramAmplitudeHigh")
    );
    expect(Number(highInput.value)).toBeCloseTo(high);
  });

  describe("live spectrum controls (liveSpec workspace pane)", () => {
    beforeEach(() => {
      document.documentElement.dataset.workspacePane = "liveSpec";
    });

    test("liveAnalysisFftSize select should reflect service state", () => {
      const sel = <HTMLSelectElement>(
        document.querySelector(".js-analyzeSetting-liveAnalysisFftSize")
      );
      expect(sel.value).toBe("2048");
      sel.value = "1024";
      sel.dispatchEvent(new Event(EventType.CHANGE));
      expect(analyzeSettingsService.liveAnalysisFftSize).toBe(1024);
      sel.value = "4096";
      sel.dispatchEvent(new Event(EventType.CHANGE));
      expect(analyzeSettingsService.liveAnalysisFftSize).toBe(4096);
    });

    test("liveAnalysisFftSize select updates when receiving AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE event", () => {
      const sel = <HTMLSelectElement>(
        document.querySelector(".js-analyzeSetting-liveAnalysisFftSize")
      );
      analyzeSettingsService.dispatchEvent(
        new CustomEvent(EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE, {
          detail: { value: 512 },
        }),
      );
      expect(sel.value).toBe("512");
      analyzeSettingsService.dispatchEvent(
        new CustomEvent(EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE, {
          detail: { value: 2048 },
        }),
      );
      expect(sel.value).toBe("2048");
    });

    test("live spectrum release slider updates service and label", () => {
      const range = <HTMLInputElement>(
        document.querySelector(".js-analyzeSetting-liveSpectrumReleaseDbPerSec")
      );
      const label = document.querySelector(
        ".js-analyzeSetting-liveSpectrumReleaseDbPerSecLabel",
      );
      expect(range.value).toBe("15");
      expect(label?.textContent).toBe("15.0 dB/s");
      range.value = "12";
      range.dispatchEvent(new Event(EventType.INPUT));
      expect(analyzeSettingsService.liveSpectrumReleaseDbPerSec).toBe(12);
      expect(label?.textContent).toBe("12.0 dB/s");
    });

    test("live spectrum peak hold slider updates service and label", () => {
      const range = <HTMLInputElement>(
        document.querySelector(".js-analyzeSetting-liveSpectrumPeakHoldSec")
      );
      const label = document.querySelector(
        ".js-analyzeSetting-liveSpectrumPeakHoldSecLabel",
      );
      expect(range.value).toBe("0");
      expect(label?.textContent).toBe("0.00 s");
      range.value = "1.05";
      range.dispatchEvent(new Event(EventType.INPUT));
      expect(analyzeSettingsService.liveSpectrumPeakHoldSec).toBe(1.05);
      expect(label?.textContent).toBe("1.05 s");
    });

    test("live spectrum peak hold UI syncs from AS_UPDATE_LIVE_SPECTRUM_PEAK_HOLD", () => {
      const range = <HTMLInputElement>(
        document.querySelector(".js-analyzeSetting-liveSpectrumPeakHoldSec")
      );
      const label = document.querySelector(
        ".js-analyzeSetting-liveSpectrumPeakHoldSecLabel",
      );
      analyzeSettingsService.dispatchEvent(
        new CustomEvent(EventType.AS_UPDATE_LIVE_SPECTRUM_PEAK_HOLD, {
          detail: { value: 2 },
        }),
      );
      expect(range.value).toBe("2");
      expect(label?.textContent).toBe("2.00 s");
    });

    test("live spectrum release UI syncs from AS_UPDATE_LIVE_SPECTRUM_SMOOTHING", () => {
      const range = <HTMLInputElement>(
        document.querySelector(".js-analyzeSetting-liveSpectrumReleaseDbPerSec")
      );
      const label = document.querySelector(
        ".js-analyzeSetting-liveSpectrumReleaseDbPerSecLabel",
      );
      analyzeSettingsService.dispatchEvent(
        new CustomEvent(EventType.AS_UPDATE_LIVE_SPECTRUM_SMOOTHING, {
          detail: { value: 24 },
        }),
      );
      expect(range.value).toBe("24");
      expect(label?.textContent).toBe("24.0 dB/s");
    });

    test("sound field mode select updates service", () => {
      const sel = <HTMLSelectElement>(
        document.querySelector(".js-analyzeSetting-liveSoundFieldMode")
      );
      sel.value = "polarSample";
      sel.dispatchEvent(new Event(EventType.CHANGE));
      expect(analyzeSettingsService.liveSoundFieldMode).toBe("polarSample");
    });

    test("live spectrum tilt select updates service", () => {
      const sel = <HTMLSelectElement>(
        document.querySelector(".js-analyzeSetting-liveSpectrumTilt")
      );
      expect(sel.value).toBe("0");
      sel.value = "3";
      sel.dispatchEvent(new Event(EventType.CHANGE));
      expect(analyzeSettingsService.liveSpectrumTiltDbPerOct).toBe(3);
    });

    test("live spectrum tilt select syncs from AS_UPDATE_LIVE_SPECTRUM_TILT", () => {
      const sel = <HTMLSelectElement>(
        document.querySelector(".js-analyzeSetting-liveSpectrumTilt")
      );
      analyzeSettingsService.dispatchEvent(
        new CustomEvent(EventType.AS_UPDATE_LIVE_SPECTRUM_TILT, {
          detail: { value: 4.5 },
        }),
      );
      expect(sel.value).toBe("4.5");
    });
  });
});
