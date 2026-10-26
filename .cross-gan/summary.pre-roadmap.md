# Branch review — 2026-10-16

Generated from checkpoint.json; do not maintain a second manual state record.

Status: final-local-acceptance-verified-uncommitted
Reviewed branch: task/unify-board-ui_2026-10-16_1; review head: 06705d4; base: 139f281.

## Accepted changes

- C1: Cancel reload reads on removal and release the serial loading queue.
- R1: Clean up panels closed during initialization and failed initial opens.
- R2: Settle requests after Worker failure/disposal; cancellation cannot block cleanup.
- C2: Preserve literal filenames in Loudness hover with DOM text nodes.
- E1: Cache stable frequency terms without changing numeric evaluation order.
- C4-1: Align polar projection and lookup with angular deposition.
- C4-2: Fold negative-mid PCM without false anti-phase classification.
- C4-3: Bound polar interpolation at first and last bin centers.
- R4-R1: Validate external headphone EQ before restoring or installing profiles.
- R6-E1: Bound measurement yielding by work time; exact Float64 parity.
- R6-R1: Keep eight-file header focus and reload controls reachable.
- R7-1: Latest single-file reload owns document data.
- R7-2: Entering Edit replaces full-file playback with the selected loop.
- R7-3: Live display changes preserve playback position.
- R7-4: Measurement endpoints retain exact boundary samples.
- R7-5: Channel and band monitoring works with analysis panels hidden.
- R7-6: Measurement cancellation follows captured inputs and clears status.
- R7-7: Source-directory export preserves filesystem provider identity.
- R8-1: Explicit mono analysers preserve monitoring PCM from the first frame.

## Verification

79 test suites passed; 712 tests passed, 1 skipped. TypeScript, lint, format, webpack targets and VSIX packaging passed.

Round 7 fixes the seven previously confirmed refinement findings with 56 additional regressions and two non-author reviews per fix. Its initial startup limitation and original failing results remain recorded as historical evidence. See round_7/summary.md and verify.json. This scoped repair does not claim a new whole-repository dry review or performance speedup.

Round 8 resolves the inherited first-128-frame transient, confirmed in real-time playback. All 32 complete-frame PCM cases pass with zero measured error. The seven refinement fixes pass targeted acceptance against the final installed VSIX, with all runtime files matching the package. Background native runtime checks do not claim foreground display performance, physical output measurement or subjective listening. See round_8/summary.md and verify.json.

Historical performance evidence: existing single-file gates passed on an uncontended rerun; the initial noise outlier is preserved in round_2. These benchmark figures were not remeasured by the refinement repair.

The immutable native-rate comparison DSP check covers 4,096 byte-identical frames. Root and independent complete-call throughput results:

- stft.stereo.48k.80ms.512.a: 1.081x / 1.074x.
- stft.mono.48k.8ms.512.a: 1.544x / 1.544x.
- live.stereo.48k.80ms.1024.a: 1.106x / 1.104x.

The unweighted 256-bin case is near measurement noise and is not counted as a meaningful speedup. The earlier pre-release follow-up converged dry; round 6 covers the subsequent capacity and measurement additions.

Pre-release rounds 4–5 accepted four correctness/robustness fixes and converged dry. All 15 unchanged speed/size gates, 373 geometry cases, 132 spline cases and 4,096 strict energy cases passed. No new efficiency rewrite was accepted.

Current round 6 additionally verified eight audible sources in native VS Code, six rapid reopens without notifications, browser FFT/CQT stress, real Web Audio gain/EQ rendering and menu actions. Four original full recordings loaded twice; not eight distinct recordings. Cursor was not separately benchmarked. Earlier polar correctness changes intentionally differ from inherited wrong geometry; historical baselines remain unchanged.

Local integration: {"branch":"main","mode":"fast-forward-existing-commit","previousMain":"139f28124d66a7ddbe54553ded3ae24074c5a83a","head":"06705d4807e121e60737a080daa0a2d6bd2827dd","newCommitCreated":false,"pushed":false,"workingTree":"review fixes, optimization, tests, benchmark and docs remain uncommitted","trackedPatchPreservedSha256":"dc523fc780630a631d540b260dab63676b07771be152e922fd19341a2c4a9a29"}. No new commits or pushes.
