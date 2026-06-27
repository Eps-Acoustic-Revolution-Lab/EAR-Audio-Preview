# Architecture: Two-Process Model & Message Protocol

## Overview

EAR Audio Preview is a VS Code Custom Editor extension that runs in two isolated processes:

1. **Extension Host** (Node.js) — Manages the editor lifecycle, file I/O, settings persistence, and heavy DSP computation
2. **Webview** (browser sandbox) — Handles audio decoding, playback (Web Audio API), rendering (WebGL2/Canvas2D), and all UI

The two processes communicate exclusively via `vscode.webview.postMessage()`.

## Extension Host Side

### Entry point: `src/extension.ts`

Minimal — registers `AudioPreviewEditorProvider` as a custom editor for audio file types.

### `src/audioPreviewEditor.ts`

The core extension host module. Contains:

- **`AudioPreviewDocument`** — Implements `vscode.CustomDocument`. Reads the audio file via `vscode.workspace.fs.readFile()`, watches for external changes via `FileSystemWatcher`, and exposes `documentData: Uint8Array`.

- **`AudioPreviewEditorProvider`** — Implements `vscode.CustomReadonlyEditorProvider`. Responsibilities:
  - Registers the custom editor for `earAudioPreview.audioPreview` viewType
  - Builds webview configuration (settings, file extension, cached UI state)
  - Loads headphone EQ state (workspace `.vscode/ear-headphone-eq.json` → globalState → defaults)
  - Handles all incoming webview messages (switch on `WebviewMessageType`)
  - Streams file data in chunks (initial 500 KB, then 3 MB increments)
  - Proxies STFT and sequence analysis to `extensionHost/` modules
  - Proxies AutoEq API calls (entries, targets, equalize)
  - Manages EQ preset file operations (import, list, read, write)
  - Exports WAV files to workspace

- **`WebviewCollection`** — Tracks active webview panels per document URI.

### Extension Host Computation (`src/extensionHost/`)

Heavy compute runs in Node.js for CSP safety (the webview's Content Security Policy restricts certain operations):

| Module | Purpose |
|--------|---------|
| `essentiaHost.ts` | Singleton lazy loader for `essentia.js` in Node.js. Caches the instance. |
| `stftHost.ts` | Runs STFT via Essentia's `Windowing` + `Spectrum` algorithms |
| `sequenceFeatureHost.ts` | Computes F0 (PitchYinFFT) and onset flux (Flux) sequences |
| `autoEqHost.ts` | HTTP proxy to `https://autoeq.app` API (entries, targets, equalize) |
| `eqPresetHost.ts` | File dialog for importing EQ presets, workspace preset CRUD |

### Shared Code (`src/shared/`)

Code that runs in either process:

| Module | Purpose |
|--------|---------|
| `stftEssentiaCompute.ts` | STFT spectrogram computation using Essentia (frame→window→spectrum→dB) |
| `sequenceFeatureCompute.ts` | Hop-based sequence feature extraction |
| `sequenceHop.ts` | Generic hop-based sample iteration utility |
| `autoEqEqualizePayload.ts` | Builds the AutoEq equalize request payload |
| `parseEqPreset.ts` | Parses EQ preset files (EqualizerAPO, AutoEq JSON) |
| `essentiaTypes.ts` | TypeScript types for the Essentia.js API |

## Message Protocol

Defined in `src/message.ts`. Two discriminated unions with type guards:

### Extension → Webview (`ExtMessage`)

| Type | Data | Purpose |
|------|------|---------|
| `CONFIG` | Settings, file info, URIs, headphone EQ state | Initial configuration on webview ready |
| `DATA` | `{samples, start, end, wholeLength}` | Chunked file data transfer |
| `RELOAD` | none | File changed on disk — reinitialize |
| `SEQUENCE_FEATURES` | `{requestId, profile?, error?}` | F0/onset analysis result |
| `STFT_RESULT` | `{requestId, cacheKey?, wire?, error?}` | STFT spectrogram result |
| `AUTOEQ_RESULT` | `{requestId, endpoint, payload?, error?}` | AutoEq API response |
| `EQ_PRESET_OP_RESULT` | `{requestId, payload?, error?}` | EQ preset operation result |

### Webview → Extension (`WebviewMessage`)

| Type | Data | Purpose |
|------|------|---------|
| `CONFIG` | none | Request initial configuration |
| `DATA` | `{start, end}` | Request file data chunk |
| `WRITE_WAV` | `{filename, samples, destination?}` | Export WAV file |
| `ERROR` | `{message}` | Show error notification |
| `SAVE_ANALYZE_UI` | `Record<string, unknown>` | Persist analyze settings |
| `ANALYZE_SEQUENCE_FEATURES` | `{requestId, samples, sampleRate, hopSec}` | Request F0/onset analysis |
| `ANALYZE_STFT` | `{requestId, cacheKey, samples, sampleRate, settings}` | Request STFT |
| `SAVE_EQ_SETTINGS` | `HeadphoneEqPersistedState` | Save EQ to globalState |
| `WRITE_EQ_PROFILE` | `HeadphoneEqPersistedState` | Save EQ to workspace file |
| `AUTOEQ_REQUEST` | `{requestId, endpoint, body?}` | Proxy AutoEq API call |
| `EQ_PRESET_OP` | `{requestId, op, payload?}` | EQ preset file operation |

### Request/Response pattern

For async operations (STFT, AutoEq, EQ presets), the webview generates a `requestId` string. The host echoes it back in the response so the webview can correlate responses to pending requests. Host client classes (`EssentiaHostClient`, `AutoEqHostClient`, `EqPresetHostClient`) manage pending promises keyed by `requestId`.

## Data Flow: File Open → Playback

1. User opens an audio file → VS Code activates extension
2. `AudioPreviewEditorProvider.openCustomDocument()` reads the file into `Uint8Array`
3. `resolveCustomEditor()` creates the webview, sets HTML
4. Webview sends `CONFIG` request
5. Host responds with `CONFIG` (settings, file info, headphone EQ state)
6. Webview requests `DATA {start: 0, end: 500000}`
7. Host sends first chunk; webview requests next chunk `{start: 500000, end: 3500000}`
8. Repeat until entire file is transferred (progress ring updates during transfer)
9. Webview creates decoder via `decoderFactory` → decodes → creates `AudioBuffer`
10. `activateUI()` initializes all services (Player, Analyze, Loudness, HeadphoneEq) and components
11. STFT pane is the initial view; other panes mount lazily on first tab click

## File Watching

`AudioPreviewDocument` creates a `FileSystemWatcher` for the opened file. On external change:
1. Document reloads the file data
2. Sends `RELOAD` to all webviews for that document
3. Webview calls `dispose()` then re-initializes from scratch
