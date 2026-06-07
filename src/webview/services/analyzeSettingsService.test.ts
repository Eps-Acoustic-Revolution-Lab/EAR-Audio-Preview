import {
  MockAudioBuffer,
  getRandomFloat,
  getRandomFloatOutOf,
  getRandomInt,
  waitEventForAction,
} from "../../__mocks__/helper";
import { EventType } from "../events";
import { AnalyzeDefault } from "../../config";
import AnalyzeSettingsService, {
  FrequencyScale,
  WindowSizeIndex,
  inferFftWindowSamplesForTimeRange,
} from "./analyzeSettingsService";

describe("analyzeSettingsService", () => {
  let defaultSettings: AnalyzeDefault;
  let audioBuffer: AudioBuffer;
  beforeEach(() => {
    defaultSettings = {
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
    audioBuffer = new MockAudioBuffer(
      1,
      44100,
      44100,
    ) as unknown as AudioBuffer;
  });

  // waveformVisible
  test("waveformVisible should be true if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.waveformVisible).toBe(true);
  });
  test("waveformVisible should be default value (true case)", () => {
    defaultSettings.waveformVisible = true;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.waveformVisible).toBe(true);
  });
  test("waveformVisible should be default value (false case)", () => {
    defaultSettings.waveformVisible = false;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.waveformVisible).toBe(false);
  });

  // waveformVerticalScale
  test("waveformVerticalScale should be 1.0 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.waveformVerticalScale).toBe(1.0);
  });
  test("waveformVerticalScale should be default value", () => {
    const waveformVerticalScale = getRandomFloat(
      AnalyzeSettingsService.WAVEFORM_CANVAS_VERTICAL_SCALE_MIN,
      AnalyzeSettingsService.WAVEFORM_CANVAS_VERTICAL_SCALE_MAX,
    );
    defaultSettings.waveformVerticalScale = waveformVerticalScale;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.waveformVerticalScale).toBe(waveformVerticalScale);
  });
  test("waveformVerticalScale should be in range (check lower limit)", () => {
    defaultSettings.waveformVerticalScale = 0.0;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.waveformVerticalScale).toBe(1.0);
  });
  test("waveformVerticalScale should be in range (check upper limit)", () => {
    defaultSettings.waveformVerticalScale = 10.0;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.waveformVerticalScale).toBe(1.0);
  });

  // spectrogramVisible
  test("spectrogramVisible should be true if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramVisible).toBe(true);
  });
  test("spectrogramVisible should be default value (true case)", () => {
    defaultSettings.spectrogramVisible = true;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramVisible).toBe(true);
  });
  test("spectrogramVisible should be default value (false case)", () => {
    defaultSettings.spectrogramVisible = false;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramVisible).toBe(false);
  });

  // spectrogramVerticalScale
  test("spectrogramVerticalScale should be 1.0 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramVerticalScale).toBe(1.0);
  });
  test("spectrogramVerticalScale should be default value", () => {
    const spectrogramVerticalScale = getRandomFloat(
      AnalyzeSettingsService.SPECTROGRAM_CANVAS_VERTICAL_SCALE_MIN,
      AnalyzeSettingsService.SPECTROGRAM_CANVAS_VERTICAL_SCALE_MAX,
    );
    defaultSettings.spectrogramVerticalScale = spectrogramVerticalScale;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramVerticalScale).toBe(spectrogramVerticalScale);
  });
  test("spectrogramVerticalScale should be in range (check lower limit)", () => {
    defaultSettings.spectrogramVerticalScale = 0.0;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramVerticalScale).toBe(1.0);
  });
  test("spectrogramVerticalScale should be in range (check upper limit)", () => {
    defaultSettings.spectrogramVerticalScale = 10.0;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramVerticalScale).toBe(1.0);
  });

  // windowSizeIndex
  test("windowSizeIndex should be W1024 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.windowSizeIndex).toBe(WindowSizeIndex.W1024);
  });
  test("windowSizeIndex should be default value", () => {
    const index = getRandomInt(0, 7);
    defaultSettings.windowSizeIndex = index;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.windowSizeIndex).toBe(index);
  });

  // windowSize
  test("windowSize should be 1024 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.windowSize).toBe(1024);
  });
  test("windowSize should be default value", () => {
    const index = getRandomInt(0, 7);
    const windowSize = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768][index];
    defaultSettings.windowSizeIndex = index;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.windowSize).toBe(windowSize);
  });

  test("inferFftWindowSamplesForTimeRange uses time–frequency tradeoff bands", () => {
    const fs = 44100;
    const wVal = AnalyzeSettingsService.SPECTROGRAM_CANVAS_WIDTH;
    expect(inferFftWindowSamplesForTimeRange(4, fs, wVal)).toBe(512);
    expect(inferFftWindowSamplesForTimeRange(18, fs, wVal)).toBe(512);
    expect(inferFftWindowSamplesForTimeRange(51, fs, wVal)).toBe(512);
    expect(inferFftWindowSamplesForTimeRange(56, fs, wVal)).toBe(512);
    expect(inferFftWindowSamplesForTimeRange(90, fs, wVal)).toBe(1024);
    expect(inferFftWindowSamplesForTimeRange(300, fs, wVal)).toBe(2048);
  });
  // frequencyScale
  test("frequencyScale should be Linear if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.frequencyScale).toBe(FrequencyScale.Linear);
  });
  test("frequencyScale should be default value", () => {
    const frequencyScale = getRandomInt(0, 2);
    defaultSettings.frequencyScale = frequencyScale;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.frequencyScale).toBe(frequencyScale);
  });

  // melFilterNum
  test("melFilterNum should be 40 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.melFilterNum).toBe(40);
  });
  test("melFilterNum should be default value if its in [20, 200]", () => {
    const melFilterNum = getRandomFloat(20, 200);
    defaultSettings.melFilterNum = melFilterNum;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.melFilterNum).toBe(Math.trunc(melFilterNum));
  });
  test("melFilterNum should be 40 if default value is out of [20, 200]", () => {
    const melFilterNum = getRandomFloatOutOf(20, 200);
    defaultSettings.melFilterNum = melFilterNum;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.melFilterNum).toBe(40);
  });
  test("AS_UpdateMelFilterNum event should be sent", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.melFilterNum = getRandomFloat(20, 200);
      },
      as,
      EventType.AS_UPDATE_MEL_FILTER_NUM,
    );
    expect(detail.value).toBe(as.melFilterNum);
  });

  // minFrequency
  test("minFrequency should be 0 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.minFrequency).toBe(0);
  });
  test("minFrequency is always 0 on file open regardless of cached default", () => {
    const minFrequency = getRandomFloat(0, audioBuffer.sampleRate / 2);
    defaultSettings.minFrequency = minFrequency;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.minFrequency).toBe(0);
  });
  test("minFrequency should be 0 if default value is out of [0, sampleRate/2]", () => {
    const minFrequency = getRandomFloatOutOf(0, audioBuffer.sampleRate / 2);
    defaultSettings.minFrequency = minFrequency;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.minFrequency).toBeCloseTo(0);
  });
  test("AS_UpdateMinFrequency event should be sent", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.minFrequency = getRandomFloat(0, audioBuffer.sampleRate / 2);
      },
      as,
      EventType.AS_UPDATE_MIN_FREQUENCY,
    );
    expect(detail.value).toBeCloseTo(as.minFrequency);
  });

  // maxFrequency
  test("maxFrequency should be sampleRate/2 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxFrequency).toBeCloseTo(audioBuffer.sampleRate / 2);
  });
  test("maxFrequency is always Nyquist on file open regardless of cached default", () => {
    const maxFrequency = getRandomFloat(0, audioBuffer.sampleRate / 2);
    defaultSettings.maxFrequency = maxFrequency;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxFrequency).toBeCloseTo(audioBuffer.sampleRate / 2);
  });
  test("maxFrequency should be to sampleRate/2 if default value is out of [0, sampleRate/2]", () => {
    const maxFrequency = getRandomFloatOutOf(0, audioBuffer.sampleRate / 2);
    defaultSettings.minFrequency = maxFrequency;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxFrequency).toBeCloseTo(audioBuffer.sampleRate / 2);
  });
  test("AS_UpdateMaxFrequency event should be sent", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.maxFrequency = getRandomFloat(0, audioBuffer.sampleRate / 2);
      },
      as,
      EventType.AS_UPDATE_MAX_FREQUENCY,
    );
    expect(detail.value).toBeCloseTo(as.maxFrequency);
  });

  // minTime (not in default settings)
  test("minTime should be 0 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.minTime).toBe(0);
  });
  test("AS_UpdateMinTime event should be sent", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.minTime = getRandomFloat(0, audioBuffer.duration);
      },
      as,
      EventType.AS_UPDATE_MIN_TIME,
    );
    expect(detail.value).toBeCloseTo(as.minTime);
  });

  // maxTime (not in default settings)
  test("maxTime should be duration if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxTime).toBeCloseTo(audioBuffer.duration);
  });
  test("AS_UpdateMaxTime event should be sent", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.maxTime = getRandomFloat(0, audioBuffer.duration);
      },
      as,
      EventType.AS_UPDATE_MAX_TIME,
    );
    expect(detail.value).toBeCloseTo(as.maxTime);
  });

  // minAmplitude
  test("minAmplitude should be minAmplitudeOfAudioBuffer if no default value is provided", () => {
    const minAmplitude = getRandomFloat(-100, 0);
    audioBuffer.getChannelData(0)[getRandomInt(0, audioBuffer.length)] =
      minAmplitude;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.minAmplitude).toBeCloseTo(as.minAmplitudeOfAudioBuffer);
  });
  test("minAmplitude should be default value if its in [-100, 100] and smaller than max", () => {
    const maxAmplitude = getRandomFloat(0, 100);
    const minAmplitude = getRandomFloat(-100, maxAmplitude);
    defaultSettings.maxAmplitude = maxAmplitude;
    defaultSettings.minAmplitude = minAmplitude;
    const data = audioBuffer.getChannelData(0);
    data.fill(minAmplitude);
    data[1] = maxAmplitude;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.minAmplitude).toBeCloseTo(minAmplitude);
  });
  test("minAmplitude should be minAmplitudeOfAudioBuffer if its in [-100, 100] and larger than max", () => {
    const maxAmplitude = getRandomFloat(0, 100);
    const minAmplitude = getRandomFloat(maxAmplitude, 100);
    defaultSettings.maxAmplitude = maxAmplitude;
    defaultSettings.minAmplitude = minAmplitude;
    const data = audioBuffer.getChannelData(0);
    data.fill(minAmplitude);
    data[1] = maxAmplitude;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.minAmplitude).toBeCloseTo(as.minAmplitudeOfAudioBuffer);
  });
  test("minAmplitude should be minAmplitudeOfAudioBuffer if default value is out of [-100, 100]", () => {
    const minAmplitude = getRandomFloatOutOf(-100, 100);
    defaultSettings.minAmplitude = minAmplitude;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.minAmplitude).toBeCloseTo(as.minAmplitudeOfAudioBuffer);
  });
  test("AS_UpdateMinAmplitude event should be sent", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.minAmplitude = getRandomFloat(-100, 100);
      },
      as,
      EventType.AS_UPDATE_MIN_AMPLITUDE,
    );
    expect(detail.value).toBeCloseTo(as.minAmplitude);
  });

  // maxAmplitude
  test("maxAmplitude should be maxAmplitudeOfAudioBuffer if no default value is provided", () => {
    const maxAmplitude = getRandomFloat(0, 100);
    audioBuffer.getChannelData(0)[getRandomInt(0, audioBuffer.length)] =
      maxAmplitude;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxAmplitude).toBeCloseTo(as.maxAmplitudeOfAudioBuffer);
  });
  test("maxAmplitude should be default value if its in [-100, 100] and larger than min", () => {
    const maxAmplitude = getRandomFloat(0, 100);
    const minAmplitude = getRandomFloat(-100, maxAmplitude);
    defaultSettings.maxAmplitude = maxAmplitude;
    defaultSettings.minAmplitude = minAmplitude;
    const data = audioBuffer.getChannelData(0);
    data.fill(minAmplitude);
    data[1] = maxAmplitude;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxAmplitude).toBeCloseTo(maxAmplitude);
  });
  test("maxAmplitude should be maxAmplitudeOfAudiobuffer if its in [-100, 100] and smaller than min", () => {
    const maxAmplitude = getRandomFloat(0, 100);
    const minAmplitude = getRandomFloat(maxAmplitude, 100);
    defaultSettings.maxAmplitude = maxAmplitude;
    defaultSettings.minAmplitude = minAmplitude;
    const data = audioBuffer.getChannelData(0);
    data.fill(minAmplitude);
    data[1] = maxAmplitude;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxAmplitude).toBeCloseTo(as.maxAmplitudeOfAudioBuffer);
  });
  test("maxAmplitude should be maxAmplitudeOfAudioBuffer if default value is out of [-100, 100]", () => {
    const maxAmplitude = getRandomFloatOutOf(-100, 100);
    defaultSettings.maxAmplitude = maxAmplitude;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxAmplitude).toBeCloseTo(as.maxAmplitudeOfAudioBuffer);
  });
  test("cached amplitude range expands to include buffer true peak (narrow max)", () => {
    defaultSettings.minAmplitude = -0.2;
    defaultSettings.maxAmplitude = 0.15;
    const data = audioBuffer.getChannelData(0);
    data.fill(0);
    data[500] = 0.92;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.maxAmplitude).toBeGreaterThanOrEqual(0.92);
    expect(as.minAmplitude).toBeLessThanOrEqual(-0.2);
  });
  test("AS_UpdateMaxAmplitude event should be sent", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.maxAmplitude = getRandomFloat(-100, 100);
      },
      as,
      EventType.AS_UPDATE_MAX_AMPLITUDE,
    );
    expect(detail.value).toBeCloseTo(as.maxAmplitude);
  });

  // spectrogramAmplitudeRange
  test("spectrogramAmplitudeRange should be -90 if no default value is provided", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramAmplitudeRange).toBe(-90);
  });
  test("spectrogramAmplitudeRange should be default value if its in [-1000, 0]", () => {
    const spectrogramAmplitudeRange = getRandomFloat(-1000, 0);
    defaultSettings.spectrogramAmplitudeRange = spectrogramAmplitudeRange;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramAmplitudeRange).toBeCloseTo(spectrogramAmplitudeRange);
  });
  test("spectrogramAmplitudeRange should be -90 if default value is out of [-1000, 0]", () => {
    const spectrogramAmplitudeRange = getRandomFloatOutOf(-1000, 0);
    defaultSettings.spectrogramAmplitudeRange = spectrogramAmplitudeRange;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.spectrogramAmplitudeRange).toBe(-90);
  });
  test("AS_UpdateSpectrogramAmplitudeRange event should be sent", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.spectrogramAmplitudeRange = getRandomFloat(-1000, 0);
      },
      as,
      EventType.AS_UPDATE_SPECTROGRAM_AMPLITUDE_RANGE,
    );
    expect(detail.value).toBeCloseTo(as.spectrogramAmplitudeRange);
  });

  test("time range should be reset when resetToDefaultTimeRange is called", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.minTime = getRandomFloat(0, audioBuffer.duration);
    as.maxTime = getRandomFloat(as.minTime, audioBuffer.duration);
    as.resetToDefaultTimeRange();
    expect(as.minTime).toBe(0);
    expect(as.maxTime).toBeCloseTo(audioBuffer.duration);
  });

  test("amplitude range should be reset when resetToDefaultAmplitudeRange is called", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.minAmplitude = getRandomFloat(-100, 100);
    as.maxAmplitude = getRandomFloat(as.minAmplitude, 100);
    as.resetToDefaultAmplitudeRange();
    expect(as.minAmplitude).toBeCloseTo(as.minAmplitudeOfAudioBuffer);
    expect(as.maxAmplitude).toBeCloseTo(as.maxAmplitudeOfAudioBuffer);
  });

  test("frequency range should be reset when resetToDefaultFrequencyRange is called", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.minFrequency = getRandomFloat(0, audioBuffer.sampleRate / 2);
    as.maxFrequency = getRandomFloat(
      as.minFrequency,
      audioBuffer.sampleRate / 2,
    );
    as.resetToDefaultFrequencyRange();
    expect(as.minFrequency).toBe(0);
    expect(as.maxFrequency).toBeCloseTo(audioBuffer.sampleRate / 2);
  });

  // showLevelMeter
  test("showLevelMeter should be false by default", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.showLevelMeter).toBe(false);
  });
  test("showLevelMeter respects default setting (true)", () => {
    defaultSettings.showLevelMeter = true;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.showLevelMeter).toBe(true);
  });
  test("showLevelMeter dispatches event on change", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.showLevelMeter = true;
      },
      as,
      EventType.AS_UPDATE_SHOW_LEVEL_METER,
    );
    expect(detail.value).toBe(true);
  });
  test("showLevelMeter is persisted via toCachedDefaults", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.showLevelMeter = true;
    expect(as.toCachedDefaults().showLevelMeter).toBe(true);
  });

  // showLiveAnalysis
  test("showLiveAnalysis should be false by default", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.showLiveAnalysis).toBe(false);
  });
  test("showLiveAnalysis respects default setting (true)", () => {
    defaultSettings.showLiveAnalysis = true;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.showLiveAnalysis).toBe(true);
  });
  test("showLiveAnalysis dispatches event on change", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.showLiveAnalysis = true;
      },
      as,
      EventType.AS_UPDATE_SHOW_LIVE_ANALYSIS,
    );
    expect(detail.value).toBe(true);
  });

  // liveAnalysisFftSize
  test("liveAnalysisFftSize should be 2048 by default", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveAnalysisFftSize).toBe(2048);
  });
  test("liveAnalysisFftSize respects valid default setting", () => {
    defaultSettings.liveAnalysisFftSize = 1024;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveAnalysisFftSize).toBe(1024);
  });
  test("liveAnalysisFftSize falls back to 2048 for invalid value", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.liveAnalysisFftSize = 999 as never;
    expect(as.liveAnalysisFftSize).toBe(2048);
  });
  test("liveAnalysisFftSize dispatches event on change", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.liveAnalysisFftSize = 512;
      },
      as,
      EventType.AS_UPDATE_LIVE_ANALYSIS_FFT_SIZE,
    );
    expect(detail.value).toBe(512);
  });
  test("liveAnalysisFftSize is persisted via toCachedDefaults", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.liveAnalysisFftSize = 4096;
    expect(as.toCachedDefaults().liveAnalysisFftSize).toBe(4096);
  });

  test("live release defaults to 8 dB/s", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveSpectrumReleaseDbPerSec).toBe(8);
    expect(as.livePolarFieldReleaseDbPerSec).toBe(8);
    expect(as.liveLevelMeterReleaseDbPerSec).toBe(8);
    expect(as.livePolarLevelGatePct).toBe(28);
    expect(as.livePolarSampleRadiusGamma).toBe(1);
    expect(as.livePolarSampleFillBrightnessPct).toBe(10);
  });

  test("livePolarSampleFillBrightnessPct is persisted via toCachedDefaults", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.livePolarSampleFillBrightnessPct = 20;
    expect(as.toCachedDefaults().livePolarSampleFillBrightnessPct).toBe(20);
  });

  test("livePolarSampleRadiusGamma is persisted via toCachedDefaults", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.livePolarSampleRadiusGamma = 0.75;
    expect(as.toCachedDefaults().livePolarSampleRadiusGamma).toBe(0.75);
  });

  test("legacy liveAnalysisVisualSmoothingPct migrates to release dB/s", () => {
    defaultSettings.liveAnalysisVisualSmoothingPct = 80;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveSpectrumReleaseDbPerSec).toBe(1);
    expect(as.livePolarFieldReleaseDbPerSec).toBe(1);
    expect(as.liveLevelMeterReleaseDbPerSec).toBe(1);
    expect(as.liveSpectrumSmoothingPct).toBeGreaterThanOrEqual(78);
  });

  test("liveSpectrumReleaseDbPerSec is persisted via toCachedDefaults", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.liveSpectrumReleaseDbPerSec = 0.5;
    expect(as.toCachedDefaults().liveSpectrumReleaseDbPerSec).toBe(0.5);
  });

  test("liveSpectrumPeakHoldSec should be 0 by default", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveSpectrumPeakHoldSec).toBe(0);
  });

  test("liveSpectrumPeakHoldSec respects default from config", () => {
    defaultSettings.liveSpectrumPeakHoldSec = 1.2;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveSpectrumPeakHoldSec).toBe(1.2);
  });

  test("liveSpectrumPeakHoldSec is clamped on hydrate and assign", () => {
    defaultSettings.liveSpectrumPeakHoldSec = 10;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveSpectrumPeakHoldSec).toBe(3);
    as.liveSpectrumPeakHoldSec = -0.5;
    expect(as.liveSpectrumPeakHoldSec).toBe(0);
    as.liveSpectrumPeakHoldSec = 1.333;
    expect(as.liveSpectrumPeakHoldSec).toBe(1.35);
  });

  test("liveSpectrumPeakHoldSec is persisted via toCachedDefaults", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.liveSpectrumPeakHoldSec = 0.5;
    expect(as.toCachedDefaults().liveSpectrumPeakHoldSec).toBe(0.5);
  });

  test("liveSpectrumPeakHoldSec dispatches event on change", async () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    const detail = await waitEventForAction(
      () => {
        as.liveSpectrumPeakHoldSec = 1;
      },
      as,
      EventType.AS_UPDATE_LIVE_SPECTRUM_PEAK_HOLD,
    );
    expect(detail.value).toBe(1);
  });

  test("liveSoundFieldMode defaults to polarLevel", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveSoundFieldMode).toBe("polarLevel");
  });

  test("liveSpectrumTiltDbPerOct should be 0 by default", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveSpectrumTiltDbPerOct).toBe(0);
  });

  test("liveSpectrumTiltDbPerOct respects default from config", () => {
    defaultSettings.liveSpectrumTiltDbPerOct = 6;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveSpectrumTiltDbPerOct).toBe(6);
  });

  test("liveSpectrumTiltDbPerOct invalid value falls back to 0", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.liveSpectrumTiltDbPerOct = 2.5 as never;
    expect(as.liveSpectrumTiltDbPerOct).toBe(0);
  });

  test("liveMonitoringMode should be lr by default", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveMonitoringMode).toBe("lr");
  });

  test("liveMonitoringMode is persisted via toCachedDefaults", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.liveMonitoringMode = "m";
    expect(as.toCachedDefaults().liveMonitoringMode).toBe("m");
  });

  test('"swap" monitoring mode persists via toCachedDefaults', () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.liveMonitoringMode = "swap";
    expect(as.toCachedDefaults().liveMonitoringMode).toBe("swap");
  });

  test("migrates legacy monitorStereoSwap into liveMonitoringMode swap", () => {
    defaultSettings.liveMonitoringMode = "lr";
    defaultSettings.monitorStereoSwap = true;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveMonitoringMode).toBe("swap");
  });

  test("does not migrate monitorStereoSwap when another channel mode was saved", () => {
    defaultSettings.liveMonitoringMode = "m";
    defaultSettings.monitorStereoSwap = true;
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    expect(as.liveMonitoringMode).toBe("m");
  });

  test("applyMonitorBandsSnapshot sets edges and mask", () => {
    const as = AnalyzeSettingsService.fromDefaultSetting(
      defaultSettings,
      audioBuffer,
    );
    as.applyMonitorBandsSnapshot([30, 70, 200, 800, 4000, 20000], 0b011);
    expect(as.monitorBandSoloMask).toBe(0b011);
  });
});
