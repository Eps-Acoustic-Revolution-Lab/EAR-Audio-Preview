# Roadmap development after v0.6.0

These changes are **unreleased**. The package version remains 0.6.0; the development VSIX must not be confused with the published v0.6.0 artifact. Development uses separate feature worktrees and an integration branch, without changing `main`.

| Feature | Implemented scope | Remaining limits |
| --- | --- | --- |
| Harmonic analysis | Optional Chroma heatmap and predominant melody timeline in single-file Loudness, including fullscreen | Not polyphonic transcription; comparison timelines not yet exposed; 0.1 seconds–5 minutes; 8/32/44.1/48 kHz |
| Spectral descriptors | Optional live power-weighted centroid, spread and 85% rolloff; single-file and comparison | Snapshot measurements, not exported offline feature tracks |
| Weighted RMS | Z/A/B/C selector on the single-file level meter; peaks and playback unchanged | FFT snapshot estimate in dBFS, not calibrated SPL or a certified sound-level meter |
| Background analysis | Dedicated Web Worker for sequence analysis and optional harmonic analysis | See worker documentation for fallback and cancellation behavior |

Implementation details: [harmonic analysis](harmonic-analysis.md), [live monitoring](live-monitoring.md), [weighted RMS](frequency-weighted-rms.md), [background analysis](background-analysis.md).

## Validation on 2026-10-22

- Full integration CI passed: 108 Jest suites, 881 passing tests and one skipped test; types, lint, formatting, tooling and documentation checks passed.
- Production VSIX passed the package audit: 31 files, approximately 3.44 MiB download and 9.97 MiB installed. Worker and WASM assets are included; source maps and development assets are excluded.
- Actual production webview under Chromium and the existing CSP: a 440 Hz fixture measured a 440 Hz centroid and displayed A-weighted RMS; both inline and fullscreen harmonic timelines rendered. No page errors or host sequence fallback were observed. The screenshot check caught overlapping melody-axis labels, which were separated; the focused timeline tests and lint passed before rebuilding the final package.
- Actual final integrated Worker processed ten minutes of 16 kHz audio in 5.511 seconds, yielding 7,201 frames and mean F0 439.779 Hz; the page timer advanced 547 times. Cancellation was tested during analysis at 0.111% progress, with no final reply during a 200 ms observation window. These are local synthetic measurements, not general performance guarantees.

## Reproducible checks

Run `NODE_OPTIONS=--max-old-space-size=4096 npm run ci` for types, lint, formatting, tooling, documentation, full Jest suite, production build, VSIX and package audit.

The browser acceptance runner uses the actual built single-file webview, generated 48 kHz stereo PCM, Web Audio and a real Worker. Only the VS Code file/config bridge is replaced. It serves on an ephemeral localhost port with the production CSP restrictions (including no JavaScript `unsafe-eval`), does not play audible output, and stores screenshots and JSON evidence under ignored `artifacts/roadmap/`.

```sh
EAR_PLAYWRIGHT_MODULE=/path/to/playwright \
EAR_CHROME_EXECUTABLE=/path/to/chrome \
node bench/roadmapAcceptance.mjs
```

For isolated Worker probes, run `NODE_PATH=/path/to/node_modules CHROME_PATH=/path/to/chrome node bench/sequence-worker-browser.cjs long`, substituting `harmonic` or `cancel` for the other probes.

This browser check establishes rendering and runtime behavior under Chromium. It does not establish native VS Code webview URI transport, other operating systems, or musical pitch-estimation accuracy. Native VS Code acceptance and release approval remain separate steps.

## Existing test stabilization

The initial v0.6.0 baseline run had 99 passing suites and one random failure: the filter-control test generated 0.7 Hz even though the service clamps frequencies below 10 Hz. The integration branch replaces random frequencies with deterministic valid values and adds explicit low/high clamp checks. Playback logic is unchanged.
