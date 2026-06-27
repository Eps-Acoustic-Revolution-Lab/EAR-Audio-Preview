# Reverse-Engineering PAZ Analyzer's Spectrum Curve in VS Code

> 中文版：[在 VS Code 里逆向复刻 PAZ Analyzer 的频谱曲线](cqt-spectrum-analyzer.md)

> Published alongside the CQT spectrum analyzer feature — how we brought Waves PAZ Analyzer's spectrum curve into EAR Audio Preview's live analysis pane.

If you've used **Waves PAZ Analyzer**, you probably remember what its spectrum looks like: solid flat-top "trapezoids" in the low end, a smooth flowing curve up top — nothing like the jagged, constantly-flickering FFT bar graph you get in most audio software.

This release brings that look into VS Code. PAZ is a closed-source commercial plugin with no public rendering code, so we pieced its behavior back together from the official manual, signal tests, and a lot of staring at the screen. Below is how the curve works and the tradeoffs we made porting it.

---

## 1. Why a plain FFT spectrum "looks bad"

A standard FFT cuts the frequency range into **equal-width** bins. The problem: human pitch perception is **logarithmic** — 20→40 Hz and 10k→20k Hz are both "one octave" to the ear, but in an equal-width FFT the former gets a handful of bins while the latter piles up thousands.

So on a log frequency axis, the low end looks coarse (too few bins) and the high end looks crowded and jittery (too many). That fuzziness comes from the mismatch between a fixed time-frequency resolution and the ear's logarithmic perception.

PAZ's answer is to switch transforms.

---

## 2. CQT: resolution allocated where it's needed

PAZ uses a **Constant-Q Transform (CQT)** rather than a fixed-size FFT. The manual says it plainly:

> *"Optimal time and frequency resolution in the PAZ is achieved by using wavelet techniques (as opposed to FFTs)."*

The core idea of CQT is to give each band its own **analysis window length**:

```
N_k = Q_k × fs / f_k
```

where `f_k` is the band's center frequency, `Q_k` is the quality factor, and `fs` is the sample rate. Low frequencies use long windows for frequency resolution; high frequencies use short windows for time resolution — the wavelet approach, and it happens to line up with how the ear works.

### The variable-Q psychoacoustic model

Another thing about PAZ: it **doesn't use a single Q value**. It splits at **250 Hz**:

| Region | Q | Bins/octave | Character |
|--------|---|-------------|-----------|
| Below 250 Hz | 3.85 – 6.97 | 3.0 – 5.2 | sparse, wide bands |
| Above 250 Hz | ≈ 10.0 | ≈ 7.3 | dense, narrow bands |

From the manual:

> *"Above 250Hz, the 'engineering Q' (or width) of the bands are about 10.0, which... are similar to the resolution of our hearing."*

Sparse-and-wide below, dense-and-narrow above — that's where PAZ's "stepped" low end and smooth high end come from.

### One knob, three parameters

That "LF resolution" knob on the PAZ panel (40 / 20 / 10 Hz) actually sets three things at once: **lowest analysis frequency, low-band Q, and total band count.**

| LF Res | Lowest freq | Low-band Q | Total bands (44.1k) |
|--------|-------------|-----------|---------------------|
| 40 Hz | 40 Hz | 3.85 | 52 (per manual) |
| 20 Hz | 20 Hz | 5.07 | ~64 |
| 10 Hz | 10 Hz | 6.97 | up to 68 |

> *"The default setting of the LF resolution control is 40Hz, which gives 52 bands, and most closely approximates the constant-Q critical frequency bands of the ear."*

---

## 3. The hardest part to crack: left-edge rendering

Knowing the band layout wasn't enough. Our first attempt plotted each band at its center frequency, and it never matched PAZ — peaks landed systematically too far right.

The break came from a signal test. We fed PAZ a **20 Hz pure sine** (10 Hz LF res mode) and the peak showed up at **~18 Hz**, not 20 Hz. That offset was the clue.

Run the numbers: in that mode the band near 20 Hz has a center frequency around 19.51 Hz, and its **geometric mean** with the previous band (center 17.07 Hz) is exactly `sqrt(17.07 × 19.51) ≈ 18.3 Hz`.

Here's the answer: **PAZ doesn't plot points at band centers — it plots them at the left edge of each band.**

```
leftEdge[0] = 6 Hz                            (axis start; the first band extends left)
leftEdge[k] = sqrt(center[k-1] × center[k])    for k ≥ 1
```

The left edge is the geometric mean of two adjacent center frequencies — on a log frequency axis, the natural boundary between two bands. The curve is built about as simply as it gets:

1. Each band draws one point at `(leftEdge[k], dB[k])`
2. Points connect with **straight line segments** (no splines, no smoothing)
3. The first band extends left to 6 Hz; the last extends right to nyquist

### Supporting evidence

- **12 Hz input, 10 Hz mode**: energy bounces between the 18 Hz and 6 Hz plot points — exactly the left edges of the two nearest bands
- **By eye**: where low bands are wide enough, you can clearly see straight-line connections, no curve interpolation anywhere

This also explains the **trapezoid effect**: low bands are few and wide, so left-edge rendering plus straight lines naturally forms flat-top trapezoids; high bands are many and dense (about 7.3 per octave), so the packed line segments visually fuse into a smooth curve. Stepped lows, smooth highs — PAZ's look is the product of this one mechanism.

---

## 4. What we changed in the port

After the theory came the engineering. We didn't copy it wholesale; we changed a few things. Full implementation details are in [`cqt-spectrum-implementation.md`](../knowledge-base/cqt-spectrum-implementation.md) — here are the key decisions.

### 1. Goertzel instead of wavelets

We implement the CQT with the **Goertzel algorithm**. Goertzel is essentially a single-frequency DFT, computed independently per band with its own Hann window — equivalent to wavelets (both are per-bin independent-window analysis), but much simpler to implement, and each band costs only O(N_k). Window lengths are capped by the `AnalyserNode` `fftSize` limit.

### 2. Hybrid render grid: our biggest departure from PAZ

PAZ's plugin window is small (~400–600px wide), so 52 bands connected with straight lines already look smooth enough at that resolution. But our canvas in VS Code easily exceeds 1400px — those same 52 points connected directly produce obvious polygonal aliasing in the high end.

The fix is a **hybrid grid**, still split at 250 Hz:

| Region | Render point source | Visual result |
|--------|--------------------|---------------|
| Below 250 Hz | raw left-edge frequencies (sparse) | keeps PAZ's trapezoids |
| Above 250 Hz | log-spaced dense points (~292) | smooth curve |

We fit a single **Modified Akima spline** through all the CQT data, then evaluate it on this hybrid grid. The key: an Akima spline passes exactly through every source knot, so the low-frequency render points land right on the original left edges and return **uninterpolated original values** — the trapezoid steps survive intact; only the dense high-frequency points get interpolated into a smooth line. **Interpolating only above 250 Hz** is the most important tradeoff in this port.

### 3. Peak Hold cleared by double-click

PAZ's Peak Hold is a "rises but never falls" max envelope, reset by clicking a Clear button. Our UI has no room for a dedicated control, so we made it **clearable by double-clicking the spectrum area**; it also resets automatically when you switch FFT/CQT mode or change the LF Resolution.

### Differences from PAZ at a glance

| Aspect | PAZ original | Our implementation | Reason |
|--------|-------------|--------------------|--------|
| HF rendering | straight segments (smooth in a small window) | Akima interpolation (292 points) | canvas far wider than PAZ |
| LF rendering | straight segments through left edges | **same** | trapezoids are the signature look |
| Analysis engine | wavelet transform | Goertzel single-freq DFT | simpler to implement, equivalent result |
| Peak Hold clear | Clear button | double-click in the area | fits the UI layout |

---

## 5. The result

Open EAR Audio Preview's **Live Spec** pane and switch to CQT mode: the X axis starts fixed at 6 Hz, the low end is trapezoid steps, the high end is a smooth curve, and there's an outer Peak Hold envelope tracking the running maximum.

The whole thing runs in the browser sandbox with Web Audio + Canvas2D, no native dependencies.

To dig deeper:

- **PAZ reverse-engineering analysis**: [`paz-spectrum-rendering.md`](../knowledge-base/paz-spectrum-rendering.md) — strictly describes the original plugin's behavior
- **Port implementation notes**: [`cqt-spectrum-implementation.md`](../knowledge-base/cqt-spectrum-implementation.md) — every change we made, with a code index
