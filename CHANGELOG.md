# Changelog

All notable changes to **EAR Audio Preview** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.0] - 2026-07-20

### Added

- **Getting-started tour** — 24-step interactive spotlight onboarding on first open (persisted via `globalState`), replayable anytime from the `?` button top-right. Try-it steps free the pointer and auto-advance on the real action: switching workspace tabs, expanding the Transport monitor panel, toggling the level meter, right-clicking it into M/S, and opening/closing Settings, Curve Correction, the shortcut list and Audio info.
- **Benchmark suite** — `npm run bench` / `bench:size` / `bench:compare`: five-dimension micro-benchmarks (dsp / anim / pipeline / io / render) with per-case ops/s, p95, frame-budget share and alloc-per-op, plus locked speed (+10%) and bundle-size (+1%) regression gates against `bench/baseline.json`.
- **Behavior anchors** — 450+ tests now lock DSP numerics (frame timing, STFT dB layout, log-frequency axis, monitoring matrix, WAV encoding) and cross-process contracts (message types, viewType, persisted keys).
- **Deep-dive blog** — anisotropic spectrogram rendering (time-sharp / frequency-smooth, RX/Audition-style): [English](doc/blog/anisotropic-spectrogram-rendering.en.md) · [中文](doc/blog/anisotropic-spectrogram-rendering.md), linked from the README.

### Changed

- **Measured speedups** (micro-benchmarks vs the locked v0.4.0 baseline): F0/onset sequence analysis **6.4×** (2.97 → 0.46 ms / 3 s clip), offline STFT framing **2.3×** (8.47 → 3.72 ms), spectrogram wire deserialization **3.0×** (1.68 → 0.56 ms), WAV export encoding **1.9×** (5.40 → 2.85 ms / 5 s stereo), one-shot spectrogram analysis **−23%** (34.1 → 26.3 ms); RAF frame-prep paths now allocate zero arrays per frame (was ~6).
- **Sharper zoomed STFT** — FFT window boosted by time-zoom level (capped at W8192; manual larger windows are no longer downgraded) and canvas supersampling raised to dpr×2 (cap 3.5); spectrogram canvas is 10% shorter with top time ticks kept inside the canvas.
- **60 Hz pipeline** — loudness worklet reports at display rate (was 50 ms — 3× the update frequency), F0/onset strips analyze at ~60 frames/s (was ~45), and meter/spectrum ballistics stay frame-rate independent.
- **Leaner runtime & package** — per-frame Essentia WASM vectors are freed (`freeEssentiaVector`), analysis loops yield on a 12 ms time budget, RAF hot paths reuse scratch buffers; dead essentia-wasm fallback chain and stale chunks removed: `.vsix` **15.6 → 5.6 MB (−64%)**, dist gzip −9%.
- **Curve Correction shortcut** — now opens with the bare `E` key; the former `Cmd/Ctrl+Shift+E` chord is intercepted by the IDE workbench and never reached the webview.
- **Keyboard shortcut panel** — masonry two-column layout (staggered group headers, no row-height holes) and entries for wheel-volume, fullscreen and monitoring shortcuts.
- **Settings panel** — removed the dead Waveform-visible toggle (the waveform always renders).

### Fixed

- **Playhead reprojection** — leaving Edit & Export no longer drags the white cue line to the far left; overlays reproject against the restored time window immediately.
- **Level meter** — right-clicking between L/R and M/S now updates labels instantly while paused (was only during playback).
- **Protocol hygiene** — `WebviewMessageType.ERROR` no longer shares the `"RELOAD"` literal; webview error messages are safely stringified; `pause()` is idempotent and the `AudioContext` is closed on dispose.
- **Packaging** — `vscode:prepublish` cleans `dist/` so stale chunks can never ship again.

## [0.4.0] - 2026-06-28

### Added

- **CQT spectrum analyzer (PAZ-style)** — Constant-Q live spectrum in the Live Spec pane, reverse-engineered from Waves PAZ Analyzer. Per-bin Goertzel DFT with a variable-Q psychoacoustic model (Q ≈ 3.85–6.97 below 250 Hz, ≈ 10 above) so low bands stay readable and high bands stay smooth.
- **Left-edge rendering** — each band is drawn at its geometric-mean left edge `sqrt(center[k-1] × center[k])` with straight-line connections; the axis is pinned to 6 Hz and the last band extends to Nyquist. This reproduces PAZ's flat-top-at-low / smooth-at-high curve shape and puts peaks where PAZ puts them.
- **Peak Hold** — max-hold envelope over the live curve with a configurable hold time; double-click the spectrum to reset.
- **Deep-dive blog** — bilingual write-up of the reverse-engineering work: [English](doc/blog/cqt-spectrum-analyzer.en.md) · [中文](doc/blog/cqt-spectrum-analyzer.md), linked from the README.
- **Knowledge base** — `doc/knowledge-base/paz-spectrum-rendering.md` documenting the CQT model, left-edge math, and axis conventions.

### Changed

- **Setting `liveCqtBins` → `liveCqtLfRes`** — the CQT control now picks low-frequency resolution (40 / 20 / 10 Hz, default 40) instead of a fixed bin count. Lower values add more low-end detail at higher CPU cost.
- **Live spectrum release default** 8 → 15 dB/s — faster decay reads better on music; the old 35% fallback path was dropped.
- **Hearing protection now defaults on** — playback starts with the peak-dBFS mute guard active.
- **Sound field defaults** — default mode is now `polarSample`; polar sample radius gamma default 1 → 0.5 (range tightened to 0.1–1.0).

### Notes

- The CQT analyzer runs live only; STFT/offline spectrogram is unchanged.

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
