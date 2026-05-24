# Live Monitoring

The live monitoring system provides real-time audio analysis during playback. A dedicated analyser sub-graph taps the playback signal in parallel without affecting the main output.

## Signal chain

```
source → [HPF] → [LPF] → gain → [monitor band matrix] → destination
                                └→ loudness-worklet ─┐
                                                       ├→ splitter → analyser L → gain LL → merger → destination
                                                       │           → analyser R → gain LR ↗
                                                       │                         → gain RL ↘
                                                       │                         → gain RR → merger → destination
```

The splitter → analyser → gain-matrix → merger sub-graph is created on demand when `showLevelMeter` or `showLiveAnalysis` is enabled, and destroyed when both are off. This avoids unnecessary CPU usage when meters are hidden.

### Monitoring matrix

The 2×2 gain matrix (`gLL`, `gLR`, `gRL`, `gRR`) routes analyser outputs to stereo channels based on the selected monitoring mode:

| Mode | L output | R output |
|------|----------|----------|
| `lr` | analyser L | analyser R |
| `swap` | analyser R | analyser L |
| `l` | analyser L | analyser L |
| `r` | analyser R | analyser R |
| `m` | (L+R)/2 | (L+R)/2 |
| `s` | (L−R)/2 | (L−R)/2 |

### 5-band monitor solo

When monitor band solo is active (mask ≠ 0 and ≠ `0b11111`), the signal passes through a bank of cascaded biquad bandpass filters before reaching the splitter. Each band uses two cascaded Butterworth (Q = 1/√2) filters per edge (~4th-order rolloff) to reduce adjacent-band bleed. The solo mask selects which of the 5 bands pass through; inactive bands are silenced.

Default band edges: 20 Hz, 60 Hz, 240 Hz, 900 Hz, 5000 Hz, 24000 Hz. These are configurable via `monitorBandEdgesHz`.

---

## Components

### Level Meter (`LevelMeterComponent`)

Rendered in the right column (`#liveMetersRight`). Width is controlled by CSS variable `--meter-col-width` (0 when hidden, resizable 72–220 px when visible).

- **Display mode**: L/R (default) or M/S (right-click to toggle)
- **Per channel**: RMS bar (semi-transparent overlay), peak bar (solid), peak-hold line (white, 2 s decay), clip LED (red circle, click to clear)
- **Scale**: 0, −3, −6, −12, −18, −24, −36, −48, −60 dBFS ticks
- **Color**: green (below −12 dBFS) → yellow (−12 to −3) → red (above −3)
- **Rendering**: Canvas2D with `devicePixelRatio` scaling
- **True peak**: Per-buffer true peak via `ebur128-wasm` updates the clip LED and peak-hold

### Goniometer (`GoniometerComponent`)

Stereo phase/correlation display. Three modes:

| Mode | Description |
|------|-------------|
| **Polar Sample** | Scatter plot of individual samples in polar coordinates. Configurable radial gamma and fill brightness. |
| **Polar Level** | Insight 2-style directional level display. Uses a configurable gate (% of peak) to suppress noise. |
| **Lissajous** | Classic X/Y oscilloscope view of L vs R. |

Rendering backends: WebGL2 (preferred, via `twgl.js`) or Canvas2D fallback. A correlation bar below the display shows the broadband phase correlation coefficient.

### Phase Correlation Spectrum (`PhaseCorrelationSpectrumComponent`)

Computes per-frequency-bin phase correlation ρ ∈ [−1, 1] from the live analyser FFT data. Plots ρ against frequency. Includes a broadband (full-bandwidth) correlation readout. Zero-phase bins (silence) are excluded.

### Spectral Analyzer (`SpectralAnalyzerComponent`)

Log-spaced frequency bars derived from the analyser node's FFT data:

- **Ballistics**: Configurable release rate in dB/s (range 0.5–36), peak hold time (0–3 s)
- **Tilt**: Per-octave tilt anchored at 1 kHz (0, 1.5, 3, 4.5, or 6 dB/oct), simulates the natural spectral slope of acoustic content
- **Frequency axis**: Log-spaced bins computed via `liveLogSpectrumAxis`
- **Hover readout**: Frequency + level on mouse hover

### Loudness Worklet (`loudness-worklet`)

A separate `AudioWorkletNode` (`LoudnessWorkletNode`) connects between the gain node and the splitter. It computes EBU R128 measurements (LUFS-M/S/I, LRA, max true peak) at 50 ms intervals and posts them to the main thread via `port.onmessage`.

The worklet is loaded lazily on first play. During the loading gap, the signal passes directly to the splitter; once the worklet is ready, the graph is rewired to insert it in the chain.

Session max true peak is tracked across the entire playback session and displayed in the loudness pane.

---

## Live Spec Layout

The Live Spec pane uses a vertically split layout:

```
┌──────────────────────────┐
│ ↗ [expand button]        │
├──────────────────────────┤
│ Goniometer               │
│ (with correlation bar)   │
├────── resize handle ─────┤
│ Phase Correlation        │
│ Spectrum                 │
├────── resize handle ─────┤
│ Spectrum Analyzer        │
│ (log bars)               │
└──────────────────────────┘
```

Split handles are draggable (`ns-resize` cursor). The **↗** button opens a fixed fullscreen overlay (`z-index: 9999`) with the same layout. **Esc**, right-click on the backdrop, or right-click on the canvas closes it.

---

## FFT Sizing

Live analyser FFT size is configurable (512, 1024, 2048, or 4096). Larger sizes give finer frequency resolution at the cost of reduced time resolution. The analyser nodes use `smoothingTimeConstant = 0` (no time smoothing) — all smoothing is handled in the application-layer ballistics for precise control.

Changing the FFT size does not glitch playback since analyser nodes are not in the signal path (they tap, not block).
