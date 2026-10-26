# Chroma and predominant melody

In a single file's **Loudness** pane, choose **Analyze chroma & melody** to run the optional analysis. Existing loudness, F0 and onset calculations keep their defaults. Chroma and melody follow the current analysis time range; hovering shows melody frequency and confidence. Both the inline and fullscreen pane expose the control. The multi-file comparison view does not yet expose these timelines.

- **Chroma:** 12 relative pitch-class strengths, ordered C through B, from Essentia SpectralPeaks → HPCP. A 4096-sample Hann window is centred at each timestamp, with zero padding at the boundaries and approximately 50 ms between frames. HPCP uses A = 440 Hz, no maximum-bin rotation, no band split, and per-frame unit-maximum normalization. Brightness expresses relative strength within a frame, not absolute loudness or the probability of a chord.
- **Melody:** Essentia EqualLoudness → PredominantPitchMelodia, with a 2048-sample frame and 128-sample hop. This estimates one predominant melody in an accompanied recording, **not all simultaneous notes or polyphonic transcription**. Its timestamps start at zero and use their own hop clock, independent of chroma and the existing PitchYinFFT F0 plot. Nonpositive pitch/confidence values appear as gaps. Confidence is an algorithm score, not a calibrated probability.

Analysis runs only on request and is cached for the current audio buffer. Unsupported or failed analysis leaves the existing loudness/F0/onset results intact. Supported sample rates are 8, 32, 44.1 and 48 kHz (verified against the installed EqualLoudness implementation; its 16 kHz configuration throws). The initial implementation accepts clips from 0.1 seconds up to five minutes to bound the whole-signal Melodia workload. Shorter or longer recordings and other sample rates are explicitly unavailable; the original loudness/F0 analysis remains available. Stereo input uses the existing arithmetic mono downmix, which can cancel opposite-phase material.

Chroma and Melodia run in an isolated browser Web Worker using the packaged Essentia WASM runtime. Closing the editor terminates the worker, including a synchronous Melodia call. If the worker cannot run, harmonic analysis reports an error and never falls back to synchronous extension-host computation. Output vectors are copied before their WASM allocations are released, including error paths. Silent input is returned explicitly as zero chroma and unvoiced melody because the installed Melodia implementation throws on an empty contour set.

Validation includes real installed Essentia WASM: A4 maps to chroma A and a predominant melody near 440 Hz, while silence has no voiced melody. Unit coverage checks wire copies, rejected inputs, cancellation, allocation cleanup, opt-in request/cache behavior, UI failure/retry and disposal. This is synthetic numerical validation, not an accuracy benchmark on music or a native VS Code acceptance result.

Frames without spectral peaks retain zero chroma without passing an empty native
vector to Essentia's converter. This permits impulse recordings, quiet tones,
and ordinary silent segments to complete. The original Melodia output is retained;
quiet periodic signals are not automatically relabelled as unvoiced.

Algorithm references: [HPCP](https://essentia.upf.edu/reference/std_HPCP.html), [PredominantPitchMelodia](https://essentia.upf.edu/reference/std_PredominantPitchMelodia.html), [EqualLoudness](https://essentia.upf.edu/reference/std_EqualLoudness.html).
