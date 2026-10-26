# Why Audio Alignment Fails: Designing, Testing, and Breaking Down a DSP Algorithm

> 中文版：[音频对齐为什么会失败：一个 DSP 算子的设计、测试与消融](audio-alignment-dsp.md)
>
> October 17, 2026 · EAR Audio Preview development notes. This article examines a constant integer-delay alignment prototype on a separate research branch. Test environment: Apple M5 Pro / Node.js v24.9.0.

When comparing two audio files, we often want to answer a specific question: are they just a few samples apart, different in overall gain, or opposite in polarity? Once we account for those differences, how much different audio remains?

Cross-correlation gives us a starting point. But simply looking for the largest positive peak can fail in several ways. Mixing stereo channels can cancel the signal. The correct peak for an inverted signal is negative. A periodic signal can produce several peaks that look equally good. With long files, filtering, data preparation, and input checks can also take more time than the correlation itself.

We used `audioscope v1.1.8` as a baseline and built our own alignment algorithm. After five rounds of independent code review and a full ablation study—turning parts off to measure their effects—we could explain what each design choice actually contributed:

- **All gains in positive-case accuracy came from handling edge cases.** On the fixed test set, channel selection handled Side-only cancellation, and searching both polarities handled inverted signals. These two changes explained every positive case where we beat the baseline.
- **Multiple candidates mainly helped reject false matches.** Refining several candidates and checking for ambiguity caught periodic signals with more than one plausible delay.
- **A short analysis window drove the speed gain on long audio.** Reducing the coarse-search window to 4.5 seconds cut processing time for 30-second inputs by about 71% in that ablation comparison.
- **Partial spectral whitening did not improve accuracy, but could trigger an early exit.** It did not increase the number of positive cases passed. On some recordings, it reduced secondary peaks enough to meet the early-exit rule and avoid further refinement.

---

## 1. Define the problem and the interface

**The algorithm estimates a constant integer delay and polarity between signals at the same sample rate. It then uses a least-squares gain fit to measure the residual over their overlap.** It does not handle different sample rates, fractional-sample delays, clock drift, or dynamic time warping (DTW).

Let $A$ be the reference and $B$ the signal to compare, both at the same sample rate. The alignment model is:

$$A[n] \approx p\,B[n+d],\qquad p\in\{-1,+1\}$$

Here, $d > 0$ means that $B$ is delayed relative to $A$. The sign $p$ gives the overall polarity. A later gain fit accounts for differences in amplitude. The prototype exposes two main functions:

```js
estimateAlignment(aChannels, bChannels, sampleRate, options)
// Returns: { accepted, offsetSamples, polarity, confidence, reason }

compareResidual(aChannels, bChannels, sampleRate, offsetSamples)
// Returns shared gain, residual RMS, peak, null depth,
// and other measurements over the valid overlap.
```

`estimateAlignment` decides whether an integer offset is reliable enough to accept. Its `confidence` field is the absolute normalized correlation coefficient. `compareResidual` performs a null test at a given offset: subtracting the gain-adjusted signal from the reference to measure what remains.

---

## 2. The baseline: audioscope v1.1.8

**The baseline uses a coarse-to-fine search: mix to mono, search at about 4 kHz, then refine at the original sample rate using up to 65,536 samples. Both stages look only for positive correlation peaks.**

For a repeatable comparison, we pinned `audioscope v1.1.8` at commit `0cf17749` under `dsp-lab/vendor/`. See [research source access](audio-alignment-research.md) for the frozen files. Its process is:

1. Average the channels into mono and remove the DC offset.
2. Take up to the first 60 seconds and downsample to about 4 kHz by averaging blocks.
3. Compute ordinary cross-correlation and use its largest positive peak as the coarse offset.
4. Return to the original sample rate and search around that peak, using up to 65,536 samples. Again, choose the largest positive value.

Our algorithm keeps mean removal and the coarse-to-fine structure. We changed channel preparation, window length, downsampling filters, spectral weighting, and peak selection. The research implementation is in [operator.mjs](../research/audio-alignment/operator.mjs) and [fft.mjs](../research/audio-alignment/fft.mjs), available through the same [source guide](audio-alignment-research.md).

---

## 3. Channel selection and polarity: keep the signal before searching

**Selecting one matching channel pair by energy, then ranking peaks by absolute correlation, handles both stereo cancellation and overall polarity inversion.** These two changes explain all the positive-case accuracy gains over the baseline in the later ablation study.

### 3.1 Select a channel pair

Averaging left and right fails completely for Side-only stereo:

$$L=x,\quad R=-x \implies (L+R)/2=0$$

Once the mix is zero, neither delay estimation nor gain fitting has a useful signal. Instead of mixing the channels, we select one corresponding pair for delay estimation:

1. For each channel $c$, compute the mean-centered energy of $A_c$ and $B_c$.
2. Score the pair using $\min(\text{Energy}(A_c), \text{Energy}(B_c))$.
3. Choose the highest-scoring pair, favoring a channel with enough signal in both inputs.

The estimated integer delay applies equally to every channel. This is a low-cost energy rule, rather than a joint correlation calculation across all channels.

### 3.2 Search both polarities

If $B$ is a delayed, inverted copy of $A$, the correlation at the correct offset approaches $-1$. A positive-only search misses that match and may choose a positive sidelobe instead.

We therefore rank and filter candidates by absolute correlation, $\vert{}\rho\vert{}$, in both coarse search and refinement. The sign of the best match gives the polarity $p \in \{-1,+1\}$.

---

## 4. Coarse search: a short window, filtered downsampling, and partial whitening

**A shorter window reduces filtering and FFT work. A Blackman-windowed sinc low-pass filter limits aliasing during downsampling, while partial whitening adjusts the weight of different frequency regions.**

The full process is:

```text
Validate PCM → select a channel pair → find a high-energy region → take a window
→ FIR low-pass and downsample → weighted cross-correlation → keep up to 3 peaks
→ refine at the original sample rate → check score and ambiguity
```

### 4.1 Separate the search range from the window length

A default delay range of $\pm 2$ seconds, $T_{\text{lag}}$, does not require sending an entire 30- or 60-second recording through the FFT. Within the common input length, capped at the first 60 seconds, we find a high-energy region and take a short window:

$$T_{\text{window}}=\max(4,\;2T_{\text{lag}}+0.5)\ \text{seconds}$$

The default window is 4.5 seconds. We then downsample by a factor of $\lfloor f_s / 2000 \rfloor$, giving a rate near 2 kHz.

For a 30-second, 48 kHz input, the baseline processes about 120,000 coarse samples per input with a 262,144-point FFT. Our 4.5-second window has only about 9,000 samples per input and needs a 32,768-point FFT. This cuts the preparation and FFT work for long recordings.

### 4.2 Filter before downsampling

The baseline downsamples by averaging blocks, which is a rectangular-window filter. We use a Blackman-windowed sinc FIR low-pass filter instead. Its radius is four times the downsampling factor, its cutoff is 80% of the target Nyquist frequency, and its coefficients are normalized.

The longer FIR costs more per output sample. Keeping the analysis window to 4.5 seconds limits its total cost.

### 4.3 Partial spectral whitening

Let $X$ and $Y$ be the spectra of $A$ and $B$, with cross-spectrum $S_k = \overline{X_k}Y_k$. Ordinary cross-correlation takes the inverse FFT of $S_k$ directly, so strong low-frequency content can dominate the result. Full GCC-PHAT weighting keeps only phase, but can give too much weight to noise in quiet frequency regions.

Our coarse search uses partial whitening between these two choices:

$$C=\operatorname{IFFT}\!\left( \frac{S_k}{\sqrt{\max(\epsilon,\vert{}S_k\vert{})}} \right),\qquad \epsilon=\max\left(10^{-20},\;10^{-5}\max_k \vert{}X_k\vert{}\vert{}Y_k\vert{}\right)$$

The aim was to reduce the influence of strong bands so that more frequencies could help locate the delay. As the later ablation shows, its measured benefit on this test set was in runtime, rather than accuracy.

---

## 5. Refinement and rejection: handle periodic signals with several possible delays

**A high correlation does not mean the delay is unique. Keeping several coarse peaks, refining them in one-pass calculations, and checking for similar scores lets the algorithm reject ambiguous periodic matches.**

### 5.1 Refine with one pass over the samples

The coarse search keeps up to three local peaks by absolute value. Each candidate is refined at the original sample rate, searching sample by sample within two downsampling factors on either side.

Refinement uses at most 16,384 samples. It returns zero if the valid overlap contains fewer than 128 samples or the signal variance is too low. To reduce memory passes, we avoid first computing the means and then making a second pass for centered products. Instead, one pass accumulates $\sum A$, $\sum B$, $\sum A^2$, $\sum B^2$, and $\sum AB$. These raw sums give the mean-centered normalized correlation:

$$\rho(d)= \frac{\sum ab-\frac{\sum a\sum b}{N}} {\sqrt{\left(\sum a^2-\frac{(\sum a)^2}{N}\right) \left(\sum b^2-\frac{(\sum b)^2}{N}\right)}}$$

### 5.2 Accept, reject, or stop early

A refined result must pass two checks:

1. **Score threshold:** the best candidate must satisfy $\vert{}\rho_{\text{best}}\vert{} \ge 0.75$.
2. **Ambiguity check:** if a candidate at another offset scores $\vert{}\rho_{\text{other}}\vert{} > 0.985 \times \vert{}\rho_{\text{best}}\vert{}$, reject the result as `ambiguous-peaks`.

This targets periodic signals such as sine waves. A pure tone produces a near-perfect peak every period, so choosing one delay from those peaks would be arbitrary.

We also use an early-exit rule to avoid extra refinement. If the first candidate refines to $\vert{}\rho\vert{} > 0.999$, and the second coarse peak is less than half the first, we accept the first candidate without refining the rest.

---

## 6. Build the test set and check the baseline

**The tests cover synthetic edge cases, unrelated signals with shared tonal structure, and transformed real audio. Development tests led to a correlation threshold of 0.75, after which the prototype passed every case in the held-out set.**

The generator is [corpus.mjs](../research/audio-alignment/corpus.mjs); see [research sources](audio-alignment-research.md). Its base signal mixes enveloped filtered noise, a swept sine, and a fixed-frequency sine.

- **Positive cases:** positive and negative integer delays, search boundaries, gain changes, DC offsets, added noise, polarity inversion, Side-only stereo, unequal channel energy, leading silence, and first-order low-pass filtering. Because low-pass filtering changes group delay and waveform shape, those cases allow a two-sample error; the other positive cases require an error of at most one sample.
- **Negative cases:** silence, constant signals, periodic pure tones, and synthetic signals with different random noise but shared tonal structure or envelopes.

In an early development run, **5 of 24 negative cases with shared tonal structure were accepted**, with correlations around `0.49–0.52` ([results/dev-round-1.json](../research/audio-alignment/results/dev-round-1.json)). Independent audio with similar spectral envelopes could still produce a moderate correlation. We raised the final acceptance threshold to `0.75`.

After fixing the threshold, we tested 104 validation cases—72 positives and 32 negatives—and 16 real-audio variants. The latter came from four 48 kHz stereo recordings with added delay, gain changes, noise, or polarity inversion:

| Test set | Prototype | audioscope v1.1.8 | Reason for the difference |
| --- | --- | --- | --- |
| Synthetic positives (72) | **72 / 72** | 56 / 72 | The baseline failed on inverted and Side-only cases |
| Synthetic negatives (32) | **32 / 32 rejected** | No rejection mechanism | The prototype rejected silence, unrelated signals, and ambiguous periodic matches |
| Real-audio variants (16) | **16 / 16** | 12 / 16 | The baseline failed on four inverted variants |

---

## 7. Fit gain and measure the residual

**Residual measurement fits one least-squares gain across all channels, using only the valid overlap. Negative gain is allowed so that inverted signals can cancel correctly.**

After selecting offset $d$, `compareResidual` fits one shared scalar gain $g^*$ across all channels in the valid overlap $\Omega$:

$$g^*=\frac{\sum_{c,n\in\Omega} A_{c,n}B_{c,n+d}} {\sum_{c,n\in\Omega} B_{c,n+d}^{2}}, \qquad e_{c,n}=A_{c,n}-g^*B_{c,n+d}$$

Null depth is the ratio of reference energy to residual energy, expressed in decibels:

$$\text{Null Depth (dB)} = 10\log_{10}\!\left(\frac{\sum A_{c,n}^2}{\sum e_{c,n}^2}\right)$$

The baseline's `fitGain` works on mono and requires positive gain. A shared gain across all channels preserves stereo balance. Measuring only the overlap also keeps zero padding at unaligned edges out of the result, matching the purpose of an audio null test more closely.

---

## 8. How performance changed

**The first version was about 40% slower than the baseline because of its longer FIR filter and full input checks. A short window, early exit, and loop unrolling eventually made it more than 2.8 times as fast on 30-second inputs.**

We define speedup as `baseline time / prototype time`; values above 1 mean the prototype is faster. The four stages were as follows. Historical and final measurements are retained in the [research snapshot](audio-alignment-research.md).

1. **First version (30 s: ~0.63×; 3 s: ~0.58×):** fixed channel and polarity failures, but applying the longer Blackman-sinc FIR to the full signal made it slower overall.
2. **Second version (30 s: ~1.03×; 3 s: ~0.75×):** improved PCM validation and added early exit during refinement. Long-input performance caught up with the baseline.
3. **Third version (30 s: ~1.80×; 3 s: ~0.95×):** shortened coarse analysis to 4.5 seconds and simplified FIR boundary handling. Long-input performance moved ahead.
4. **Final version (30 s: 2.80–2.87×; 3 s: 1.33–1.38×):** after five review rounds and loop unrolling, both input lengths were faster than the baseline in these runs.

---

## 9. Five review rounds: edge cases and expensive loops

**Five rounds of independently built counterexamples and fix checks found four edge-case bugs: missed sparse signals, gaps in window coverage, and failures caused by very quiet background noise. Loop unrolling also cut total runtime for long inputs by about 25%.** Full records are in [.cross-gan/](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/tree/4f0a2361c10f89a881d52d118b43761cbd1840a7/doc/research/audio-alignment/.cross-gan/); see [research source access](audio-alignment-research.md).

### Round 1: a spaced sampling probe missed sparse signals

To detect silence quickly, the first version checked every 32nd sample. If a signal had nonzero values only at `i % 32 === 1`, the probe saw only zeros. Two identical, valid signals were rejected as silence:

```js
import { estimateAlignment } from './doc/research/audio-alignment/operator.mjs';

const x = new Float32Array(48000);
let state = 7;
for (let i = 1; i < x.length; i += 32) {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  x[i] = state / 4294967296 - 0.5;
}
console.log(estimateAlignment([x], [x.slice()], 48000)); // The first version reported silence.
```

**Fix:** keep the fast probe, but scan every sample before rejecting an input whose probe energy is too low.

### Round 2: the window selector placed analysis inside silence

After the channel-level fix, moving those sparse pulses into the second half of a one-second clip exposed another failure. The channel check passed, but the window selector used its own energy probe with a step of 16. It missed the later pulses and chose the silent first half for refinement.

**Fix:** add a full-sample fallback to the window selector when the probe reports low energy.

### Round 3: half-window steps missed the tail

The selector moves by half a window: `hop = windowSize / 2`. For 48,000 samples and a 16,384-sample window, the starts are `0, 8192, 16384, 24576`. The last window ends at `40960`. A useful transient after sample `46000` falls outside every candidate window.

**Fix:** when the normal windows have too little energy, also check a window ending exactly at the input boundary: `[length - windowSize, length]`.

### Round 4: unroll the full PCM validity check

Every call checks all samples for `NaN` and `±Infinity`. For long audio, even this simple loop takes a noticeable share of runtime.

**Fix:** check eight samples per loop iteration, with a scalar loop for the remainder. No samples are skipped. This reduced total algorithm runtime by **25–27%** for 30-second inputs and **6–7%** for 3-second inputs.

### Round 5: very quiet noise bypassed an exact-zero fallback

The fallbacks from rounds 2 and 3 originally ran only when the probe energy was exactly `0`. If the opening contained tiny background noise, such as amplitude `1e-9`, its energy was nonzero. The selector could choose that quiet opening and miss useful audio at the end.

**Fix:** change the fallback condition from `=== 0` to `< 1e-12`, matching the channel silence threshold. Very quiet noise can then trigger the full scan and tail check.

---

## 10. Two changes we reverted

**Less arithmetic or a faster small benchmark does not guarantee a faster complete algorithm under V8's JIT compiler.** We reverted two changes that initially looked useful:

1. **Combine both forward FFTs.** Since $A$ and $B$ have equal lengths, their bit-reversal and butterfly operations can share a loop and twiddle-factor updates. Small tests showed slight gains, but the median speedup across eight full-algorithm tests was only `1.006×`, with some cases slower. We reverted it.
2. **Combine both FIR downsampling loops.** We tried applying the same FIR coefficients to $A$ and $B$ in one loop. A separate in-memory benchmark looked good, but the actual implementation ran slower: speed fell to `0.84–0.88×` for short inputs and `0.95–0.96×` for long inputs.

Combining loops can change how the engine handles vector operations or registers, though these timings alone do not show which compiler behavior caused the slowdown. The practical lesson is to check every optimization in the complete running algorithm.

---

## 11. Ablation: measure what each part contributes

**Channel selection and polarity support explain the positive-case accuracy gains. Multiple candidates catch ambiguous periodic matches. The short analysis window explains most of the runtime reduction.**

We froze the algorithm and tested every on/off combination of four parts: **channel selection, partial whitening, multiple-candidate refinement, and the short window**. That gives $2^4 = 16$ configurations. Adding a version without polarity support and the audioscope baseline brought the total to 18. The test set contained **318 cases: 230 positives and 88 negatives**.

### 11.1 Accuracy

| Configuration | Positives passed (230) | Negatives rejected (88) | What failed |
| --- | --- | --- | --- |
| **Full algorithm** | **230 / 230** | **88 / 88** | None |
| No channel selection | 204 / 230 | 88 / 88 | All 26 Side-only cancellation cases |
| No polarity support | 204 / 230 | 88 / 88 | 22 synthetic inverted cases and four inverted real-audio variants |
| No multiple-candidate refinement | 230 / 230 | **66 / 88** | 22 periodic pure-tone cases were accepted without an ambiguity check |
| No partial whitening | 230 / 230 | 88 / 88 | No change in pass rate on this set |
| No short window (full-length analysis) | 230 / 230 | 88 / 88 | No change in pass rate on this set |
| **audioscope baseline** | **178 / 230** | N/A | Exactly 26 channel-cancellation cases plus 26 inverted cases, with no overlap |

Both implementations passed the other 178 ordinary positive cases. The role of multiple candidates is also clear: together with the cross-candidate ambiguity check, they reject periodic signals without a unique delay.

### 11.2 Runtime

We used 3- and 30-second excerpts from four real recordings, rotating test order across **3,024 measured calls**. The ratio is `time with the part disabled / full-algorithm time`. A higher ratio means that enabling the part saves more time.

- **Short window:** `0.998×` for 3-second inputs, since the default 4.5-second window does not shorten them. For **30-second inputs, the ratio was 3.472×**: about 37.0 ms fell to 10.6 ms, a reduction of roughly 71%.
- **Channel selection:** `1.332×` for 3-second inputs and `1.447×` for 30-second inputs. Enabling it reduced runtime by 25–31%, largely by avoiding full-length stereo mixing, array allocation, and sample passes.
- **Multiple-candidate refinement:** `1.005×` for 3-second inputs and `0.997×` for 30-second inputs, within about $\pm 2\%$.
- **Partial whitening:** results depended on the recording. Disabling it made 3-second A/C/D inputs about 35% slower, but B about 8% faster. For 30-second inputs, A became about 12% slower, while B/C/D became about 9% faster.

---

## 12. Why can removing whitening make the algorithm slower?

**Partial whitening adds frequency-domain work, but it can lower secondary peaks enough to trigger an early exit after the first candidate. That saves refinement of the other two candidates.**

Removing whitening avoids square roots and division, so it seems as though it should always be faster. To explain the opposite results, we counted internal operations separately from the timing runs. The counters are in [ablation/work-counts.mjs](../research/audio-alignment/ablation/work-counts.mjs); see [research sources](audio-alignment-research.md).

1. **Work saved by the short window:** on 30-second inputs, the 4.5-second window uses a 32,768-point FFT and about 3.47 million FIR multiply-adds across both inputs. Full-length analysis raises those figures to a 131,072-point FFT and about 23.16 million multiply-adds.
2. **Whitening and refinement counts:** with the full configuration, all eight recording/length combinations met the early-exit conditions after the first candidate: $\vert{}\rho_1\vert{} > 0.999$, with the second coarse peak below half the first. Each estimate needed only **97** time-domain correlation evaluations. Without whitening, 3-second A/C/D and 30-second A did not stop early. Searching all three candidates raised the count to **291**. These were exactly the combinations that became slower.

We then fixed the candidate count at one to remove the difference in early-exit behavior. **Without whitening, all eight combinations were faster, with runtime reductions of about 6–13%.** Whitening pays for itself only when the refinement work it saves exceeds its own frequency-domain cost.

---

## 13. Reproduce the experiments and find the code

The research project has no external npm dependencies and requires Node.js 24 or later. The complete research snapshot is included under `doc/research/audio-alignment/`. Run the commands below from the repository root; see the [source guide](audio-alignment-research.md) for input requirements.

### Reproduction steps

Synthetic tests can run without local recordings. Real-audio timing needs four local files, `A.mp3` through `D.mp3`, converted by the preparation script into the test PCM format. The frozen ablation checks also require the original input hashes; replacement audio does not reproduce those recorded results.

```sh
cd doc/research/audio-alignment

# 1. Prepare local audio, then run the basic tests and evaluation.
node prepare-audio.mjs /path/to/audio-directory
npm test
npm run evaluate

# 2. Run two timing passes and verify them.
node --expose-gc timing.mjs
cp results/timing.json results/timing-pass-1.json
node --expose-gc timing.mjs
npm run verify

# 3. Run the ablation experiments and count internal work.
node ablation/run.mjs accuracy > ablation/accuracy.log
node --expose-gc ablation/run.mjs bench > ablation/timing.log
node ablation/work-counts.mjs
node --expose-gc ablation/interaction.mjs > ablation/interaction.log
node ablation/run.mjs report > ablation/report.log
```

### Code and experiment records

The following links open files in the [frozen research snapshot](audio-alignment-research.md):

- **Core implementation:** [operator.mjs](../research/audio-alignment/operator.mjs) and [fft.mjs](../research/audio-alignment/fft.mjs).
- **Tests:** [operator.test.mjs](../research/audio-alignment/operator.test.mjs), [review-regressions.test.mjs](../research/audio-alignment/review-regressions.test.mjs), and [corpus.mjs](../research/audio-alignment/corpus.mjs).
- **Development records:** [results/dev-round-1.json](../research/audio-alignment/results/dev-round-1.json), [results/final-verification.json](../research/audio-alignment/results/final-verification.json), and [.cross-gan/](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/tree/4f0a2361c10f89a881d52d118b43761cbd1840a7/doc/research/audio-alignment/.cross-gan/).
- **Ablation data:** [ablation/README.md](../research/audio-alignment/ablation/README.md), [accuracy.json](../research/audio-alignment/ablation/accuracy.json), [timing.json](../research/audio-alignment/ablation/timing.json), and [summary.json](../research/audio-alignment/ablation/summary.json).
