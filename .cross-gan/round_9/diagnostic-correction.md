# R1 localization correction

Initial generators and both discriminators reproduced the failure but misattributed
it to Melodia. The first narrow exception catch did not fix the red tests. Runtime
instrumentation showed zero Melodia calls: converting the empty SpectralPeaks
frequency vector throws before the intended zero-length check.

Both discriminators independently re-ran instrumented probes and refuted their
original location. The speculative catch was removed, not widened. The final fix
checks native vector size before conversion and retains all original Melodia output.

The newly proposed test initially assumed impulse chroma was nonzero and quiet tones
must be unvoiced. Real dependency probes disproved both assumptions. That rejected
proposal is preserved in rejected-regression-assumption.txt; the final regression
instead asserts zero chroma for impulse/quiet input and the dependency's voiced
440 Hz estimate for the quiet tone. A tone-then-silence case additionally checks that
meaningful chroma survives alongside empty frames. No pre-existing test was modified.

The final six regressions were run against the unchanged initial HEAD source and
failed as expected (red-final-tests.log), then against the fixes and passed
(regression-final-tests.log). Failed intermediate attempts remain in this directory.
