# Final native smoke — passed

VS Code 1.142.0 on macOS; production dist copied after final CI package audit passed. Isolated profile and owned process PID 44751; separate controller/debug ports. No product source changes.

- Single-file 44.1 kHz stereo 440 Hz tone: live centroid 440 Hz, RMS −13.3 dB and peak −10.3 dB; three live canvases had positive CSS/backing dimensions.
- Pause displayed Playback paused; resume restored the 440 Hz live descriptor.
- Row drag changed goniometer height 188.16 → 293.73 CSS px; column drag changed polar width 274 → 135 px.
- Switching away during an active row drag, moving the pointer, and returning restored live analysis with valid canvases. No Runtime exceptions.
- Screenshots: single-live.png and single-live-details.png. DOM mouse events exercised native webview handlers; this does not establish physical pointer or subjective listening acceptance (launch was muted).

The initial harness compared the row flex shorthand, which stays auto, and moved the column into a square-size clamp. The corrected harness checks rendered row height and moves the column within its usable range. Final result.json passed.

Owned process group stopped; temporary profile, controller/extension copies, and token session file removed. User windows were not targeted.
