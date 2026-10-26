# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

EAR Audio Preview is a **professional-grade audio monitoring and analysis VSCode extension** (also works in Cursor and other VS Code forks). It registers as a Custom Editor for audio files (wav, mp3, ogg, aac, flac, opus, m4a, sph) and provides playback, real-time metering, spectral analysis, loudness profiling, and headphone EQ correction inside the editor.

Forked from [sukumo28/vscode-audio-preview](https://github.com/sukumo28/vscode-audio-preview) — only the `postMessage` wire protocol survives from upstream; every subsystem has been replaced.

## Build & Development Commands

```sh
npm install              # install dependencies
npm run webpack          # one-shot development build → dist/
npm run webpack-dev      # watch mode for development
npm test                 # Jest unit tests (jsdom + jest-canvas-mock)
npm run lint             # ESLint check
npm run format           # Prettier auto-format
npm run ci               # types, lint, formatting, tooling, docs, tests, production VSIX and package audit
```

**Run the extension**: Press **F5** in VS Code to launch Extension Development Host, then open any audio file.

**Run a single test**: `npx jest --testPathPattern="<pattern>"` (e.g. `npx jest --testPathPattern="volumeMapping"`)

**Package VSIX**: `npm run vsix` (cleans dist and runs the production build automatically)

## Architecture

### Two-process model

The extension runs as two isolated processes connected by `postMessage`:

```
Extension Host (Node.js)          Webview (browser sandbox)
─────────────────────────          ─────────────────────────
AudioPreviewEditorProvider         WebView component
  ↕ postMessage (CONFIG,             ↕ Web Audio API
    DATA, RELOAD, STFT,              ↕ WebGL2 (twgl.js)
    SEQUENCE_FEATURES,               ↕ Canvas2D
    AUTOEQ, EQ_PRESET)
```

- **Extension host** (`src/extension.ts` → `src/audioPreviewEditor.ts`): Registers the custom editor, streams file data in 3 MB chunks, manages VS Code settings/globalState, proxies AutoEq API calls, and runs Essentia STFT in Node.js. F0 and onset fall back to the host only when the webview worker fails; harmonic analysis stays in that worker.
- **Webview** (`src/webview/index.ts` → `WebView` component): Receives file data, decodes audio, builds the Web Audio playback graph, renders all UI.

### Message protocol

All message types are defined in `src/message.ts`. Two discriminated unions:
- `ExtMessage` (host → webview): CONFIG, DATA, RELOAD, SEQUENCE_FEATURES, STFT_RESULT, AUTOEQ_RESULT, EQ_PRESET_OP_RESULT
- `WebviewMessage` (webview → host): CONFIG, DATA, WRITE_WAV, ERROR, SAVE_ANALYZE_UI, ANALYZE_SEQUENCE_FEATURES, ANALYZE_STFT, SAVE_EQ_SETTINGS, WRITE_EQ_PROFILE, AUTOEQ_REQUEST, EQ_PRESET_OP

### Webpack build targets

Three separate webpack configs in `webpack.config.js`:
1. **extensionConfig** (target: `node`) → `dist/extension.js` — Extension host
2. **webviewConfig** (target: `web`) → `dist/audioPreview.js` — Webview bundle
3. **webExtensionConfig** (target: `webworker`) → `dist/web/extension.js` — VS Code for Web

A custom `ExtractLoudnessWorkletPlugin` extracts the loudness-worklet processor source and copies the Essentia WASM binary to `dist/`.

### Audio decoding pipeline

`src/webview/decoders/decoderFactory.ts` — two-layer fallback:
1. **WASM decoders** (MP3→mpg123, FLAC→@wasm-audio-decoders/flac, Ogg→Vorbis/Opus) — decode in Web Workers
2. **Web Audio API** `decodeAudioData` (WAV, AAC, M4A, SPH) — browser native fallback

All decoders implement `IAudioDecoder` (`audioDecoderInterface.ts`).

### Playback signal chain

```
source → [HPF biquad] → [LPF biquad] → gain → [headphone EQ biquads] → destination
                                           └→ [monitor band matrix] ─┐
                                           └→ loudness-worklet ──────┤
                                                                     ├→ splitter → analyserL/R → gain matrix → merger → destination
```

The live monitoring sub-graph (splitter/analysers/gain matrix) is created on demand and destroyed when meters are hidden. See `doc/live-monitoring.md` for the full signal chain and monitoring matrix modes.

### Component/Service pattern

- **Components** extend `Component` → `Disposable`. UI elements with DOM lifecycle management. Use `_addEventlistener()` for auto-cleanup.
- **Services** extend `Service` → `Disposable` and implement `EventTarget`. Business logic layer that dispatches custom events. Event types live in `src/webview/events.ts` (`EventType` class).
- Both use the `_register()` / `_disposables` pattern for cleanup. Always push new disposables into `this._disposables`.

### Workspace panes (lazy mounting)

Four tabbed views, each mounted lazily on first tab selection:
- **STFT** — Waveform + GPU spectrogram (WebGL2 via twgl.js)
- **Live Spec** — Real-time goniometer (3 modes), phase correlation spectrum, spectral analyzer
- **Loudness** — Offline EBU R128 profile (LUFS-M/S/I, LRA, PLR, F0, onset)
- **Edit & Export** — Region selection + WAV export

Tab state managed by `setActiveWorkspacePane()` from `src/webview/workspacePane.ts`.

### Extension host computation

STFT runs in the Node.js host for CSP safety. F0, onset, and harmonic analysis run in a browser worker; only F0 and onset fall back to the host:
- `src/extensionHost/stftHost.ts` — STFT via Essentia.js
- `src/extensionHost/sequenceFeatureHost.ts` — F0/onset fallback when the browser worker fails
- `src/extensionHost/autoEqHost.ts` — AutoEq API proxy (entries, targets, equalize)
- `src/extensionHost/eqPresetHost.ts` — Workspace EQ preset file I/O
- `src/extensionHost/essentiaHost.ts` — Singleton Essentia.js loader for Node.js

Shared computation code lives in `src/shared/` and runs in either process.

### Headphone EQ system

Headphone curve correction via AutoEq integration:
- **Persistence**: Global (`globalState` key `earAudioPreview.headphoneEq.v1`) or workspace (`.vscode/ear-headphone-eq.json`)
- **Signal path**: PEQ biquad filters inserted in the playback chain (live only, not baked into exports)
- **Types**: `src/webview/types/headphoneEq.ts`
- **Services**: `headphoneEqSettingsService.ts`, `autoEqHostClient.ts`, `autoEqApiClient.ts`
- **UI**: `CurveCorrectionOverlayComponent` (Cmd+Shift+E / Ctrl+Shift+E)

### Settings persistence

- VS Code workspace settings: `EarAudioPreview.*` namespace in `package.json` contributes
- Analyze UI cache: `globalState` key `earAudioPreview.analyzeUiCache.v1`, debounced 500ms save
- Headphone EQ: globalState + optional `.vscode/ear-headphone-eq.json`
- See `doc/configuration.md` for the full settings reference

## Code Conventions

### Naming (enforced by ESLint)
- Classes: `PascalCase` (e.g. `KnobComponent`, `PlayerService`)
- Types/interfaces: `PascalCase`
- Functions/methods/properties: `camelCase` (leading `_` for private)
- `public static readonly`: `UPPER_CASE`
- `const` module/block scope: `camelCase` or `UPPER_CASE`
- Object literal methods: `camelCase` or `PascalCase` (PascalCase only for external API mirroring like Essentia.js)

### ESLint/Prettier
- Config: `.eslintrc.json` + `.prettierrc`
- CI runs both `lint-check` and `format-check` — run `npm run format` before pushing if format-check fails
- See `doc/eslint-conventions.md` for common CI failure patterns

### CSS
- BEM-like naming: `blockName__elementName--modifier`
- Design tokens in `src/webview/styles/earEqTokens.css`
- Global resets in `src/webview/styles/vscode.css`
- Component-scoped CSS files colocated with their `.ts` files

### Testing
- Jest with `jsdom` environment + `jest-canvas-mock`
- Test files colocated: `foo.ts` → `foo.test.ts`
- Architecture groups and extension guidance: `doc/testing.md`. Use `npm run test:group -- <group>` for focused work; keep `npm test` as the complete suite, including explicit integration tests.
- New source modules must be classified in `scripts/test-groups.mjs`; `npm run test:tooling` verifies that the grouping matches Jest discovery without omissions or duplication.
- Mocks for WASM modules: `src/__mocks__/ebur128-wasm.ts`, `loudness-worklet.ts`
- CSS imports mocked via `styleMock.js`

## Key Documentation

- `doc/configuration.md` — Full settings reference with types, ranges, and defaults
- `doc/live-monitoring.md` — Signal chain, monitoring matrix, component details, FFT sizing
- `doc/eslint-conventions.md` — Naming rules and CI troubleshooting
- `README.md` — User-facing docs, architecture diagram, roadmap

## Key Dependencies

| Layer | Packages |
|-------|----------|
| Decode | `mpg123-decoder`, `@wasm-audio-decoders/flac`, `@wasm-audio-decoders/ogg-vorbis`, `ogg-opus-decoder` |
| FFT | `ooura` (pure JS, fast), `essentia.js` (WASM, multi-window) |
| GPU rendering | `twgl.js` (WebGL2 helper) |
| Loudness | `loudness-worklet` (AudioWorklet EBU R128), `ebur128-wasm` (true peak) |
| Browser polyfills | `assert`, `path-browserify`, `process` (for webview bundle) |

## Deep Dive Knowledge Base

For detailed design documentation beyond this overview, see:

- [`doc/knowledge-base/architecture.md`](doc/knowledge-base/architecture.md) — Two-process model, message protocol, data flow
- [`doc/knowledge-base/audio-dsp-chain.md`](doc/knowledge-base/audio-dsp-chain.md) — Decoding pipeline, signal chain, STFT/FFT algorithms, loudness analysis, live analysis components
- [`doc/knowledge-base/frontend-design.md`](doc/knowledge-base/frontend-design.md) — Design system, component architecture, layout structure, UI components & services
- [`doc/knowledge-base/headphone-eq-system.md`](doc/knowledge-base/headphone-eq-system.md) — AutoEq integration, EQ preset system, persistence, CSP proxy
- [`doc/knowledge-base/module-map.md`](doc/knowledge-base/module-map.md) — Complete file tree with per-file descriptions, build outputs, test locations
- [`doc/configuration.md`](doc/configuration.md) — Full settings reference (types, ranges, defaults)
- [`doc/live-monitoring.md`](doc/live-monitoring.md) — Signal chain diagram, monitoring matrix, meter/goniometer/spectrum details
- [`doc/eslint-conventions.md`](doc/eslint-conventions.md) — Naming rules, CI failure patterns
