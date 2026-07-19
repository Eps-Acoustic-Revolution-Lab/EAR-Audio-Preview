# Anisotropic Spectrogram Rendering: Why Your STFT Is Either Mosaic or Oil Painting

> 中文版:[频谱图的各向异性渲染:为什么你的 STFT 不是马赛克就是油画](anisotropic-spectrogram-rendering.md)

> Published alongside the spectrogram rendering rework — how EAR Audio Preview's STFT view escaped the "zoom = mosaic, smooth = oil painting" dilemma, and what professional spectral tools (iZotope RX, Adobe Audition) taught us along the way.

If you've zoomed into the spectrogram in EAR Audio Preview to inspect harmonics, you may have lived through two releases:

- **Version one**: zooming revealed a field of blocks — harmonic columns chopped up like a brick wall, the raw STFT data grid on full display;
- **Version two**: the blocks were gone, but the whole image turned into a smeared "oil painting" — drum transients bled sideways and all sense of sharpness was lost.

These two versions correspond to the two classic texture-scaling filters: **NEAREST** and **bilinear interpolation**. Their failure modes are exact opposites, which makes the choice look unwinnable. But the question itself is wrong — a spectrogram is not an ordinary image. Its two axes carry completely different physical meanings.

---

## 1. The unwinnable dilemma

The raw data of a spectrogram is a 2D grid: time on the horizontal axis (one column per STFT frame), frequency on the vertical axis (one row per FFT bin), pixel values in dB. Drawing it on screen nearly always involves scaling — the grid dimensions are dictated by the analysis parameters (frames = duration / hop, rows = windowSize / 2) and have no reason to line up with screen pixels.

Scaling means sampling, and sampling means choosing a filter:

**NEAREST**: each screen pixel takes the closest grid point. Honest and crisp — but zoom in and the grid structure is fully visible. "Mosaic." Harmonic columns quantize into color blocks, and any continuity between adjacent frames vanishes.

**Bilinear**: each screen pixel takes a weighted average of the surrounding four grid points. Smooth, no blocks — but it averages **along both axes at once**: transient edges smear horizontally along time, fine detail blurs vertically along frequency. The result is an "Impressionist oil painting" — pretty, but unreadable. Bart Wronski's [frequency-domain analysis of bilinear filtering](https://bartwronski.com/2020/04/14/bilinear-texture-filtering-artifacts-alternatives-and-frequency-domain-analysis/) nails what this blur really is: a low-pass filter that systematically removes high-frequency structure.

User feedback hit the dilemma precisely: "pixelated" → switch to bilinear → "smeared, hard to read."

---

## 2. A spectrogram is anisotropic data

The way out is this: **the two axes of a spectrogram have completely different data characteristics.**

- **Harmonic content** (voice, strings, winds) appears as horizontal ridges. The fundamental and overtones of a single note are continuously distributed along the **frequency axis** — adjacent FFT bins genuinely transition smoothly (the window function's main-lobe leakage alone makes energy spread continuously across frequency). Interpolating along frequency recovers what the signal actually looks like.
- **Transient content** (drums, plucks, plosives) appears as vertical broadband stripes. Its defining feature is precisely the **abrupt change along time** — two adjacent frames can be worlds apart. Interpolating along time fabricates a gradient that does not exist in the signal.

This is not aesthetic preference — it's a documented signal property. Fitzgerald's work on Harmonic/Percussive Source Separation exploits exactly this [anisotropic smoothness of spectrograms](https://www.researchgate.net/publication/273396583_HarmonicPercussive_Sound_Separation_Based_on_Anisotropic_Smoothness_of_Spectrograms): **harmonic components are smooth along frequency, percussive components are smooth along time** — the directional difference in smoothness is so strong it can be run in reverse to separate sources.

If the data itself is anisotropic, why render it with an isotropic filter?

**The answer writes itself: linear interpolation along frequency, nearest-neighbor along time.**

- Frequency interpolated → harmonics connect into continuous vertical ridges, with no bin-to-bin breaks;
- Time nearest-neighbor → transient edges stay knife-crisp; a drum hit is a drum hit, with no gradient tail.

---

## 3. What the professional tools do

Researching professional spectral tools confirms the derivation:

**iZotope RX** documents this directly in its rendering settings:

> *"HIGH-QUALITY RENDERING: Accurate max-bilinear interpolation of the Spectrogram (recommended). Turning this control off makes Spectrogram rendering slightly faster, but you'll lose some quality."*

— see the [RX 6 docs](https://downloads.izotope.com/docs/rx6/07-spectrogram-waveform-display/index.html) and the [RX 11 manual](https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/RX/RX_11_Manual_English.pdf). Note the "**max**" in "max-bilinear": RX is not pure bilinear. When downsampling it takes the neighborhood **maximum** rather than the mean — so faint harmonic ridges don't get averaged into the background (a mean would dilute a bright line), preserving RX's signature "ridges always pop" look. iZotope's own [spectrogram explainer](https://www.izotope.com/community/blog/understanding-spectrograms) emphasizes that RX's display "is capable of showing greater time and frequency resolution than other spectrograms."

**Adobe Audition**'s spectral display ([official tutorial](https://www.adobe.com/learn/audition/web/audition-spectral-frequency-display-cc)) bets its clarity on **resolution settings**: right-click the frequency ruler to adjust Spectral Resolution, and every community thread about a ["blocky/blurry spectral display"](https://community.adobe.com/questions-544/spectral-frequency-display-blocky-160552) is resolved by changing resolution — never by swapping interpolation modes.

Both threads converge: professional tools neither worship a single interpolation mode nor accept "this is all the resolution there is." They invest on **two fronts at once**: the sampling strategy and the data density.

---

## 4. Implementation: manual anisotropic sampling in the shader

WebGL2 hardware texture filtering can't be configured per axis (anisotropic filtering extensions target oblique mipmap sampling and don't solve "different behavior per axis"), and linear filtering of R32F float textures additionally depends on the `OES_texture_float_linear` extension — not universally available.

So we bypass hardware filtering entirely and sample manually in the fragment shader with `texelFetch`, controlling each axis precisely:

```glsl
// Time axis: nearest-neighbor — transient edges stay crisp,
// no averaging of any kind along time
int frame = clamp(int(v_uv.x * u_texelCount.y), 0, int(u_texelCount.y) - 1);

// Frequency axis: linear interpolation between adjacent bins —
// harmonics connect into continuous ridges
float binF = freqUV * (u_texelCount.x - 1.0);
int b0 = int(binF);
int b1 = min(b0 + 1, int(u_texelCount.x) - 1);
float a0 = texelFetch(u_spectrogram, ivec2(b0, frame), 0).r;
float a1 = texelFetch(u_spectrogram, ivec2(b1, frame), 0).r;
float amp = mix(a0, a1, binF - float(b0));
```

`texelFetch` is core WebGL2: it fetches texels by integer coordinates with no filtering applied, putting the filtering decision entirely back in shader code. Cost: two texture fetches and one mix per pixel — negligible next to the frequency-axis mapping (log/mel/hybrid coordinate transforms).

A bonus: dropping `OES_texture_float_linear` actually *improves* compatibility versus the previous all-bilinear version.

And it's fully orthogonal to the frequency-axis mappings (linear / piecewise log / mel / the new hybrid linear–log blend): the mapping produces `freqUV`; anisotropic sampling only cares about "get the right amplitude."

---

## 5. Color mapping: from rainbow to magma

The other half of readability is the colormap. We previously used a jet-style six-color rainbow: black → blue → purple → red → yellow → cyan-white. The problems with rainbow colormaps are well established in scientific visualization:

- **Non-monotonic luminance**: red and yellow are both bright, purple and blue both dark — equal-energy contours land on different hues, and the eye wastes bandwidth "translating" color;
- **Hue boundaries create false edges**: a harmonic ridge crossing the red→yellow boundary visually gains a line that doesn't exist in the data;
- **Faint structure drowns**: low-level detail hides in the dark blue-purple region.

We replaced it with a **magma-style perceptual ramp** (taken from the project's design-demo spec, treated as data encoding — identical across themes):

```
0.00 → (  4,  3, 12)   near-black deep purple floor
0.25 → ( 59, 15, 79)
0.50 → (131, 38, 129)
0.70 → (209, 78, 114)
0.88 → (249, 142,  9)   amber
1.00 → (252, 255, 164)   pale yellow-white
```

Luminance grows monotonically; the background is a quiet dark floor; energy ridges emerge out of it. The shader and the Canvas2D fallback share the exact same stops, so both rendering paths look identical.

---

## 6. "Not enough pixels" has two layers

When users say "zooming in still lacks pixels," they're describing two distinct problems — and display-side fixes cannot solve data-side sparsity:

**Layer one: display pixels (the backing store).** The webview canvas is CSS-stretched to fill its container; if the backing store is only 1× the design size, on a Retina display (dpr = 2) you're displaying at half resolution — zooming magnifies *canvas pixels*, not data. Fix: supersample the backing store by **dpr × 1.5** (capped at 3×, width 8192 / height 4096 to stay under GPU texture limits), with axis labels scaled proportionally to canvas height.

**Layer two: data pixels (STFT column density).** Zooming into a region re-runs the STFT for the new time range — the texture's **column count** = duration / hop. If hop doesn't change, a 10× zoom stretches 1/10 the columns across the screen; each data column occupies dozens of screen pixels, and nearest-neighbor along time faithfully renders that sparsity as wide blocks. That's not the renderer's fault — it's the **analysis density**. Fix: the hop heuristic now divides by `(renderWidth × SPECTROGRAM_COLUMN_DENSITY)`, i.e. **doubles the time-column density** (bounded by the hop ≥ windowSize/32 floor). Zoomed views now carry twice as many data columns per second, so vibrato on a harmonic or the fine structure of a transient actually has data to show. The cost is roughly 60–100% more analysis time (twice the columns) — perfectly acceptable for an offline analysis pane, and exactly the "trade density for resolution" approach highRes mode was already built on.

Together: the data layer guarantees enough columns exist when zoomed, the display layer guarantees each column lands on enough physical pixels, and anisotropic sampling guarantees columns blend smoothly along frequency but stay razor-sharp along time.

---

## 7. Summary

| Symptom | Root cause | Fix |
|---|---|---|
| Mosaic on zoom | NEAREST on both axes + insufficient resolution | Frequency-axis interpolation + supersampling + 2× column density |
| Oil-painting smear after smoothing | Bilinear averaging transients along time | Nearest-neighbor along time (anisotropic sampling) |
| Harmonic ridges don't pop | Rainbow colormap with non-monotonic luminance | Magma perceptually uniform ramp |
| Blurry on Retina | 1× backing store | dpr × 1.5 supersample, 8192×4096 caps |

A spectrogram is not a photograph. A photo's two axes are homogeneous and deserve one filter. A spectrogram's two axes carry data with fundamentally different physical meaning — one should be smooth, the other razor-sharp. Let the rendering strategy follow the data structure instead of choosing between NEAREST and bilinear, and you get the secret behind why RX and Audition simply *look clearer*.

---

## References

- [iZotope RX 6 — Understanding the Spectrogram/Waveform Display](https://downloads.izotope.com/docs/rx6/07-spectrogram-waveform-display/index.html)
- [iZotope RX 11 Manual (PDF)](https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/RX/RX_11_Manual_English.pdf)
- [iZotope — Understanding Spectrograms](https://www.izotope.com/community/blog/understanding-spectrograms)
- [Adobe Audition — Use the Spectral Frequency Display](https://www.adobe.com/learn/audition/web/audition-spectral-frequency-display-cc)
- [Adobe Community — Spectral Frequency Display Blocky](https://community.adobe.com/questions-544/spectral-frequency-display-blocky-160552)
- [Fitzgerald — Harmonic/Percussive Sound Separation Based on Anisotropic Smoothness of Spectrograms](https://www.researchgate.net/publication/273396583_HarmonicPercussive_Sound_Separation_Based_on_Anisotropic_Smoothness_of_Spectrograms)
- [Bart Wronski — Bilinear Texture Filtering: Artifacts, Alternatives and Frequency Domain Analysis](https://bartwronski.com/2020/04/14/bilinear-texture-filtering-artifacts-alternatives-and-frequency-domain-analysis/)
- [Wikipedia — Spectrogram](https://en.wikipedia.org/wiki/Spectrogram)
