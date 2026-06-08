# Configuration Reference

All settings use the `EarAudioPreview.*` namespace, declared in `package.json` → `contributes.configuration`. They can be set in VS Code's `settings.json` or via the FAB settings sheet (which persists to `globalState`).

## Top-level settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `EarAudioPreview.autoAnalyze` | `boolean` | `false` | Run STFT automatically when a file opens |
| `EarAudioPreview.highResolutionSpectrogram` | `boolean` | `false` | Double spectrogram pixel dimensions for sharper rendering |
| `EarAudioPreview.cacheAnalyzeUi` | `boolean` | `true` | Persist analyze settings across files via `globalState` |
| `EarAudioPreview.playerDefault` | `object` | `{}` | Default values for player settings |
| `EarAudioPreview.analyzeDefault` | `object` | `{}` | Default values for analyze and meter settings |

### Example

```jsonc
{
  "EarAudioPreview.autoAnalyze": true,
  "EarAudioPreview.cacheAnalyzeUi": true,
  "EarAudioPreview.analyzeDefault": {
    "showLevelMeter": true,
    "showLiveAnalysis": true,
    "spectrogramVisible": true
  },
  "EarAudioPreview.playerDefault": {
    "initialVolume": 80
  }
}
```

---

## Player settings (`EarAudioPreview.playerDefault`)

| Key | Type | Default | Range | Description |
|-----|------|---------|-------|-------------|
| `volumeUnitDb` | `boolean` | `false` | — | Use dB scale for volume (true) or linear (false) |
| `initialVolumeDb` | `number` | `0.0` | `[-80, 0]` | Initial volume in dB (when `volumeUnitDb` is true) |
| `initialVolume` | `number` | `100` | `[0, 100]` | Initial volume in linear scale |
| `enableSpacekeyPlay` | `boolean` | `false` | — | Toggle playback with spacebar |
| `enableSeekToPlay` | `boolean` | `true` | — | Auto-play after seeking to a new position |
| `enableHpf` | `boolean` | `false` | — | Enable high-pass filter |
| `hpfFrequency` | `number` | `100` | `[10, Nyquist]` | HPF cutoff frequency (Hz) |
| `enableLpf` | `boolean` | `false` | — | Enable low-pass filter |
| `lpfFrequency` | `number` | `100` | `[10, Nyquist]` | LPF cutoff frequency (Hz) |
| `matchFilterFrequencyToSpectrogram` | `boolean` | `false` | — | Tie filter frequencies to spectrogram frequency range |

Both filters use Butterworth (Q = 1/√2) biquad filters. Changing filter settings during playback restarts the source node to apply the new configuration.

---

## Analyze settings (`EarAudioPreview.analyzeDefault`)

### Waveform

| Key | Type | Default | Range | Description |
|-----|------|---------|-------|-------------|
| `waveformVisible` | `boolean` | `true` | — | Show/hide waveform |
| `waveformVerticalScale` | `number` | `1.0` | `[0.2, 2.0]` | Waveform height multiplier |
| `minAmplitude` | `number` | auto | `[-100, 100]` | Lower amplitude bound (auto-expands to fit data) |
| `maxAmplitude` | `number` | auto | `[-100, 100]` | Upper amplitude bound |

### Spectrogram

| Key | Type | Default | Range | Description |
|-----|------|---------|-------|-------------|
| `spectrogramVisible` | `boolean` | `true` | — | Show/hide spectrogram |
| `spectrogramVerticalScale` | `number` | `1.0` | `[0.2, 2.0]` | Spectrogram height multiplier |
| `windowSizeIndex` | `number` | `2` | `[0, 7]` | FFT size: 0→256, 1→512, 2→1024, 3→2048, 4→4096, 5→8192, 6→16384, 7→32768 |
| `fftWindowAuto` | `boolean` | `false` | — | Auto-select FFT size based on visible time range and canvas width |
| `minFrequency` | `number` | `0` | `[0, Nyquist]` | Lower frequency bound (Hz) |
| `maxFrequency` | `number` | `sampleRate/2` | `[0, Nyquist]` | Upper frequency bound (Hz) |
| `spectrogramAmplitudeRange` | `number` | `-90` | `[-1000, 0]` | Legacy dB range (superseded by low/high) |
| `spectrogramAmplitudeLow` | `number` | `-90` | `[-1000, 0]` | Lower dB bound for colormap |
| `spectrogramAmplitudeHigh` | `number` | `0` | `[-1000, 0]` | Upper dB bound for colormap |
| `frequencyScale` | `number` | `0` | `[0, 2]` | 0=Linear, 1=Log piecewise, 2=Mel |
| `melFilterNum` | `number` | `40` | `[20, 200]` | Mel filter bank bands |
| `windowType` | `number` | `0` | `[0, 3]` | 0=Hann, 1=Hamming, 2=Blackman-Harris, 3=Triangular |
| `fftBackend` | `number` | `0` | — | 0=Ooura (JS), 1=Essentia.js (WASM) |
| `highResolutionSpectrogram` | `boolean` | `false` | — | Double spectrogram rendering resolution |

Hop size is computed automatically from window size, time range, and canvas width to ensure minimum rectangle width for pixel coverage.

---

## Live analysis settings

| Key | Type | Default | Range | Description |
|-----|------|---------|-------|-------------|
| `showLevelMeter` | `boolean` | `false` | — | Show stereo level meter (right column) |
| `showLiveAnalysis` | `boolean` | `false` | — | Show goniometer + spectrum analyzer |
| `liveAnalysisFftSize` | `number` | `2048` | `512, 1024, 2048, 4096` | FFT size for live analyser nodes |
| `liveSoundFieldMode` | `string` | `"polarLevel"` | `polarSample`, `polarLevel`, `lissajous` | Goniometer display mode |
| `liveSpectrumReleaseDbPerSec` | `number` | `8` | `[0.5, 36]` | Spectrum release rate (dB/s) |
| `liveSpectrumPeakHoldSec` | `number` | `0` | `[0, 3]` | Peak envelope hold before release (seconds) |
| `livePolarFieldReleaseDbPerSec` | `number` | `8` | `[0.5, 36]` | Goniometer trail release rate (dB/s) |
| `liveLevelMeterReleaseDbPerSec` | `number` | `8` | `[0.5, 36]` | Level meter RMS release rate (dB/s) |
| `livePolarLevelGatePct` | `number` | `28` | `[0, 100]` | Polar Level directional gate (% of peak, 0=off) |
| `livePolarSampleRadiusGamma` | `number` | `1` | `[0.5, 2]` | Polar Sample radial gamma (1=linear) |
| `livePolarSampleFillBrightnessPct` | `number` | `10` | — | Polar Sample scatter fill brightness boost |
| `liveSpectrumTiltDbPerOct` | `number` | `0` | `0, 1.5, 3, 4.5, 6` | Spectrum display tilt (dB/oct, anchored at 1 kHz) |

### Monitoring

| Key | Type | Default | Values | Description |
|-----|------|---------|--------|-------------|
| `liveMonitoringMode` | `string` | `"lr"` | `lr`, `swap`, `l`, `r`, `m`, `s` | Monitor solo mode |
| `monitorBandEdgesHz` | `number[]` | `[20, 60, 240, 900, 5000, 24000]` | 6 ascending Hz values | 5-band crossover edges |
| `monitorBandSoloMask` | `number` | `0` | 5-bit mask | Active band solo (0 or `0b11111` = bypass) |

---

## Persistence

When `EarAudioPreview.cacheAnalyzeUi` is `true` (default), the settings sheet values are persisted to `globalState` under the key `earAudioPreview.analyzeUiCache.v1`. The extension host merges cached values on top of workspace defaults on each file open.

The webview sends `SAVE_ANALYZE_UI` messages debounced at 500 ms. Only changed settings trigger a dispatch. The full cached state is serialized via `AnalyzeSettingsService.toCachedDefaults()`.

### Cache migration

Legacy smoothing percentage fields (`liveSpectrumSmoothingPct`, `livePolarFieldSmoothingPct`, `liveLevelMeterSmoothingPct`, `liveAnalysisVisualSmoothingPct`) are migrated to their dB/s equivalents on load. The `monitorStereoSwap` boolean is folded into `liveMonitoringMode: "swap"`.
