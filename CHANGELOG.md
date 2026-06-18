# Changelog

All notable changes to **EAR Audio Preview** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-06-18

### Added

- **Headphone curve correction (Monitor)** — real-time parametric EQ compensation via Web Audio `BiquadFilterNode`, integrated into the Transport FAB Monitor popover
- **AutoEq integration** — search [autoeq.app](https://autoeq.app) for headphone models; extension host proxies API calls (entries, targets, PEQ presets) so the webview stays CSP-safe
- **Curve Correction overlay** — full-screen panel for model search, frequency-response visualization, parametric band editing, and BYPASS toggle (`Cmd+Shift+E` / `Ctrl+Shift+E`)
- **EQ preset persistence** — save profiles to workspace (`.vscode/ear-headphone-eq.json`) or extension `globalState`; load on open with per-workspace override
- **EQ monitor strip** — compact profile summary row in the Monitor section (model, target, bypass state)
- **Setting** `EarAudioPreview.headphoneEq.bypassByDefault` — safe default: bypass correction when no saved profile exists

### Changed

- **README** — headphone EQ usage, network/privacy notes for AutoEq; roadmap item marked done
- Removed obsolete `audio-preview-perf-upgrade-plan.md` and unused `images/how-to-use.gif`

### Notes

- v0.3.0 applies headphone EQ to **live playback only**; Edit & Export processed output is not yet baked with the correction curve.

## [0.2.0] - 2026-06-08

First public release on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/) under publisher **Eps-Acoustic-Revolution-Lab**.

### Added

- **Edit & Export pane** — region selection, preview listen, and WAV export (`audioExportService`, `editListenService`, `editExportSettingsService`)
- **Settings overlay** — gear-triggered popover (`metaFab` + `settingsOverlay`) replacing the bottom-sheet FAB sheet
- **Keyboard shortcuts overlay** — in-editor shortcut reference panel
- **Transport FAB** — compact bottom-left play/volume/monitor popover; seek bar lives in the STFT waveform area
- **ear-eq UI kit** — design tokens, rotary knob, segmented controls, and sliding-focus tab chrome
- **Loudness multi-strip timeline** — stacked LUFS, F0 (PitchYinFFT), and onset-flux strips on a shared time axis with drag-to-select
- **Extension-host Essentia analysis** — STFT and sequence features (F0, spectral flux) offloaded to the Node.js host for CSP-safe Essentia.js (`essentiaHost`, `stftHost`, `sequenceFeatureHost`, `essentiaHostClient`)
- **Timeline strip chart utilities** — reusable strip rendering and `timelinePlotLayout` for waveform/LUFS alignment
- **Hearing protection** — optional peak-dBFS mute threshold in Player settings

### Changed

- **Extension identity** — package name `wav-preview` → `ear-audio-preview`; marketplace ID `Eps-Acoustic-Revolution-Lab.ear-audio-preview`
- **Runtime identifiers** renamed from upstream legacy names to EAR branding:
  - Custom editor `viewType`: `wavPreview.audioPreview` → `earAudioPreview.audioPreview`
  - Settings namespace: `WavPreview.*` → `EarAudioPreview.*`
  - Analyze UI cache key: `wavPreview.analyzeUiCache.v1` → `earAudioPreview.analyzeUiCache.v1`
  - Webview cursor readout event: `wav-preview-cursor-readout` → `ear-audio-preview-cursor-readout`
- **Workspace chrome** — minimal top tab bar; transport and settings moved to bottom-left FABs
- **Loudness pane** — fixed chart height on tab re-entry; LUFS curve aligned with waveform timeline
- **Player bar** — playback controls consolidated into Transport FAB; global header transport removed
- **Edit pane** — `easyCut` module replaced by full `editExport` workflow with ear-eq panel surfaces

### Migration

Users with manual `settings.json` entries must update `workbench.editorAssociations` and rename `WavPreview.*` keys to `EarAudioPreview.*`. See README → *Migrating from upstream or older builds*.

Analyze UI cache stored under the old `wavPreview.analyzeUiCache.v1` key is not migrated; panel settings reset once after upgrade.

## [0.1.0] - 2026-05-24

Initial release of **EAR Audio Preview** by [Eps-Acoustic-Revolution-Lab](https://github.com/Eps-Acoustic-Revolution-Lab) — a professional-grade audio analysis Custom Editor for VS Code. Rebuilt from the upstream [vscode-audio-preview](https://github.com/sukumo28/vscode-audio-preview) foundation with an entirely new decode, DSP, rendering, and metering stack.

### Added

#### Core editor

- VS Code **Custom Editor** for in-workspace audio preview and analysis
- Chunked file streaming from the extension host (3 MB chunks) with decode progress on the FAB ring
- Settings persistence via extension `globalState` (debounced analyze UI cache)
- Workspace trust support with limited capability in untrusted workspaces

#### Supported formats

| Extension | Decoder |
|-----------|---------|
| `.wav` `.aac` `.m4a` `.sph` | Browser `decodeAudioData` |
| `.mp3` | `mpg123-decoder` (WASM worker) |
| `.flac` | `@wasm-audio-decoders/flac` |
| `.ogg` | Ogg Vorbis WASM |
| `.opus` | `ogg-opus-decoder` |

#### Workspace panes

- **STFT** — multi-channel waveform + GPU spectrogram with drag-to-zoom on time, frequency, and amplitude axes
- **Live Spec** — real-time goniometer, phase-correlation spectrum, and log-spaced spectral analyzer with peak hold and HF tilt; expandable fullscreen
- **Loudness** — offline EBU R128 profile (integrated / short-term / momentary LUFS, LRA, PLR, true-peak markers) with time-region selection
- **Edit & Export** — WAV export of selected time regions (EasyCut)

#### Decode & playback

- Per-format WASM decoders — no Docker or FFmpeg build step required
- Full Web Audio playback graph: source → HPF/LPF biquad → gain → destination
- Optional auto-play on seek, spacebar toggle, dB or linear volume scale
- Playback filters with optional spectrogram frequency-range sync

#### Analysis & visualization

- **WebGL2 GPU spectrogram** via `twgl.js` (~7× faster than Canvas2D on Apple Silicon benchmarks)
- Dual FFT backends: **Ooura** (default, pure JS) and **Essentia.js** (multi-window, offline LUFS)
- Frequency scales: linear, log piecewise, and mel
- Auto-FFT mode adapting window size to visible time range
- High-resolution spectrogram canvas option for high-DPI displays
- Hover readouts: RMS, peak, true-peak on waveform; frequency and dB on spectrogram
- Consistent graph interaction: click to cue, drag to zoom/select, right-click to reset (Ctrl/Shift for axis constraints)

#### Live monitoring

- Analyser tap on the playback graph (no impact on main output)
- Stereo level meter — L/R or M/S RMS + peak bars with peak-hold and clip LEDs
- Goniometer — Polar Sample, Polar Level, and Lissajous modes (WebGL2 or Canvas2D)
- Per-bin phase correlation spectrum (ρ ∈ [−1, 1])
- Live log spectrum analyzer with configurable release rate, peak hold, and HF tilt (0–6 dB/oct)
- Monitoring matrix — solo L, R, M (mid), S (side); 5-band parametric monitor with configurable crossover edges

#### Loudness & dynamics

- Offline EBU R128 loudness profile over the full file (`loudness-worklet` + `OfflineAudioContext`)
- Live EBU R128 metering during playback with session max true-peak tracking
- True peak at file, window, and buffer levels via `ebur128-wasm`
- BSpline-smoothed LUFS curves for display

#### Developer experience

- Webpack build: `dist/extension.js` (Node), `dist/audioPreview.js` (webview), `dist/web/extension.js` (VS Code for Web)
- Jest unit tests with jsdom and jest-canvas-mock
- ESLint + Prettier tooling
- VSIX packaging via `@vscode/vsce` (`npm run vsix`)
- GitHub Actions CI (lint, test, webpack, VSIX package)
- GitHub Actions release workflow (tag-triggered + manual dispatch)

### Changed

- Rebrand from upstream **Wav Preview** to **EAR Audio Preview**
- Publisher, repository, icon, and metadata updated to **Eps-Acoustic-Revolution-Lab** identity
- Node.js CI runtime upgraded to 20
