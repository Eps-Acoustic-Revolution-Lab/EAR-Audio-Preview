# Test architecture and extension guide

[Development and release](development.md) · [English README](../README.md) · [Chinese README](../README.zh-CN.md)

Keep tests beside their source modules as `module.test.ts`. Use `module.integration.test.ts` for tests against real dependencies. This makes each module's behavioral contracts easy to find. Architecture groups provide focused execution while preserving existing test files and assertions.

## Choose tests by module

| Group | Source and test locations | Coverage and examples |
| --- | --- | --- |
| `host` | `src/audioPreviewEditor*`, `src/comparison/`, `src/extensionHost/` | File reloads, editor disposal, URIs and host messaging; see `audioPreviewEditor.test.ts` |
| `shared` | `src/shared/`, excluding explicit integration tests | STFT, sequence features, sample hops and EQ parsing; see `sequenceFeatureCompute.test.ts` |
| `services` | `src/webview/services/` | Single-file playback, monitoring, settings, analysis and export lifecycles; see `playerService.test.ts` and `editListenService.test.ts` |
| `comparison` | `src/webview/comparison/` | Multi-track state, shared transport, workers, caching, measurements and page coordination; see `comparisonSession.test.ts` and `comparisonApp.test.ts` |
| `ui` | `src/webview/components/`, `spectrogramFrequencyLayout.test.ts` | DOM behavior, interaction events, controls and layout; see `contextMenu.test.ts` and `webview.test.ts` |
| `utils` | `src/webview/utils/` | DSP kernels, coordinate geometry, plotting helpers and runtime loaders; see `stereoPolarField.regression.test.ts` |
| `codecs` | `src/webview/decoders/`, `encoder.test.ts` | Decoder fallback, resource cleanup and PCM encoding |
| `contracts` | `src/message.contract.test.ts`, `src/eslintPolicy.test.ts` | Message protocol and repository coding policies |
| `integration` | `*.integration.test.ts` under `src/` | Real third-party dependencies; currently actual Essentia feature computation |

Group rules live in [scripts/test-groups.mjs](../scripts/test-groups.mjs). New tests inside existing module directories are classified automatically. When adding an architectural directory, update the rules and this table. Each test belongs to one execution group; explicit integration tests take precedence over module groups.

```sh
# Show groups and current file counts; check for unclassified tests
npm run test:group -- --list
npm run test:inventory

# Run one or more affected modules
npm run test:group -- comparison services
npm run test:group -- integration

# Forward Jest options: filter by test name or watch changes
npm run test:group -- services -- -t 'Edit'
npm run test:group -- comparison -- --watch

# Run one file
npm test -- --runTestsByPath src/audioPreviewEditor.test.ts --maxWorkers=2

# Run all source tests, including integration, and the tooling tests
npm test -- --maxWorkers=2 --workerIdleMemoryLimit=512MB
npm run test:tooling
```

The group runner defaults to two workers with a 512 MB idle-memory limit per worker. `npm test` retains Jest's full discovery behavior and remains the release gate. CI's existing `test:tooling` step checks group coverage against actual Jest discovery; unclassified tests fail validation. Use `--list` for current counts instead of maintaining a static count here.

## Extend coverage along the architecture

1. **Computation and data rules:** start with pure-function tests in `shared`, `utils` or the owning module. Cover values, boundaries and invalid inputs. For a new measurement, include empty ranges, integer and fractional sample boundaries, mono/stereo input, different sample rates and last-frame impulses.
2. **State and resource lifecycles:** use `services`, `comparison` or `host` tests for operation order, cleanup, cancellation and recovery. Async features should cover an older task completing late, failure of the latest task, input changes during work and completion after disposal.
3. **Page coordination:** use `ui` or `comparisonApp.test.ts` to verify user events, terminal task states and preserved view state. Playback regressions should assert source nodes, clocks, loop bounds or output connections as appropriate, beyond button labels alone.
4. **Real runtime boundaries:** changes involving Web Audio, workers, WASM, layout or editor APIs need the relevant acceptance checks below. State which objects are real and which are mocked in the validation record.

Organize each test file's `describe` blocks around applicable behaviors: normal operation, input boundaries, async/disposal and regression cases. Test names should describe the trigger and expected result. Reproduce a new regression against the old implementation before fixing it. Preserve existing assertion strength; do not change tolerances or baselines to hide failures.

## Fixtures and mocks

- Shared Jest setup and dependency substitutes live in `src/__mocks__/`. The default environment is jsdom with a Canvas mock. Use a file-level `@jest-environment node` annotation for real Node dependencies, as in the Essentia integration test.
- Keep module-specific short audio fixtures, deferred promises and node substitutes in the test file. Extract adjacent helpers when multiple tests genuinely share them. Helper files must not use the `*.test.ts` suffix.
- Prefer reproducible short impulses, sine waves, silence or seeded data for numerical tests. Choose exact equality or a justified tolerance based on the algorithm. Keep real recordings used for browser or host acceptance outside the repository.
- Release AudioContexts, listeners, timers and workers, and restore modified mocks. Use controlled promises and clocks for ordering tests instead of long delays.

## Other validation layers

| Layer | Entry points | When to extend |
| --- | --- | --- |
| Release tooling | `scripts/*.test.mjs`; `npm run test:tooling` | Release-note extraction, version validation, test grouping and other Node tools |
| Browser acceptance | `bench/comparisonBrowserHarness.mjs`, `comparisonAcceptance.mjs`, `comparisonStress.mjs` | Production bundles, real Web Audio, workers, four/eight-track load and menu actions; requires built assets, external audio and Playwright |
| Numerical and performance benchmarks | `bench/benchmark.ts`, `comparisonDsp.mjs`, `polarGeometryValidation.mjs` | DSP optimization and geometry correctness; see the [development guide](development.md#benchmarks-and-demos) for commands and historical baseline boundaries |
| Native editor acceptance | F5; [installed-extension validation](../bench/plugins/README.md) | File dialogs, real filesystem providers, persistence, close/reopen behavior and installed packages |
| Demo capture | [bench/demos/README.md](../bench/demos/README.md) | Real-audio README workflows; GIFs do not establish automated test results |

Browser stress scripts require separate four-track and eight-track harness servers on ports 9344 and 9348. `npm test` does not start them. Run performance measurements separately and serially, preserving `bench/baseline.json` and established thresholds. Historical `.cross-gan/` review evidence remains in Git history; `doc/metrics/` retains published measurements; durable new regressions belong beside the source or in the appropriate acceptance harness.

Before committing, run affected groups, the full source suite, `test:tooling`, type checks, lint and formatting checks. Before release, use `npm run ci` to include production packaging. Passing DOM tests does not establish real-browser layout or audio-output correctness.

## Monitor startup PCM regression

Use [monitorStartupValidation.mjs](../bench/monitorStartupValidation.mjs) for changes to the single-file Web Audio graph:

```sh
EAR_PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
EAR_CHROME_EXECUTABLE=/absolute/path/to/chrome \
node bench/monitorStartupValidation.mjs /tmp/ear-monitor-validation
```

The harness bundles the actual `PlayerService`. It runs 16 representative cases in both `OfflineAudioContext` and real-time `AudioContext`, covering 44.1/48 kHz, mono/stereo, equal/antiphase/left-only signals, monitoring modes and initial Live visibility. It compares both output channels from frame zero, including the first 128 frames; real-time capture also rejects missing or duplicate frames. The worklet captures PCM before a muted hardware sink. This establishes signal correctness, not subjective listening or physical speaker performance.

For a before/after regression, set `EAR_MONITOR_PLAYER_SOURCE` to a saved pre-fix `playerService.ts`; its imports resolve against the current source tree. `EAR_MONITOR_SOURCE_ROOT` selects a complete source snapshot instead. Keep failing output alongside passing output, and do not discard startup samples. This focused numerical harness complements the installed-VSIX UI and filesystem checks recorded in [the final local acceptance report](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/tree/4f0a2361c10f89a881d52d118b43761cbd1840a7/.cross-gan/round_8/summary.md).
