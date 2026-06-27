# Module Map & Key File Reference

## Source Directory Structure

```
src/
├── extension.ts                    # Extension entry point (Node.js)
├── audioPreviewEditor.ts           # CustomReadonlyEditorProvider + AudioPreviewDocument
├── message.ts                      # All message types (ExtMessage / WebviewMessage unions)
├── config.ts                       # Config, PlayerDefault, AnalyzeDefault interfaces
├── dispose.ts                      # Disposable base class + disposeAll()
├── util.ts                         # getNonce() for webview CSP
├── eslintPolicy.test.ts            # ESLint naming convention verification test
│
├── extensionHost/                  # Node.js–only modules (heavy compute + I/O)
│   ├── essentiaHost.ts             # Singleton Essentia.js loader for Node
│   ├── stftHost.ts                 # STFT computation via Essentia
│   ├── sequenceFeatureHost.ts      # F0 + onset feature extraction
│   ├── autoEqHost.ts               # AutoEq API HTTP proxy
│   └── eqPresetHost.ts            # EQ preset file operations
│
├── shared/                         # Runs in either process
│   ├── stftEssentiaCompute.ts      # STFT algorithm (Windowing → Spectrum → dB)
│   ├── sequenceFeatureCompute.ts   # Feature extraction algorithm
│   ├── sequenceHop.ts              # Hop-based iteration utility
│   ├── autoEqEqualizePayload.ts    # AutoEq request builder
│   ├── parseEqPreset.ts            # EQ preset parser (APO + JSON formats)
│   └── essentiaTypes.ts            # Essentia.js TypeScript types
│
├── webview/                        # Browser sandbox (webview bundle)
│   ├── index.ts                    # Webview entry point
│   ├── component.ts                # Component base class
│   ├── service.ts                  # Service base class (EventTarget)
│   ├── events.ts                   # EventType constants + DisposableEventListener
│   ├── encoder.ts                  # WAV file encoder for export
│   ├── workspacePane.ts            # Workspace pane state management
│   ├── spectrogramFrequencyLayout.ts # Frequency scale mapping
│   │
│   ├── types/
│   │   └── headphoneEq.ts          # HeadphoneEqProfile + HeadphoneEqPersistedState
│   │
│   ├── decoders/
│   │   ├── audioDecoderInterface.ts # IAudioDecoder interface
│   │   ├── decoderFactory.ts       # Two-layer decoder selection
│   │   ├── wasmDecoder.ts          # WASM decoder wrapper (MP3/FLAC/Ogg/Opus)
│   │   └── webAudioDecoder.ts      # Browser decodeAudioData wrapper
│   │
│   ├── services/
│   │   ├── playerService.ts         # Web Audio graph, play/pause/seek
│   │   ├── playerSettingsService.ts # Player config state
│   │   ├── analyzeService.ts        # STFT analysis orchestration
│   │   ├── analyzeSettingsService.ts # All analyze UI state + persistence
│   │   ├── loudnessService.ts       # Offline EBU R128 profile
│   │   ├── sequenceFeatureService.ts # F0/onset via extension host
│   │   ├── headphoneEqService.ts    # EQ filter application
│   │   ├── headphoneEqSettingsService.ts # EQ profile state + bypass
│   │   ├── editExportSettingsService.ts  # Export region/channel/filter
│   │   ├── editListenService.ts     # Preview listen audio graph
│   │   ├── audioExportService.ts    # WAV export logic
│   │   ├── essentiaHostClient.ts    # STFT host request/response
│   │   ├── autoEqHostClient.ts      # AutoEq host request/response
│   │   ├── autoEqApiClient.ts       # AutoEq API binding (host-delegated)
│   │   ├── eqPresetHostClient.ts    # EQ preset host request/response
│   │   └── playerSettingsService.ts # Player config state + defaults
│   │
│   ├── utils/
│   │   ├── volumeMapping.ts         # Linear ↔ dB volume conversion
│   │   ├── liveBallistics.ts        # Attack/release/hold for live meters
│   │   ├── liveStereoFrame.ts       # Per-frame stereo analysis
│   │   ├── liveMonitoring.ts        # Monitor mode gain matrix config
│   │   ├── liveLogSpectrumAxis.ts   # Log-spaced frequency axis
│   │   ├── stereoPolarField.ts      # Polar/Lissajous field computation
│   │   ├── frequencyPhaseCorrelation.ts # Per-bin phase correlation
│   │   ├── spectralPeakDisplay.ts   # Peak hold/display logic
│   │   ├── quinticBSpline.ts        # B-spline smoothing
│   │   ├── modifiedAkima.ts         # Akima interpolation for EQ curves
│   │   ├── eqCanvasMath.ts          # Biquad frequency response calculation
│   │   ├── audioFileBitDepth.ts     # FLAC bit depth parsing
│   │   ├── essentiaLoader.ts        # Essentia.js WASM loader for webview
│   │   ├── ebur128Loader.ts         # ebur128-wasm loader
│   │   ├── loudnessWorkletLoader.ts # Loudness worklet URL management
│   │   ├── timelinePlotLayout.ts    # Timeline axis layout
│   │   ├── timelineStripChart.ts    # Multi-strip chart rendering
│   │   ├── keyboardTarget.ts        # Keyboard shortcut management
│   │   ├── earEqSegmentedControl.ts # Segmented control widget
│   │   └── earEqSlidingFocus.ts     # Sliding focus indicator animation
│   │
│   ├── styles/
│   │   ├── vscode.css               # VS Code theme integration
│   │   ├── earEqTokens.css          # Design tokens
│   │   ├── panelSurface.css         # Panel layout
│   │   └── figure.css               # Graph containers
│   │
│   └── components/
│       ├── webview/                  # Root WebView component
│       ├── transportFab/             # Play/volume/monitor FAB
│       ├── metaFab/                  # Info button + popover
│       ├── settingsOverlay/          # Settings gear popover
│       ├── settingTab/               # Options/Player/Export tabs
│       ├── infoTable/                # Audio metadata table
│       ├── waveBand/                 # Multi-channel waveform
│       ├── analyzer/                 # STFT pane (waveform + spectrogram)
│       ├── spectrogram/              # WebGL2 spectrogram renderer
│       ├── liveMeters/               # Live analysis components:
│       │   ├── liveAnalysisComponent  # Container with split layout
│       │   ├── levelMeterComponent    # Stereo level meter
│       │   ├── goniometerComponent    # 3-mode stereo field display
│       │   ├── spectralAnalyzerComponent # Log-spaced spectrum bars
│       │   ├── phaseCorrelationSpectrumComponent # Per-bin ρ display
│       │   ├── eqMonitorStripComponent # 5-band monitor controls
│       │   └── liveMonitoringBarComponent # Monitor mode selector
│       ├── loudness/                 # Loudness pane (LUFS/F0/onset strips)
│       ├── editExport/               # Edit & Export pane
│       ├── curveCorrection/          # Headphone EQ overlay
│       ├── figureInteraction/        # Zoom/pan/reset for graphs
│       ├── playerSettings/           # Player settings panel
│       ├── analyzeSettings/          # Analyze settings panel
│       ├── knob/                     # Rotary knob widget
│       └── keyboardShortcuts/        # Keyboard shortcuts overlay
│
├── decoder/                         # C++ WASM decoder (not currently used in build)
│   ├── decoder.cpp                  # FFmpeg-based decoder source
│   ├── Dockerfile                   # Build environment
│   ├── Makefile                     # WASM compilation
│   └── wasm/                        # WASM output (.gitignored)
│
└── __mocks__/                       # Jest test mocks
    ├── jestSetup.js                 # TextEncoder/TextDecoder polyfill
    ├── styleMock.js                 # CSS import stub
    ├── loudness-worklet.ts          # Loudness worklet mock
    ├── ebur128-wasm.ts              # ebur128 WASM mock
    └── helper.ts                    # Test helpers
```

## Build Outputs

```
dist/
├── extension.js            # Extension host bundle (Node.js)
├── audioPreview.js         # Webview bundle (browser)
├── loudness.worklet.js     # Extracted AudioWorklet processor
├── essentia-wasm.web.wasm  # Essentia WASM binary
└── web/
    └── extension.js        # VS Code for Web bundle
```

## Test File Locations

Test files are colocated with source: `foo.ts` → `foo.test.ts`. Key test files:

- `src/shared/sequenceHop.test.ts`
- `src/shared/autoEqEqualizePayload.test.ts`
- `src/shared/parseEqPreset.test.ts`
- `src/webview/utils/*.test.ts` (volumeMapping, liveBallistics, stereoPolarField, etc.)
- `src/webview/services/*.test.ts` (playerService, loudnessService, analyzeService, etc.)
- `src/webview/components/*/...test.ts` (webview, transportFab, liveMeters, etc.)
- `src/eslintPolicy.test.ts` (ESLint convention verification)

## CI/CD

- `.github/workflows/ci.yml` — Runs on push/PR to `main`: `npm ci` → lint-check → format-check → test → webpack → vsce package
- `.github/workflows/release.yml` — Release workflow
