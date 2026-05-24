<div align="center">

[![CI](https://github.com/DDDPG/vscode-audio-preview/actions/workflows/ci.yml/badge.svg)](https://github.com/DDDPG/vscode-audio-preview/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/api/extension-guides/custom-editors)

</div>

<br />

<div align="center">
  <img src="ear_audio.png" alt="EAR Audio Preview" width="100" />

  # EAR Audio Preview

  **A professional-grade audio analysis tool inside VS Code.**

  Waveform · GPU Spectrogram · Goniometer · Phase Correlation
  <br />LUFS Loudness · True Peak · Stereo Metering · WAV Export

  [![earlab](https://img.shields.io/badge/earlab-Eps--Acoustic--Revolution--Lab-2ea44f?logo=github)](https://github.com/Eps-Acoustic-Revolution-Lab)

</div>

<br />

> [!NOTE]
> This project began as a fork of [sukumo28/vscode-audio-preview](https://github.com/sukumo28/vscode-audio-preview) but has been **comprehensively rebuilt** — every major subsystem (decode, FFT, rendering, metering, loudness, configuration) was replaced or substantially rewritten. The only surviving artifact from upstream is the `postMessage` wire protocol. See [What's new](#whats-new) for details.

---

## What's new

The upstream extension pioneered the VS Code Custom Editor model for audio, but its monolithic FFmpeg WASM decoder required Docker to build. This project replaces the entire stack while keeping the same extension-host-to-webview message contract.

| Subsystem | Upstream | This project |
|---|---|---|
| **Decode** | Single FFmpeg WASM (Docker build) | Per-format WASM decoders + Web Audio fallback |
| **Spectrogram** | Canvas2D point-by-point | WebGL2 GPU texture renderer (~7× faster) |
| **FFT** | Ooura only | Ooura + Essentia.js (multi-window, LUFS) |
| **Metering** | Basic waveform only | LUFS, true peak, goniometer, phase correlation spectrum, stereo level meter |
| **Live monitoring** | None | Full analyser tap: L/R/M/S solo, 5-band monitor matrix |
| **Loudness** | None | Offline EBU R128 profile + live loudness-worklet |
| **Onboarding** | Docker + manual build | `npm install && npm run webpack` |

---

## Quick Start

```sh
git clone https://github.com/DDDPG/vscode-audio-preview.git
cd vscode-audio-preview
npm install
npm run webpack
```

Press **F5** in VS Code, open any audio file, and the editor activates automatically.

To make Audio Preview the default for audio files:

```jsonc
"workbench.editorAssociations": {
  "*.wav":  "wavPreview.audioPreview",
  "*.mp3":  "wavPreview.audioPreview",
  "*.flac": "wavPreview.audioPreview",
  "*.ogg":  "wavPreview.audioPreview",
  "*.opus": "wavPreview.audioPreview",
  "*.aac":  "wavPreview.audioPreview",
  "*.m4a":  "wavPreview.audioPreview"
}
```

---

## Capabilities

### Supported Formats

| Extension | Decoder |
|-----------|---------|
| `.wav` `.aac` `.m4a` `.sph` | Browser `decodeAudioData` |
| `.mp3` | `mpg123-decoder` (WASM worker) |
| `.flac` | `@wasm-audio-decoders/flac` |
| `.ogg` | Ogg Vorbis WASM |
| `.opus` | `ogg-opus-decoder` |

Files stream from the extension host in 3 MB chunks. The webview assembles the full buffer, then decodes in one pass. A circular SVG progress ring on the FAB button tracks transfer + decode progress.

### Workspace Panes

Four tabbed views, each mounted lazily on first access:

| Pane | Purpose |
|------|---------|
| **STFT** | Multi-channel waveform + GPU spectrogram with drag-to-zoom on time, frequency, and amplitude axes. Right-click to reset any axis. |
| **Live Spec** | Real-time goniometer (3 modes), per-bin phase correlation spectrum, log-spaced spectral bars with peak hold and configurable HF tilt. Expandable to fullscreen. |
| **Loudness** | Offline EBU R128 profile over the full file — integrated/short-term/momentary LUFS curves, true-peak markers, LRA, PLR. Drag to select a time region. |
| **Edit & Export** | WAV export of selected region (EasyCut). |

### Live Monitoring

Enable **Show live analysis** in the FAB settings sheet. A dedicated analyser node taps the playback graph without affecting the main output:

- **Stereo level meter** (right column) — L/R or M/S RMS + peak bars, peak-hold with 2 s decay, clip LEDs. Resizable width. Green → yellow → red gradient.
- **Goniometer** — three sound-field modes: **Polar Sample** (scatter), **Polar Level** (Insight-style directional gate), and **Lissajous**. WebGL2 or Canvas2D rendering.
- **Phase correlation spectrum** — per-frequency-bin ρ ∈ [−1, 1] plus broadband correlation readout.
- **Live spectrum analyzer** — log-spaced bars, configurable release rate (dB/s), peak hold, and per-octave tilt (0–6 dB/oct).
- **Monitoring matrix** — solo L, R, M (mid), or S (side). 5-band parametric monitor with configurable crossover edges.
- **Fullscreen overlay** — click **↗** to expand the Live Spec pane; **Esc** or right-click to close.

### FFT & Analysis

Two backends, switchable at any time:

| Backend | Strengths |
|---------|-----------|
| **Ooura** (default) | Pure JS, instant startup, fast for most workloads |
| **Essentia.js** | Hann, Hamming, Blackman-Harris, Triangular windows + offline LUFS |

Frequency scales: **linear**, **log piecewise**, or **mel** (configurable filter bank). Optional **auto-FFT** mode adapts window size to the visible time range for optimal frequency resolution. **High-resolution mode** doubles spectrogram pixel dimensions for pixel-dense displays.

### Loudness & Dynamics

- **Offline profile** — `LoudnessService` runs an `OfflineAudioContext` with `loudness-worklet` over the full file. Produces LUFS-M/S/I curves, LRA, PLR, and max true-peak. BSpline-smoothed for display.
- **True peak** everywhere — `ebur128-wasm` powers per-window true-peak in waveform hover readouts, per-buffer true-peak in the level meter, and full-file true-peak in the info table.
- **Live EBU R128** — `loudness-worklet` provides real-time LUFS-M/S/I during playback. Session max true-peak is tracked continuously.

### Graph Interaction

Consistent across waveform, spectrogram, and loudness panes:

| Action | Result |
|--------|--------|
| **Click** | Set cue position (white line) |
| **Drag** | Select range → re-analyze with new bounds |
| **Ctrl + drag** | Constrain to time axis only |
| **Shift + drag** | Constrain to value axis only |
| **Right-click** | Reset view range (Ctrl/Shift for single-axis reset) |
| **Hover** | RMS, peak, true-peak, and frequency readout |

### Playback

Full Web Audio graph: **source → HPF/LPF biquad filters → gain → destination**. Optional auto-play on seek, spacebar toggle, dB or linear volume scale. The live monitoring sub-graph (splitter → analysers → gain matrix → merger) connects in parallel when enabled.

---

## Architecture

```
┌── Extension Host (Node.js) ────────────────────────────────────┐
│  AudioPreviewEditorProvider                                    │
│  Chunked streaming (3 MB) · VS Code settings · globalState     │
└──────────────────────┬─────────────────────────────────────────┘
                       │ postMessage: CONFIG · DATA · RELOAD
┌──────────────────────▼─────────────────────────────────────────┐
│  Webview (browser sandbox)                                     │
│                                                                │
│  DecoderFactory ──→ PlayerService (Web Audio graph + live tap) │
│      │                    │                                    │
│      │                    └──→ Live meters (Level · Gonio ·    │
│      │                         Spectrum · Phase Correlation)   │
│      │                                                         │
│      └──→ AnalyzeService (Ooura / Essentia STFT)               │
│                └──→ SpectrogramRenderer (WebGL2, twgl.js)      │
│                                                                │
│  LoudnessService (OfflineAudioContext + ebur128-wasm)          │
│                                                                │
│  Workspace panes: STFT | Live Spec | Loudness | Edit           │
│  All services extend Service → EventTarget                     │
│  All UI extends Component → Disposable                         │
└────────────────────────────────────────────────────────────────┘
```

Message types: `src/message.ts`. Deep dive into component tree, event system, and CSS layout conventions: [CLAUDE.md](./CLAUDE.md).

Benchmarks (Apple Silicon, 300 s stereo file): spectrogram CPU pack **~41 ms → ~6 ms** with WebGL2.

---

## Usage

### UI Layout

| Element | Location | Role |
|---------|----------|------|
| **Info table** | Top-left | Metadata: format, sample rate, bit depth, duration, true peak |
| **Player bar** | Top-right | Play/pause, volume, seek bar, time readout |
| **Workspace tabs** | Below player | STFT · Live Spec · Loudness · Edit & Export |
| **FAB** | Bottom-left | Settings sheet: Options / Player / EasyCut |
| **Monitoring bar** | Below info table | Solo L, R, M (mid), or S (side) |

### Settings

Click the FAB (bottom-left) to open the settings sheet. Three tabs:

- **Options** — waveform/spectrogram toggles, FFT size, frequency scale, dB range, window type, FFT backend, auto-FFT, high-res mode, live analysis toggles
- **Player** — HPF/LPF filters, frequency cutoffs, volume scale, seek behavior
- **EasyCut** — WAV export of selected region

Settings persist to VS Code `globalState` (debounced, 500 ms). Full configuration reference: [doc/configuration.md](./doc/configuration.md).

---

## Development

```sh
npm install
npm run webpack-dev    # watch mode
npm test               # Jest (jsdom + jest-canvas-mock)
npm run lint           # ESLint
npm run format         # Prettier
```

| Script | Purpose |
|--------|---------|
| `npm run webpack` | One-shot build → `dist/` |
| `npm run webpack-dev` | Watch + rebuild |
| `npm test` | Unit tests |
| `npm run lint-check` / `format-check` | CI checks |

### Build targets

Three webpack outputs: `dist/extension.js` (Node), `dist/audioPreview.js` (webview), `dist/web/extension.js` (VS Code for Web).

### Key dependencies

| Layer | Packages |
|-------|----------|
| Decode | `mpg123-decoder`, `@wasm-audio-decoders/flac`, `@wasm-audio-decoders/ogg-vorbis`, `ogg-opus-decoder` |
| FFT | `ooura`, `essentia.js` |
| GPU | `twgl.js` (WebGL2) |
| Loudness | `loudness-worklet`, `ebur128-wasm` |

---

## Roadmap

### Done

- [x] Per-format WASM decoders (no Docker)
- [x] WebGL2 GPU spectrogram
- [x] Essentia FFT backend + offline LUFS
- [x] Four workspace panes (STFT / Live Spec / Loudness / Edit)
- [x] Stereo level meter (L/R and M/S, resizable)
- [x] Live log spectrum (peak hold, configurable release, HF tilt)
- [x] Goniometer (polar sample / polar level / Lissajous)
- [x] Frequency-domain phase correlation spectrum
- [x] Live + offline EBU R128 loudness (LUFS, LRA, PLR, true peak)
- [x] `ebur128-wasm` true peak (file, window, buffer levels)
- [x] Live monitoring matrix (L/R/M/S + 5-band solo)
- [x] Mid/side derived offline analysis
- [x] Loudness profile pane with BSpline-smoothed curves
- [x] Auto-FFT window inference from visible time range
- [x] Settings persistence via `globalState`

### Planned

- [ ] Pitch (F0) curve overlay
- [ ] Chromagram strip (CQT)
- [ ] Onset detection / structure markers
- [ ] Frequency-weighted RMS (dBA, dB-B, dB-C)
- [ ] Edit tab wire-up to EasyCut

See [open issues](https://github.com/DDDPG/vscode-audio-preview/issues).

---

## Contributing

Bug reports, documentation, and pull requests are welcome.

1. Fork the repo
2. `git checkout -b feature/amazing-feature`
3. Commit and push
4. Open a Pull Request

Run `npm test && npm run lint-check` before submitting.

---

## License

MIT — see [LICENSE](./LICENSE).

Original work copyright (c) 2020 [sukumo28](https://github.com/sukumo28). Fork modifications © [earlab](https://github.com/Eps-Acoustic-Revolution-Lab) contributors.

---

## Acknowledgments

- [earlab](https://github.com/Eps-Acoustic-Revolution-Lab) — development and maintenance
- [sukumo28](https://github.com/sukumo28) — original Custom Editor foundation
- [Microsoft custom-editor-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/custom-editor-sample)
- Audio DSP stack: Ooura, Essentia.js, mpg123-decoder, wasm-audio-decoders, loudness-worklet, ebur128-wasm, twgl.js
