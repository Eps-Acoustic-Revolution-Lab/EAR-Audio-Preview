# Frontend Design & UI Component System

## Design System

### EAR-EQ Tokens

Design tokens defined in `src/webview/styles/earEqTokens.css`. The UI follows an "ear-eq" design language with:
- Pill-shaped controls and segmented controls
- Sliding focus indicators (`earEqSlidingFocus.ts`)
- Compact workspace chrome (minimal top tab bar)
- Bottom-anchored FAB (Floating Action Button) pattern

### Global Styles

- `vscode.css` — Resets and VS Code theme variable integration
- `panelSurface.css` — Panel/surface layout primitives
- `figure.css` — Graph/chart container styles
- `earEqTokens.css` — Design tokens (colors, spacing, radii)

### Component CSS

Each component has a colocated `.css` file (e.g., `transportFabComponent.css`). BEM-like naming: `blockName__elementName--modifier`.

## Component Architecture

### Base Classes

```
Disposable (src/dispose.ts)
├── Component (src/webview/component.ts) — UI elements
│   └── _addEventlistener() — auto-cleanup event registration
└── Service (src/webview/service.ts) — Business logic, implements EventTarget
    └── addEventListener/dispatchEvent/removeEventListener
```

All components and services use the `_register()` / `_disposables` array pattern. When `dispose()` is called, all registered disposables are cleaned up in reverse order.

### Event System

Custom events defined in `src/webview/events.ts` (`EventType` class). Services dispatch events to notify components of state changes. Components listen via `_addEventlistener()`.

Naming convention: `AS_UPDATE_*` for AnalyzeSettings, `PS_UPDATE_*` for PlayerSettings, `EE_UPDATE_*` for EditExport, `HE_UPDATE_*` for HeadphoneEq.

### Cursor Readout

`CursorReadoutPayload` — a discriminated union dispatched as a `CustomEvent` on `window` when hovering waveform/spectrogram. Contains RMS, peak, true peak, frequency info by context.

## Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ Workspace Chrome (top tab bar)                          │
│ [STFT] [Live Spec] [Edit & Export] [Loudness] [⚙]     │
├─────────────────────────────────────────┬───────────────┤
│ Main Visualizer                         │ Level Meter   │
│ ┌─────────────────────────────────────┐ │ (right col)   │
│ │ WaveBand (multi-channel waveform)   │ │ Resizable     │
│ │ ── resize handle ──                 │ │ 72–220px      │
│ │ Graph Deck (pane-specific content)  │ │               │
│ │ [STFT / Live / Edit / Loudness]     │ │               │
│ └─────────────────────────────────────┘ │               │
├─────────────────────────────────────────┴───────────────┤
│ Transport Dock (bottom-left)                            │
│ [▶ Play] [Volume Knob] [Monitor Controls]              │
├─────────────────────────────────────────────────────────┤
│ Settings Dock (bottom-left, stacked)                    │
│ [Meta FAB] [Info Popover]                               │
└─────────────────────────────────────────────────────────┘
```

### Workspace Pane System

Tab state managed by `setActiveWorkspacePane()` from `src/webview/workspacePane.ts`. Dispatches `WORKSPACE_ACTIVE_PANE` custom event. The `data-workspace-pane` attribute on `<html>` controls CSS visibility.

Panes are lazily mounted: `ensureStftMounted()`, `ensureLiveMounted()`, `ensureEditMounted()`, `ensureLoudnessMounted()`. Each creates its component tree on first tab activation.

### Sliding Focus

`earEqSlidingFocus.ts` — animates a focus indicator that slides between tab buttons in the workspace chrome and segmented controls.

## Key Components

### WebView (`src/webview/components/webview/webview.ts`)

The root component. Responsibilities:
- Renders the full HTML template into `#root`
- Manages message protocol with extension host
- Orchestrates file data transfer (chunked, with progress ring)
- Creates all services and components in `activateUI()`
- Manages lazy pane mounting
- Handles file reload (dispose + reinitialize)

### Transport FAB (`transportFabComponent.ts`)

Bottom-left floating action button:
- Play/pause toggle
- Volume knob (linear or dB scale)
- Seek integration with waveform
- Monitor controls (solo L/R/M/S, 5-band)
- Headphone EQ bypass toggle + overlay trigger
- Loading state with progress ring

### Meta FAB (`metaFabComponent.ts`)

Bottom-left info button (stacked with Transport FAB):
- Audio metadata popover (format, sample rate, bit depth, duration)
- Loading state animation

### Settings Overlay (`settingsOverlayComponent.ts`)

Gear button in workspace chrome opens a popover with:
- Options tab (analyze settings)
- Player tab (playback settings)
- Edit & Export tab

### Analyzer Component (`analyzerComponent.ts`)

STFT pane content:
- Multi-channel waveform rendering
- GPU spectrogram (WebGL2 via `twgl.js`)
- Drag-to-zoom on time/frequency/amplitude axes
- Figure interaction component for zoom/pan/reset

### Live Analysis (`liveAnalysisComponent.ts`)

Live Spec pane content. Vertically split layout with draggable resize handles:
- Goniometer (3 modes)
- Phase correlation spectrum
- Spectral analyzer (log bars)
- Fullscreen overlay toggle (↗)

### Loudness Component (`loudnessComponent.ts`)

Multi-strip timeline chart:
- LUFS strip (M/S/I curves, B-spline smoothed)
- F0 strip (PitchYinFFT, log Hz)
- Onset strip (spectral flux)
- True peak markers
- Region selection for re-analysis

### Edit Export Component (`editExportComponent.ts`)

WAV export workflow:
- Region selection (start/end time)
- Channel mode (stereo/mono L/mono R/mid/side)
- Filter sync with player settings
- Listen preview before export
- Destination (workspace root or source directory)

### Curve Correction Overlay (`curveCorrectionOverlayComponent.ts`)

Full headphone EQ editor (Cmd+Shift+E):
- AutoEq search (headphone model lookup)
- Target curve selection
- PEQ filter visualization with `modifiedAkima` interpolation
- Frequency response canvas (`eqCanvasMath.ts`)
- Save to workspace / save globally
- Bypass toggle

### Knob Component (`knobComponent.ts`)

Rotary knob control (used for volume). Supports:
- Drag interaction (vertical mouse movement)
- Keyboard adjustment (arrow keys)
- Value display with unit

## Services

| Service | Purpose |
|---------|---------|
| `PlayerService` | Web Audio graph lifecycle, play/pause/seek, filter management |
| `PlayerSettingsService` | Player config state (volume, filters, space key) |
| `AnalyzeService` | STFT analysis orchestration, Essentia host client |
| `AnalyzeSettingsService` | All analyze UI state, persistence hooks |
| `LoudnessService` | Offline EBU R128 profile computation |
| `SequenceFeatureService` | F0/onset analysis via extension host |
| `HeadphoneEqSettingsService` | EQ profile state, bypass toggle |
| `EditExportSettingsService` | Export region, channel, filter settings |
| `EditListenService` | Preview listen with separate audio graph |
| `EssentiaHostClient` | STFT request/response over postMessage |
| `AutoEqHostClient` | AutoEq API request/response over postMessage |
| `EqPresetHostClient` | EQ preset file ops over postMessage |
| `autoEqApiClient` | Stateless AutoEq API binding (delegated to host) |

## Rendering

### WebGL2 Spectrogram
- Uses `twgl.js` for WebGL2 helper functions
- dB values sent as textures to GPU
- Fragment shader applies colormap (customizable dB range)
- Supports linear/log/mel frequency scale remapping

### Canvas2D
- Level meter, waveform, loudness charts, phase correlation
- All use `devicePixelRatio` scaling for HiDPI
- Resize observers for responsive layout

### Graph Interaction (`figureInteractionComponent.ts`)
Consistent across all graph panes:
- Click: set cue position
- Drag: select range → zoom
- Ctrl+drag: constrain to time axis
- Shift+drag: constrain to value axis
- Right-click: reset view
- Ctrl/Shift+right-click: single-axis reset
- Hover: cursor readout
