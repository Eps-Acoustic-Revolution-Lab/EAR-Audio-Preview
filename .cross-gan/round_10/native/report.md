# Native acceptance — initial build a8bb4df

Verdict: BLOCKED on real VS Code worker resource fetch.

Environment: macOS arm64, VS Code 1.142.0, disposable user data at /tmp/ear-r10-native-profile and copied extension package/dist. Real 12-second stereo 440 Hz PCM16/44100 Hz WAV. Pass-through Worker.prototype.postMessage observer captures real requests/replies; no fabricated DSP or IPC. Editor remains open for fix verification.

- Single-file F0 and harmonic worker requests both returned `Cannot load analysis WASM: 408`.
- Harmonic UI reported `Harmonic analysis unavailable. Try again.` F0 host fallback rendered its strip.
- Both comparison tracks' sequence worker requests also returned HTTP 408. Host fallback can eventually fill comparison F0, which does not prove worker success.
- The identical WASM URI fetched from the webview returned HTTP 200, 1,987,689 bytes in 11.5 ms. A basic blob Worker returned 42. This isolates native resource routing from package absence or general worker CSP denial.
- Live descriptors passed: centroid 440 Hz, spread 13 Hz, 85% rolloff 452 Hz.
- RMS switching passed: Z -13.3, A -17.4, B -13.7, C -13.3 dBFS, both channels. Peak remained -10.3 dBFS throughout.
- No captured Runtime exceptions; editor emitted an unrelated `Unrecognized feature: local-network-access` warning.

Evidence: `result-before-fix.json`, `worker-fetch-failure.json`, `single-harmonic.png`, `single-live.png`, `comparison-loudness.png`.

Harness: `launch.mjs` and `verify.mjs` use existing bench controller and CDP helper. Observer now correctly converts ArrayBuffer wire fields to Float32Array and accepts subsequent wasmBinary-based protocol. Initial failures carried no profile, so the earlier array-observer mistake did not affect HTTP408 evidence. Result-returning workers require a fresh corrected-observer run after the fix.

Limitations: synthetic-tone native smoke acceptance only, not listening, performance, Windows/Linux or VS Code Web evidence. Profile/session token, copied extension bundle and fixture audio are temporary, not review artifacts. VS Code itself created its shared application database under ~/.vscode-shared despite the isolated user-data setting; harness did not edit any existing editor settings or processes.

# Final acceptance — 5d22f0e, 2026-10-26

Verdict: PASS after N1 fix; previous native blocker resolved. Ran twice against the production build with the corrected observer.

- Each sequence request transfers a 1,987,689-byte WASM ArrayBuffer from the webview to the real Worker.
- Single-file F0 Worker returned 718 frames with voiced F0 around 440.3315 Hz.
- Single-file harmonic Worker returned 240 chroma frames and 4,136 Melodia frames with voiced melody around 440.0054 Hz. UI displayed “Chroma & melody analyzed” and rendered its timeline.
- Both comparison tracks returned independent successful sequence Worker results, each with 718 F0 frames near 440.3315 Hz. Both loudness tables and pitch strips rendered.
- Live descriptors retained centroid 440 Hz, spread 13 Hz, 85% rolloff 452 Hz.
- RMS Z/A/B/C remained -13.3/-17.4/-13.7/-13.3 dBFS; peak remained -10.3 dBFS. Readouts captured on both channels.
- No runtime exceptions or worker errors captured. Only unrelated VS Code feature-policy warning remained.

Final raw evidence: `result-after-fix.json`; final screenshots: `single-harmonic-after-fix.png`, `single-live-after-fix.png`, `comparison-loudness-after-fix.png`. Harmonic and comparison screenshots were visually inspected. The synthetic-tone/cross-platform/listening limitations above still apply.

Closed only this run's disposable VS Code process group (PID 28308). No product source edits, commits or existing editor process termination by this verifier.
