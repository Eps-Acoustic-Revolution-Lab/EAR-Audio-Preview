export interface Config {
  autoAnalyze: boolean;
  playerDefault: PlayerDefault;
  analyzeDefault: AnalyzeDefault;
  fileExt?: string;
  /** Basename of the opened audio file (for meta popover). */
  fileName?: string;
  /** VS Code webview URI for `dist/loudness.worklet.js` (AudioWorklet module). */
  loudnessWorkletUri?: string;
  /** VS Code webview URI for `dist/essentia-wasm.web.wasm` (Essentia async fallback). */
  essentiaWasmUri?: string;
}

export interface PlayerDefault {
  /*
    Choose the scale of the volume bar
    true: dB scale, false: linear scale
    default: false
  */
  volumeUnitDb: boolean;

  /*
    Initial player volume in dB scale. [-80.0, 0.0]
    This setting is valid when volumeUnitDb is true.
    default: 0.0
  */
  initialVolumeDb: number;

  /*
    Initial player volume in linear scale. [0, 100]
    This setting is valid when volumeUnitDb is false.
    default: 100
  */
  initialVolume: number;

  // When set to true, you can play the audio with the space key
  enableSpacekeyPlay: boolean;

  /*
    Choose whether the audio will automatically play when you seek a new position.
    true: plays on seeking
    false: does not start playing on seeking, but resume playing from input time when audio is already playing
    default: true
  */
  enableSeekToPlay: boolean;

  /*
    Enable high-pass filter on playback.
    true: enable high-pass filter, false: disable high-pass filter
    default: false
  */
  enableHpf: boolean;

  /*
    Cut off frequency for the high-pass filter in Hz. [10, sampleRate/2]
    default: 100
  */
  hpfFrequency: number;

  /*
    Enable low-pass filter on playback.
    true: enable low-pass filter, false: disable low-pass filter
    default: false
  */
  enableLpf: boolean;

  /*
    Cut off frequency for the low-pass filter in Hz. [10, sampleRate/2]
    default: 100
  */
  lpfFrequency: number;

  /*
    Match the filter frequencies to the frequency range of the analyzer.
    Note that if this option is set to true, hpfFrequency and lpfFrequency is overridden by spectrogram frequency range settings.
    true: automatically match the filter frequencies to the analyzer's frequency range
    false: filter frequencies can be set independently of the analyzer's frequency range
    default: false
  */
  matchFilterFrequencyToSpectrogram: boolean;
}

export interface AnalyzeDefault {
  // Settings about WaveForm

  /*
    Make the waveform visible or hidden.
    true: visible, false: hidden
    default: true
  */
  waveformVisible: boolean;

  /*
    Adjust height of the waveform.
    The valid range of [0.2, 2.0] scales the default height.
    default: 1.0
    This option can only be configured through the settings file.
  */
  waveformVerticalScale: number;

  /*
    Range of amplitude displayed on the figure. [-100,100]
    Default value is automatically expanded to fit min and max value of audio data.
  */
  // default: min amplitude of audio data
  minAmplitude: number;
  // default: max amplitude of audio data
  maxAmplitude: number;

  // Settings about Spectrogram

  /*
    Make the spectrogram visible or hidden.
    true: visible, false: hidden
    default: true
  */
  spectrogramVisible: boolean;

  /*
    The valid range of [0.2, 2.0] scales the default height.
    default: 1.0
    This option can only be configured through the settings file.
  */
  spectrogramVerticalScale: number;

  /*
    FFT window sizw. [0,7]
    You can choose from values below.
    0:256, 1:512, 2:1024, 3:2048, 4:4096, 5:8192, 6:16384, 7:32768
    default: 2
  */
  windowSizeIndex: number;

  /**
   * When true, FFT size follows the visible time range (see AnalyzeSettingsService).
   */
  fftWindowAuto?: boolean;

  // Range of frequency displayed on the figure. [0,sampleRate/2]
  // default: 0
  minFrequency: number;
  // default: sampleRate/2
  maxFrequency: number;

  /*
    Range of amplitude(dB) displayed on the spectrogram. [-1000, 0]
    Since the maximum value of Amplitude is adjusted to be 0 dB, set a negative value.
    default: -90
  */
  spectrogramAmplitudeRange: number;

  /*
    Frequency Scale of spectrogram. [0,2]
    You can choose from values below.
    0:Linear, 1:Log, 2:Mel
    default: 0
  */
  frequencyScale: number;

  // Number of filter in melFilterBank. [20, 200]
  // default: 40
  melFilterNum: number;

  /** Window type for STFT (Hann, Hamming, …). Matches WindowType enum. */
  windowType?: number;

  /** FFT backend. 0 = Ooura (faster), 1 = Essentia WASM (multi-window). Matches FftBackend enum. */
  fftBackend?: number;

  /** Spectrogram dB colormap lower bound (e.g. -90). */
  spectrogramAmplitudeLow?: number;

  /** Spectrogram dB colormap upper bound (e.g. 0). */
  spectrogramAmplitudeHigh?: number;

  /**
   * When true, spectrogram canvases use higher pixel dimensions for a sharper plot
   * (more STFT columns per canvas width).
   */
  highResolutionSpectrogram?: boolean;

  /**
   * When true (default), the extension remembers analyze UI settings between files.
   * Controlled by WavPreview.cacheAnalyzeUi; not applied by the webview directly.
   */
  cacheAnalyzeUi?: boolean;

  /** Show the real-time stereo level meter (right column). default: false */
  showLevelMeter?: boolean;

  /** Show the live analysis column (goniometer + spectrum analyzer). default: false */
  showLiveAnalysis?: boolean;

  /** FFT size for live analysers. 512 | 1024 | 2048 | 4096. default: 2048 */
  liveAnalysisFftSize?: 512 | 1024 | 2048 | 4096;

  /**
   * Live release rate (dB/s) for ballistics / trails. Higher = faster decay.
   * Range 0.5–36 dB/s (log-mapped from legacy 0–100 pct). default: 8
   * @deprecated Use per-module release fields below; kept for cache migration.
   */
  liveAnalysisVisualSmoothingPct?: number;

  /** Live spectrum peak/RMS release (dB/s). default: 8 */
  liveSpectrumReleaseDbPerSec?: number;

  /**
   * Peak envelope horizontal hold before release decay (seconds), live spectrum analyzer only.
   * 0 = off (immediate decay). Typical UI range 0–3 in 0.05 s steps. default: 0
   */
  liveSpectrumPeakHoldSec?: number;

  /** Sound-field polar / Lissajous trail release (dB/s). default: 8 */
  livePolarFieldReleaseDbPerSec?: number;

  /** Level meter RMS release (dB/s). default: 8 */
  liveLevelMeterReleaseDbPerSec?: number;

  /**
   * Mute playback when level-meter sample peak exceeds
   * {@link hearingProtectionPeakDbFs}. default: false
   */
  hearingProtectionEnabled?: boolean;

  /** Peak limit for hearing protection (dBFS). default: 6 */
  hearingProtectionPeakDbFs?: number;

  /** @deprecated Migrated to {@link liveSpectrumReleaseDbPerSec}. */
  liveSpectrumSmoothingPct?: number;

  /** @deprecated Migrated to {@link livePolarFieldReleaseDbPerSec}. */
  livePolarFieldSmoothingPct?: number;

  /** @deprecated Migrated to {@link liveLevelMeterReleaseDbPerSec}. */
  liveLevelMeterSmoothingPct?: number;

  /** Polar Level directional gate (% of peak, 0 = off). default: 28 */
  livePolarLevelGatePct?: number;

  /** Polar Sample radial gamma (0.5–2, 1 = linear). default: 1 */
  livePolarSampleRadiusGamma?: number;

  /** Polar Sample scatter fill brightness boost (%). default: 10 */
  livePolarSampleFillBrightnessPct?: number;

  /** Sound-field vectorscope mode (Insight 2–style). default: polarLevel */
  liveSoundFieldMode?: "polarSample" | "polarLevel" | "lissajous";

  /**
   * Spectrum analyzer display tilt (rolloff), dB per octave, applied vs 1 kHz anchor.
   * 0 = off; common values 1.5, 3, 4.5, 6.
   */
  liveSpectrumTiltDbPerOct?: 0 | 1.5 | 3 | 4.5 | 6;

  /**
   * Live monitoring matrix: stereo path for headphones + live meters.
   * "lr" = stereo L→L, R→R; "swap" = stereo with L/R outputs exchanged; other = solo MS/L/R.
   */
  liveMonitoringMode?: "lr" | "swap" | "l" | "r" | "m" | "s";

  /**
   * @deprecated Hydration only — use {@link liveMonitoringMode} `"swap"`. Older UI cache may still emit this flag.
   */
  monitorStereoSwap?: boolean;

  /**
   * Six ascending Hz boundaries for five monitor-band solo paths: band i is `[edges[i],edges[i+1]]`.
   */
  monitorBandEdgesHz?: number[];

  /** 5-bit bitmask of active bands; 0 or 0b11111 = full bandwidth (no extra filtering). */
  monitorBandSoloMask?: number;
}
