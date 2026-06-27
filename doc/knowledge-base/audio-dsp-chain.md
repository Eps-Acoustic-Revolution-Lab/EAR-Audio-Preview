# Audio Signal Chain & DSP Algorithms

## Decoding Pipeline

### Decoder Factory (`src/webview/decoders/decoderFactory.ts`)

Two-layer fallback strategy:

1. **WASM decoders** — For formats with dedicated WASM workers:
   - MP3 → `mpg123-decoder` (`MPEGDecoderWebWorker`)
   - FLAC → `@wasm-audio-decoders/flac` (`FLACDecoderWebWorker`)
   - OGG → Try Vorbis first (`OggVorbisDecoderWebWorker`), fall back to Opus (`OggOpusDecoderWebWorker`)
   - OPUS → `ogg-opus-decoder` (`OggOpusDecoderWebWorker`)

2. **Web Audio API** — Browser's native `decodeAudioData` for WAV, AAC, M4A, SPH

All decoders implement `IAudioDecoder` interface:
```typescript
interface IAudioDecoder {
  numChannels, sampleRate, duration, length, format, encoding, bitDepth, fileSize
  samples: Float32Array[]  // per-channel PCM data
  readAudioInfo(): void    // parse header (fast path)
  decode(): void           // decode audio (heavy path)
  dispose(): void
}
```

Key design: `readAudioInfo()` is called first for instant metadata display, then `decode()` runs for the full PCM data. The webview shows a progress ring during this process.

### Bit Depth Detection

`audioFileBitDepth.ts` parses FLAC stream info blocks to extract bits-per-sample. WAV bit depth comes from the container header via `WebAudioDecoder`. Lossy formats (MP3, AAC) report `null`.

## Playback Signal Chain

Built in `PlayerService` using Web Audio API nodes:

```
BufferSource → [HPF BiquadFilter] → [LPF BiquadFilter] → GainNode → [HeadphoneEQ BiquadFilter chain] → destination
                                                              │
                                                              ├→ [MonitorBandMatrix] → ChannelSplitter → AnalyserL/R → GainMatrix → ChannelMerger → destination
                                                              │
                                                              └→ LoudnessWorkletNode (EBU R128)
```

### Biquad Filters

- **HPF/LPF**: Butterworth (Q = 1/√2) biquad filters. Changing filter settings during playback restarts the source node.
- **Headphone EQ**: Chain of parametric EQ biquad filters generated from AutoEq presets. Applied live; not baked into exports.
- **Monitor band matrix**: 5-band crossover using cascaded Butterworth biquad pairs (~4th-order rolloff). Default edges: 20/60/240/900/5000/24000 Hz.

### Monitoring Matrix

The 2×2 gain matrix routes analyser outputs to stereo channels:

| Mode | L output | R output |
|------|----------|----------|
| `lr` | Analyser L | Analyser R |
| `swap` | Analyser R | Analyser L |
| `l` | Analyser L | Analyser L |
| `r` | Analyser R | Analyser R |
| `m` | (L+R)/2 | (L+R)/2 |
| `s` | (L−R)/2 | (L−R)/2 |

### Volume Mapping

`volumeMapping.ts` provides conversion between linear [0,100] and dB [-80,0] volume scales. The gain node value follows the selected scale.

## STFT Analysis

Two backends, switchable at runtime:

### Ooura Backend (default)

Pure JavaScript FFT using the `ooura` package. Fast startup, handles Hann windowing only. Used for the webview-side spectrogram computation.

### Essentia.js Backend

WASM-based FFT via `essentia.js`. Supports multiple window types:
- **Index 0**: Hann
- **Index 1**: Hamming
- **Index 2**: Blackman-Harris
- **Index 3**: Triangular

Runs in the **extension host** (Node.js) for CSP safety. The computation flow (`stftEssentiaCompute.ts`):

1. Compute frame centers based on start/end indices and hop size
2. For each frame:
   - Extract windowed segment from channel data
   - `essentia.arrayToVector()` → `essentia.Windowing()` → `essentia.Spectrum()`
   - Compute power spectrum (magnitude²)
3. Convert power → dB (normalized to max frame power)
4. Return as `StftSpectrogramWire` (flat ArrayBuffer for efficient transfer)

Yields to main thread every 32 frames to keep the host responsive.

### Spectrogram Rendering

GPU-accelerated via WebGL2 using `twgl.js`:
- dB values packed as textures
- Fragment shaders apply colormap
- Supports linear, log piecewise, and mel frequency scales
- High-resolution mode doubles pixel dimensions for HiDPI displays
- Auto-FFT mode adapts window size to visible time range

Hop size is computed from window size, time range, and canvas width to ensure minimum rectangle width for pixel coverage.

## Loudness Analysis

### Offline Profile (`LoudnessService`)

Runs an `OfflineAudioContext` with `loudness-worklet` over the full file to produce:
- LUFS-M (momentary), LUFS-S (short-term), LUFS-I (integrated) curves
- LRA (Loudness Range)
- PLR (Peak-to-Loudness Ratio)
- Max true peak (dBTP)

Results are B-spline smoothed (`quinticBSpline.ts`) for display.

### Live Loudness (`loudness-worklet`)

AudioWorklet node computing EBU R128 measurements at 50 ms intervals during playback. Loaded lazily on first play. Session max true peak tracked across entire playback.

### True Peak (`ebur128-wasm`)

ITU-R BS.1770 true peak detection used in three contexts:
1. **Waveform hover**: Per-window true peak on cursor readout
2. **Level meter**: Per-buffer true peak updates clip LEDs
3. **Info table**: Full-file true peak

## Sequence Feature Analysis

Runs in the extension host via Essentia.js:

### F0 (Fundamental Frequency)
- Algorithm: `PitchYinFFT` from Essentia
- Hop-based processing via `sequenceHop.ts`
- Unvoiced frames left blank in display
- Log scale (Hz) on the loudness pane's F0 strip

### Onset Detection
- Algorithm: `Flux` (spectral flux) from Essentia with half-rectified L2 norm
- Displays as onset strength on the loudness pane's onset strip

## Live Analysis Components

### Spectral Analyzer
- Log-spaced frequency bars from FFT data
- Ballistics via `liveBallistics.ts`: configurable release rate (dB/s), peak hold (seconds)
- Per-octave tilt anchored at 1 kHz (0, 1.5, 3, 4.5, 6 dB/oct)
- Frequency axis via `liveLogSpectrumAxis.ts`

### Goniometer
Three modes:
- **Polar Sample**: Scatter plot with configurable radial gamma and fill brightness
- **Polar Level**: Insight 2-style directional display with configurable gate
- **Lissajous**: Classic X/Y oscilloscope

Rendering: WebGL2 preferred (via `twgl.js`), Canvas2D fallback. Stereo correlation computed by `stereoPolarField.ts`.

### Phase Correlation Spectrum
- Per-frequency-bin correlation ρ ∈ [−1, 1]
- Computed from live analyser FFT data (`frequencyPhaseCorrelation.ts`)
- Zero-phase bins excluded
- Color: red (out-of-phase) → green (in-phase)

### Level Meter
- L/R or M/S display modes (right-click to toggle)
- RMS bar, peak bar, peak-hold line (2s decay), clip LED
- Color gradient: green (<−12 dBFS) → yellow (−12 to −3) → red (>−3)
- Canvas2D with devicePixelRatio scaling

## Interpolation & Math Utilities

| Module | Algorithm |
|--------|-----------|
| `quinticBSpline.ts` | Quintic B-spline smoothing for loudness curves |
| `modifiedAkima.ts` | Modified Akima interpolation for EQ curve visualization |
| `eqCanvasMath.ts` | Frequency response calculation for PEQ biquad chains |
| `liveBallistics.ts` | Time-domain ballistics (attack/release/hold) for live meters |
| `timelinePlotLayout.ts` | Timeline axis layout with waveform alignment |
| `timelineStripChart.ts` | Multi-strip chart rendering for loudness pane |
| `spectrogramFrequencyLayout.ts` | Frequency scale mapping (linear/log/mel) |
