
<div align="center">
  <img src="ear_audio.png" alt="EAR Audio Preview" width="110" />
  <h1>EAR Audio Preview</h1>
  <p>
    <strong>A professional-grade audio analysis tool in your IDE.</strong><br>
    <em>The studio-grade audio analysis, comparison, and monitoring suite—built right into VS Code & Cursor.</em>
  </p>

  <p>
    <a href="https://marketplace.visualstudio.com/items?itemName=Eps-Acoustic-Revolution-Lab.ear-audio-preview">
      <img src="https://img.shields.io/visual-studio-marketplace/v/Eps-Acoustic-Revolution-Lab.ear-audio-preview?style=for-the-badge&label=VS%20Marketplace&color=007ACC&logo=visual-studio-code" alt="Marketplace" />
    </a>
    <a href="https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/actions/workflows/ci.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/ci.yml?style=for-the-badge&label=CI%20Build&logo=github" alt="CI" />
    </a>
    <a href="https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-F59E0B.svg?style=for-the-badge" alt="License: MIT" />
    </a>
  </p>

  <p>
    <strong>English</strong> · <a href="https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/README.zh-CN.md">简体中文</a>
  </p>

  <p>
    <a href="#-quick-start">Quick Start</a> ·
    <a href="#-see-it-in-action">Workflows</a> ·
    <a href="#whats-new">What's New (v0.6.1)</a> ·
    <a href="#-why-ear">Why EAR?</a> ·
    <a href="#-under-the-hood">Architecture</a> ·
    <a href="#-development">Development</a>
  </p>
</div>

<br>

> [!TIP]
> **Engineering Deep Dives:** Curious about how we achieve real-time DSP inside an editor? Explore our [Technical Blog](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/README.md), covering everything from PAZ-inspired CQT spectrum design to anisotropic WebGL2 spectrogram rendering.

---

## ⚡ Overview

**Stop switching between your code editor and heavy external DAWs.**

**EAR Audio Preview** transforms VS Code and Cursor into a high-precision acoustic workstation. Whether you are evaluating generative AI audio models, curating speech datasets, debugging DSP pipelines, or reviewing mix revisions, EAR delivers real-time waveforms, GPU-accelerated spectrograms, live stereo imaging, and EBU R128 loudness metering directly where you build.

<div align="center">

`🎛️ 8-Track Parallel Comparison` · `🌈 WebGL2 STFT + CQT` · `📊 LUFS / LRA / True Peak` · `🎧 AutoEq Headphone Calibration` · `🔒 Local Audio Processing`

</div>

---

## 🚀 Quick Start

### 1. Installation

Search for **`EAR Audio Preview`** in your editor's Extensions panel, or install instantly via CLI:

```sh
code --install-extension Eps-Acoustic-Revolution-Lab.ear-audio-preview

```

### 2. Master EAR in 60 Seconds

1. **Open & Audition:** Click any audio file and press Space to play. *(If another extension takes over, right-click the tab and select **Reopen Editor With… → Audio Preview**).*
2. **Inspect the Details:** Drag across the **STFT** plot to zoom into micro-transients. Switch to **Live Spec** for real-time frequency & stereo-field telemetry, or open **Loudness** to compute LUFS, pitch ($F_0$), and onset timelines.
3. **Multi-Track Comparison:** Select **2 to 8 mono/stereo files** in the Explorer, right-click, and choose **EAR Audio: Compare Files**. Play them in lockstep and toggle per-track mute/focus to compare what you hear.

> [!NOTE]
> **Pro Controls & Formats:** An interactive onboarding guide greets you on first launch (replay anytime via ? in the toolbar). In comparison view, use Ctrl/Cmd+Drag to zoom time, Shift+Drag to zoom frequency, and **Double-Click** to reset. Right-click any plot for layout and fullscreen toggles.
> **Supported Formats:** `WAV` · `MP3` · `AAC` · `OGG` · `FLAC` · `OPUS` · `M4A` · `SPH`
> 📖 [Full User Guide](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/usage.md) · ⚙️ [Settings Reference](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/configuration.md)

---

## 🎬 See It in Action

### Compare Model Outputs, References & Mix Revisions

Load up to **eight recordings** on a unified timeline. Drag once to inspect the exact same time-frequency region across every spectrogram simultaneously. Switch to **Live Spec** for color-coded spectrum overlays, goniometer stereo fields, and phase-correlation telemetry. Need a visual baseline? Keep your reference track visible in analysis while muting it during playback.

![](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/raw/main/assets/demos/multi-audio-workflow.gif)


### Check Dynamics & Calibrate Your Listening

Seamlessly transition from casual playback to rigorous broadcast-grade diagnostics—measuring integrated LUFS, True Peak, fundamental frequency ($F_0$), and onset curves. Open the floating **Monitor** panel to isolate `L / R / M / S` channels or solo specific frequency bands, then apply an **AutoEq headphone correction profile** and toggle bypass to hear your audio on a flat reference response.

![](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/raw/main/assets/demos/single-audio-workflow.gif)

### A Complete Acoustic Inspection Suite

| Workspace Module | Core Capabilities |
| --- | --- |
| **🌊 STFT** | High-contrast waveforms & WebGL2 spectrograms; switch dynamically between `Linear`, `Log`, `Mel`, or `Hybrid` axes; synchronized multi-track zoom & fullscreen inspection. |
| **📈 Live Spec** | Real-time FFT & PAZ-inspired CQT analyzers, customizable peak-hold, 3-mode stereo goniometer, and frequency-dependent phase correlation during playback. |
| **🔊 Loudness** | Broadcast-standard `LUFS`, `LRA`, `PLR`, and `True Peak` metering; interactive loudness, pitch ($F_0$), and onset envelopes mapped to a shared timeline. |
| **✂️ Edit & Export** | Precision region selection; bounce individual clips or multi-track comparison mixes to WAV with custom sample rates, channel routing, and `PCM 8/16/24-bit` or `Float32` depth. |
| **🎧 Monitor** | Dedicated `L / R / M / S` channel matrix, 5-band crossover soloing, and built-in search/import for **AutoEq** headphone calibration profiles. |

---

<a id="whats-new"></a>

<!-- release:en:start -->
## What's new in v0.6.1

- **Optional harmonic timelines.** Inspect Chroma and predominant melody in the single-file Loudness pane, including fullscreen. Supports 0.1-second to 5-minute clips at 8/32/44.1/48 kHz; this is melody estimation, not polyphonic transcription.
- **More live analysis.** Enable spectral centroid, spread and 85% rolloff in single-file and comparison views. Choose Z/A/B/C RMS weighting on the level meter; A/B/C values are dBFS estimates, not calibrated sound-pressure measurements.
- **Background feature analysis.** Run F0, onset and harmonic analysis in cancellable browser workers. F0 and onset can fall back to the extension host if the worker fails; harmonic analysis requires the worker and reports an error for retry.
- **Reusable visualization modules.** Build six standalone views—level meter, spectrum, stereo field, phase correlation, descriptors and a combined live panel—with shared PCM/Web Audio inputs, DSP and scoped styling. The experimental SDK packages remain version 0.1.0 and are available as locally built tarballs; they are not published to npm. See the [integration guide](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/packages/README.md).
- **Reliability fixes.** Handle empty harmonic peak frames and DC offset in spectral descriptors, load worker WASM under the webview CSP, refresh comparison descriptors after track visibility changes, and end active panel drags on suspension or disposal. Cache PCM FFT coefficients without changing numerical output.
<!-- release:en:end -->

📜 [Explore Full Release History (CHANGELOG)](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/CHANGELOG.md)

---

## 🏆 Why EAR?

Most editor plugins stop at basic waveform playback. **EAR Audio Preview** is built for engineers and researchers who need to **hear and see** every artifact across multiple renders simultaneously.

| Core Capability | **EAR Audio Preview** | [audio-preview](https://marketplace.visualstudio.com/items?itemName=sukumo28.wav-preview) | [Audio Player](https://marketplace.visualstudio.com/items?itemName=huachao.audio-player) | [audioscope](https://marketplace.visualstudio.com/items?itemName=YongsooIm.audioscope) |
| :--- | :---: | :---: | :---: | :---: |
| **Multi-Track Parallel Comparison** | **✅ 8 Tracks · Linked Zoom** | Single file | Sequential only | 2-file A/B · Linked |
| **Time-Frequency Spectrogram (STFT)** | **✅ WebGL2 · Anisotropic** | ✅ Basic | Waveform only | ✅ Basic |
| **Real-Time Spectrum Analyzer** | **✅ FFT + CQT · Multi-Overlay** | — | — | — |
| **Stereo Imaging & Phase Diagnostics**<br><sub>3-mode Goniometer, Freq Correlation & M/S Meters</sub> | **✅ Full Suite** | — | — | — |
| **Loudness & Acoustic Feature Timelines**<br><sub>EBU R128 (LUFS / LRA / True Peak), Pitch ($F_0$) & Onsets</sub> | **✅ Full Suite** | — | — | LUFS / Peak only |
| **Sample-Accurate Alignment & Level Match**<br><sub>Auto delay/polarity compensation, RMS match & residual diff</sub> | **✅ Full Suite** | — | — | ✅ |
| **Studio Monitoring Matrix**<br><sub>`L/R/M/S` channel routing & 5-band crossover solo</sub> | **✅ Full Matrix** | — | — | — |
| **Reference Headphone Calibration**<br><sub>Built-in AutoEq profile search, import & instant bypass</sub> | **✅ Built-in AutoEq** | — | — | — |
| **Precision Region Bounce & Mix Export**<br><sub>Custom sample rate, bit depth, mix bounce & optional EQ bake</sub> | **✅ Stem / Mix / EQ Bake** | Single clip | — | Single clip |
| **Decoupled Analysis & Listening Buses**<br><sub>Solo bands or apply EQ without corrupting objective meters</sub> | **✅ Isolated Buses** | — | — | — |
✅ Supported · — Not available in compared version. See detailed version & feature notes.

> **Decoupled Analysis & Monitoring:** Keep a reference track muted in your headphones while still watching its live spectrum on screen. Channel routing, band soloing, and headphone EQ adjust what you *hear* without corrupting your underlying *measurements*. When **Align** is applied, all pipelines seamlessly lock onto the time-aligned session copy.

### ⚡ Blazing Fast to Inspect. Featherlight to Install.

| 🚀 **+21–28% Faster STFT** | ⚡ **6.5× Faster Load Time** | 📦 **48% Smaller Package** |
| --- | --- | --- |
| Analyzes a 3-second clip in **~25 ms** vs. `audio-preview`. | Opens a 60-second stereo file in **~0.25 s** (6.5× speedup). | Optimized bundle shrunk from **6.66 MiB → 3.44 MiB**. |

📊 [Full Benchmark against 6 Audio Extensions](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/comparison.md) · 🔬 [Benchmark Methodology & Suite](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/comparison.md#repository-benchmark-suite)

---

## 🔧 Under the Hood

### 🎨 Anisotropic Spectrograms that Keep Transients Sharp

Standard bilinear filtering blurs sharp percussive attacks. EAR's custom **WebGL2 renderer** decouples the axes: preserving crisp, unblurred temporal transients along the X-axis while applying smooth interpolation along the frequency Y-axis to keep harmonic contours clean. Combined with adaptive FFT sizing and multiple window functions, you get uncompromising clarity for both micro-events and sustained tones.

👉 [Read: How the Anisotropic Renderer Works](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/anisotropic-spectrogram-rendering.en.md)

### 🎹 A Spectrum Analyzer Tuned for Human Hearing

Switch effortlessly between standard linear/log FFT and a **PAZ-inspired Constant-Q Transform (CQT)** analyzer featuring variable-Q filter banks, deep low-frequency resolution, adjustable spectral tilt, and configurable ballistic release—ensuring the visual display stays musical and readable in real time.

👉 [Read: CQT Spectrum Analyzer Design Notes](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/cqt-spectrum-analyzer.en.md)

### ⏱️ Reversible Audio Alignment

Click **Align** to automatically estimate integer-sample delay and polarity flips between two same-rate recordings (searching a `±2s` window across the first `60s`). Once applied, playback, visual plots, and exports all reference the shifted session buffer—while a single click on **Reset** restores the bit-exact original. *(Note: Fractional subsample delays and clock drift are intentionally out of scope).*

👉 [Read: Alignment DSP, Edge Cases & Ablation](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/blog/audio-alignment-dsp.en.md) · [Usage Guide](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/audio-alignment.md)

### 🧭 Shared Timeline, Source-Aware DSP Architecture

In multi-file comparison, each track is analyzed natively at its decoded sample rate and projected onto unified time and frequency coordinates with a shared absolute `dBFS` color scale. Because **Source Analysis**, **Live Monitoring**, and **Export** run on isolated DSP buses, tweaking your monitoring EQ or soloing a frequency band never alters your objective meters.

📚 [Documentation Index](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/README.md) · 🏗️ [System Architecture](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/knowledge-base/architecture.md) · 🎛️ [Audio DSP Chain](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/knowledge-base/audio-dsp-chain.md) · 🔊 [Live Monitoring Internals](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/live-monitoring.md)

---

## 🗺️ Roadmap

### ✅ Shipped

* [x] **Foundation:** Multi-format WASM decoding, WebGL2 spectrograms, stereo metering, and phase correlation.
* [x] **v0.2:** 4-pane modular workspace, loudness / $F_0$ / onset timelines, and region WAV export.
* [x] **v0.3:** Built-in AutoEq headphone correction with global and workspace-scoped profiles.
* [x] **v0.4:** PAZ-inspired CQT spectrum analyzer and customizable peak hold.
* [x] **v0.5:** Anisotropic WebGL2 spectrogram rendering and interactive user onboarding.
* [x] **v0.6:** 8-file parallel playback, linked STFT zoom, and real-time multi-track spectrum overlays.
* [x] **v0.6:** Per-file loudness/feature extraction, shared Monitor deck, and selection mix bounce.
* [x] **v0.6:** Shared-region RMS level matching, same-rate residual diffing, and optional EQ baking in WAV exports.
* [x] **v0.6:** Reversible same-rate integer-delay alignment with optional polarity compensation.
* [x] **v0.6.1:** Optional Chroma and predominant melody timelines ([limits](doc/harmonic-analysis.md)).
* [x] **v0.6.1:** Optional live spectral centroid, spread and 85% rolloff ([details](doc/live-monitoring.md)).
* [x] **v0.6.1:** A/B/C weighted RMS estimates in dBFS ([limits](doc/frequency-weighted-rms.md)).
* [x] **v0.6.1:** Background analysis for F0, onset and harmonic timelines ([details](doc/background-analysis.md)).

📋 [Release History](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/CHANGELOG.md) · 💡 [Request a Feature](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/issues)

---

<a id="-development"></a>

## 💻 Development & Contributing

Get a local development build running in seconds:

```sh
git clone https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview.git
cd EAR-Audio-Preview
npm ci
npm run webpack-dev

```

1. Press F5 in VS Code to launch the **Extension Development Host** and open any audio file.
2. Run `npm run ci` to execute linting, tests, and bundle verification.
3. Run `npm run vsix` to package a standalone `.vsix` installer.

We warmly welcome bug reports, DSP discussions, and Pull Requests!

🐛 [Open an Issue](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/issues) · 🛠️ [Development & Release Guide](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/development.md) · 🧪 [Test Architecture & Guide](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/doc/testing.md)

---

## 📜 Credits & License

Crafted with passion by **[Eps Acoustic Revolution Lab](https://github.com/Eps-Acoustic-Revolution-Lab)**, originally inspired by and building upon the Custom Editor foundation of [sukumo28/vscode-audio-preview](https://github.com/sukumo28/vscode-audio-preview).

**Core DSP & Rendering Technologies:**

Powered by `Ooura` · `Essentia.js` · `twgl.js` · `wasm-audio-decoders` · `loudness-worklet` · `ebur128-wasm`.

Released under the **[MIT License](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/blob/main/LICENSE)**. All third-party libraries retain their respective licenses.

## Standalone visualization SDK

Embed the live spectrum, stereo field, phase correlation, level meter and descriptors in your own application. See the [SDK integration guide (中文)](packages/README.md) for package selection, local installation, lifecycle and examples. The experimental packages are not yet published to npm.
