# Round 10 — native worker resource loading

Native acceptance exposed N1 after browser-only validation passed. Two independent discriminators confirmed it. Commit 5d22f0e loads WASM in the webview and transfers bytes into the worker. All three added regressions fail against the previous implementation and pass after the fix. Full CI passes. Native revalidation now passes in actual macOS VS Code for single-file F0/harmonic and both comparison workers, plus live descriptors and weighted meters. A complete three-dimension dry review remains required before merge.

The original worker test is preserved in before/. Two discriminators approved the necessary mock/strict transfer contract migration; no existing behavior assertions were removed or weakened. Checkpoint records both hashes.
