# Headphone EQ & AutoEq Integration

## Overview

EAR Audio Preview includes a headphone curve correction system that applies parametric EQ (PEQ) filters to the playback signal chain. It integrates with [AutoEq](https://autoeq.app) to look up headphone-specific correction curves.

**Privacy**: Only headphone model metadata is sent to AutoEq (name, measurement source, target label, sample rate). Audio files are never uploaded.

## Architecture

```
┌─ Webview ──────────────────────────────────────────────────────┐
│                                                                 │
│  CurveCorrectionOverlayComponent ──→ autoEqApiClient (binding) │
│       │                                    │                    │
│       ├── EQ canvas (modifiedAkima)        │                    │
│       ├── Profile search UI                │                    │
│       └── Save/bypass controls             │                    │
│                                            │                    │
│  HeadphoneEqSettingsService (state)  AutoEqHostClient ──────┐  │
│       │                                                      │  │
│  TransportFabComponent (bypass btn)                          │  │
│       │                                                      │  │
│  PlayerService (biquad chain)                                │  │
│                                                              │  │
└──────────────────────────────────────────────┬───────────────│──┘
                                               │               │
           postMessage (AUTOEQ_REQUEST)  ◄─────┘               │
           postMessage (EQ_PRESET_OP)    ◄─────────────────────┘
                                               │
┌─ Extension Host ─────────────────────────────▼─────────────────┐
│                                                                 │
│  autoEqHost.ts ──→ fetch('https://autoeq.app/...')             │
│  eqPresetHost.ts ──→ vscode.workspace.fs / showOpenDialog      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Applying a Preset

1. User opens Curve Correction overlay (Cmd+Shift+E or Transport FAB → Monitor)
2. User searches for headphone model → `autoEqApiClient` → `AutoEqHostClient.request()` → postMessage `AUTOEQ_REQUEST {endpoint: "entries"}`
3. Extension host calls `fetchAutoEqEntriesInHost()` → `fetch('https://autoeq.app/entries')` → responds with `AUTOEQ_RESULT`
4. User selects model + target curve → equalize request with body `{name, source, rig, target, fs}`
5. Extension host calls `equalizeAutoEqInHost(body)` → `fetch('https://autoeq.app/equalize', {method: POST})` → responds with PEQ parameters
6. Webview receives PEQ parameters → creates `HeadphoneEqProfile` → updates `HeadphoneEqSettingsService`
7. `PlayerService` rebuilds biquad filter chain from the profile
8. Audio plays through the EQ filters in real time

### Payload Construction (`autoEqEqualizePayload.ts`)

The `buildAutoEqEqualizePayload()` function transforms the wire body into the format expected by the AutoEq API. This shared code runs in both processes.

## Types (`src/webview/types/headphoneEq.ts`)

```typescript
interface HeadphoneEqProfile {
  name: string;           // Headphone model name
  source: string;         // Measurement source
  rig: string;            // Measurement rig
  target: string;         // Target curve name
  filters: PeqFilter[];   // Parametric EQ filter chain
}

interface PeqFilter {
  type: 'peaking' | 'lowshelf' | 'highshelf';
  frequency: number;      // Hz
  gain: number;           // dB
  q: number;              // Q factor
}

interface HeadphoneEqPersistedState {
  bypassed: boolean;
  profile: HeadphoneEqProfile | null;
}
```

## Persistence

Three levels, checked in order:

1. **Workspace file**: `.vscode/ear-headphone-eq.json` — per-project EQ settings
2. **Global state**: `globalState` key `earAudioPreview.headphoneEq.v1` — user-wide default
3. **Config default**: `EarAudioPreview.headphoneEq.bypassByDefault` (default: `true`)

### Save Operations

- **Save globally**: `SAVE_EQ_SETTINGS` message → `globalState.update(headphoneEqCacheKey, data)`
- **Save to workspace**: `WRITE_EQ_PROFILE` message → writes `.vscode/ear-headphone-eq.json`

## EQ Preset System

Beyond AutoEq, users can import/export EQ presets:

### Operations (`EQ_PRESET_OP`)

| Op | Action |
|----|--------|
| `import` | Opens file dialog to pick an EQ preset file (EqualizerAPO format, AutoEq JSON) |
| `list` | Lists `.json` preset files in workspace `.vscode/eq-presets/` |
| `read` | Reads a specific workspace preset file |
| `write_library` | Saves current profile to workspace preset library |

### Preset Parsing (`parseEqPreset.ts`)

Parses two formats:
- **EqualizerAPO format**: Text-based filter definitions (`Filter: ON PK Fc 1000 Hz Gain -3.0 dB Q 1.41`)
- **AutoEq JSON**: Direct JSON representation of filter parameters

## EQ Visualization

### Frequency Response Canvas (`eqCanvasMath.ts`)

Computes the combined frequency response of a PEQ filter chain:
- Evaluates each biquad's transfer function H(z) at log-spaced frequency points
- Sums magnitudes in dB
- Renders as a smooth curve on canvas

### Interpolation (`modifiedAkima.ts`)

Modified Akima interpolation for smooth EQ curve visualization between control points. Used to draw the EQ response curve in the overlay.

## CSP Safety

The webview's Content Security Policy blocks direct HTTP requests to external origins. The AutoEq API calls are proxied through the extension host:

```
Webview → postMessage(AUTOEQ_REQUEST) → Extension Host → fetch(autoeq.app) → postMessage(AUTOEQ_RESULT) → Webview
```

This is why `autoEqHost.ts` exists in `src/extensionHost/` rather than being called directly from the webview.
