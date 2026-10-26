# EAR native integration smoke

Passed on macOS, VS Code 1.142.0 using the current production dist copied after the full CI build. This run used newly generated 12-second stereo 440 Hz fixtures, a new `/tmp/ear-sdk-native-*` profile and process PID 39069. Debug ports 9486/9487 and an isolated controller copy avoided an existing unrelated session on 9476/9477. No historical acceptance files were modified.

## Verified results

- Single-file sequence Worker: 718 frames, voiced F0 approximately 440.3315 Hz.
- Single-file harmonic Worker: 240 chroma frames and 4136 melody frames, voiced melody approximately 440.0054 Hz.
- Single-file Live Spec: visible polar sound field, phase spectrum and 440 Hz spectrum curve. Spectral descriptors reported centroid 440 Hz. RMS Z/A/B/C selection produced finite changing RMS values; sample peak stayed -10.3 dBFS.
- Comparison: two actual WASM-backed sequence Workers returned result batches with 718 frames and voiced F0. This was not inferred from a fallback label.
- Comparison Live Spec: seeking to 3 seconds produced both named track descriptor rows with centroid 440 Hz, as well as visible overlaid spectrum curves. The three inline backing canvases measured 394×394, 2270×434 and 2672×598; all had positive CSS size.
- Comparison context menu opened, Fullscreen entered, and Escape restored the inline view.
- Main harness captured zero Runtime.exceptionThrown events. Each webview logged the browser warning `Unrecognized feature: 'local-network-access'.`; this warning was retained and was not classified as a product runtime exception.

The new-profile first LOUDNESS click occurred before effective initialization; clicking again mounted the pane, after which real Worker results and live data completed. No timeout was treated as success. Supplemental inspection scripts initially had selector mistakes and generated evaluated-expression exceptions; those mistakes were corrected before the final successful supplemental run, and are separate from the main harness's retained product exception record. An initial supplemental comparison view at the end of playback showed no tracks; seeking inside the recording produced both track snapshots, so an end-of-recording empty snapshot is not being reported as a regression.

`result.json` is this run's main evidence, `live-smoke.json` holds the supplemental comparison checks. `single-live.png` and `comparison-live.png` were visually inspected. Captured screenshots also include harmonic and comparison loudness views. No cross-platform, subjective listening or performance claim is made.

Only the process group launched by this run was stopped. Its temporary profile, local controller/extension copies, fixture audio and token-bearing session file were removed after evidence collection.
