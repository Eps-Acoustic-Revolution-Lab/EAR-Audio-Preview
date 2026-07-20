/**
 * Modified Akima piecewise cubic interpolation.
 *
 * Given a sorted set of (x, y) knots, returns an interpolator function that
 * evaluates the Modified Akima spline at any x within [x0, xN].  Outside that
 * range the nearest endpoint value is returned (clamp).
 *
 * "Modified Akima" (makima) reduces the tendency of the original Akima
 * spline to produce flat regions.  The key change is that the slope weights
 * use |Δm| + 0.5 * |m_avg| instead of plain |Δm|, preventing zero-weights
 * from forcing exact monotone segments when differences are equal.
 *
 * References:
 *  - Akima 1970, ACM: https://dl.acm.org/doi/10.1145/114697.116810
 *  - MATLAB makima: https://www.mathworks.com/help/matlab/ref/makima.html
 *  - Cleve Moler blog: https://blogs.mathworks.com/cleve/2019/04/29/makima-piecewise-cubic-interpolation/
 */

export interface AkimaInterpolator {
  /** Evaluate the spline at x (clamped to the input range). */
  evaluate(x: number): number;
}

/**
 * Build a Modified Akima interpolator from sorted knot arrays.
 *
 * @param xs  Strictly increasing x-coordinates (at least 2 points).
 * @param ys  Corresponding y-values (same length as xs).
 */
export function buildModifiedAkima(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
): AkimaInterpolator {
  const n = xs.length;
  if (n < 2) {
    throw new Error("modifiedAkima: need at least 2 knots");
  }

  // ── 1. Finite differences between adjacent knots ──────────────────────────
  const m = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    m[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  }

  // ── 2. Extend m at boundaries with 2 phantom points each side ─────────────
  //  Standard Akima extension: reflect differences across the boundary.
  const mExt = new Float64Array(n + 3); // indices [0..n+2], interior [2..n]
  mExt[2] = m[0];
  for (let i = 1; i < n - 1; i++) {
    mExt[i + 2] = m[i];
  }
  mExt[n] = m[n - 2];

  // Phantom points: each extra slope is mirrored once more.
  mExt[0] = 2 * mExt[2] - mExt[4]; // m[-2]
  mExt[1] = 2 * mExt[2] - mExt[3]; // m[-1]
  mExt[n + 1] = 2 * mExt[n] - mExt[n - 1]; // m[n]
  mExt[n + 2] = 2 * mExt[n] - mExt[n - 2]; // m[n+1]

  // ── 3. Modified Akima weights and slopes ──────────────────────────────────
  const slopes = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const base = i + 2; // mExt index for m[i-1..i+2]
    const mm1 = mExt[base - 2];
    const m0 = mExt[base - 1];
    const m1 = mExt[base];
    const m2 = mExt[base + 1];

    // Modified weights: |Δm| + 0.5 * |mean of adjacent pair|
    const w1 = Math.abs(m1 - m0) + 0.5 * Math.abs(m1 + m0);
    const w2 = Math.abs(m2 - m1) + 0.5 * Math.abs(m2 + m1);
    // Also need w0, w3 for the other pair ... but the standard makima formula
    // weights t_i by (|m[i+1]-m[i]| + modifier) and t_{i-1} by the same
    // with the previous pair.  Concretely:
    const wa = Math.abs(m0 - mm1) + 0.5 * Math.abs(m0 + mm1);
    const wb = Math.abs(m1 - m0) + 0.5 * Math.abs(m1 + m0);

    const denomFwd = w1 + w2;
    const denomBwd = wa + wb;

    let tFwd: number;
    if (denomFwd < 1e-15) {
      tFwd = (m0 + m1) * 0.5;
    } else {
      tFwd = (w2 * m0 + w1 * m1) / denomFwd;
    }

    let tBwd: number;
    if (denomBwd < 1e-15) {
      tBwd = (mm1 + m0) * 0.5;
    } else {
      tBwd = (wb * mm1 + wa * m0) / denomBwd;
    }

    // The node slope uses the forward-looking pair (standard makima)
    slopes[i] = denomFwd < 1e-15 ? tFwd : tFwd;
    // Prefer the average of forward and backward for interior nodes to
    // match MATLAB's makima behaviour more closely.
    if (i > 0 && i < n - 1) {
      slopes[i] = denomFwd < 1e-15 ? tBwd : tFwd;
    } else if (i === 0) {
      slopes[i] = tFwd;
    } else {
      slopes[i] = tBwd;
    }
  }

  // ── 4. Hermite coefficients for each interval ─────────────────────────────
  // Each interval [xs[k], xs[k+1]] is a cubic Hermite polynomial with
  //   p(0)=ys[k], p(1)=ys[k+1], p'(0)=slopes[k]*h, p'(1)=slopes[k+1]*h
  // where h = xs[k+1] - xs[k].
  // Evaluating via: p(t) = (2t³-3t²+1)*y0 + (t³-2t²+t)*s0*h
  //                      + (-2t³+3t²)*y1  + (t³-t²)*s1*h,  t in [0,1]

  return {
    evaluate(x: number): number {
      if (x <= xs[0]) {
        return ys[0];
      }
      if (x >= xs[n - 1]) {
        return ys[n - 1];
      }

      // Binary search for the knot interval.
      let lo = 0;
      let hi = n - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (xs[mid] <= x) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      const k = lo;
      const h = xs[k + 1] - xs[k];
      const t = (x - xs[k]) / h;
      const t2 = t * t;
      const t3 = t2 * t;

      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      return (
        h00 * ys[k] +
        h10 * slopes[k] * h +
        h01 * ys[k + 1] +
        h11 * slopes[k + 1] * h
      );
    },
  };
}

/**
 * Convenience: resample `srcValues` (sampled at `srcXs`) onto `dstXs` using
 * Modified Akima interpolation.  `srcXs` must be strictly increasing.
 *
 * @param srcXs     Source x-coordinates (strictly increasing).
 * @param srcValues Source y-values.
 * @param dstXs     Target x-coordinates (any order, clamped to source range).
 * @returns         Interpolated values at each dstXs position.
 */
export function akimaResample(
  srcXs: ArrayLike<number>,
  srcValues: ArrayLike<number>,
  dstXs: ArrayLike<number>,
): Float32Array {
  const out = new Float32Array(dstXs.length);
  akimaResampleInto(srcXs, srcValues, dstXs, out);
  return out;
}

/**
 * Allocation-reduced variant for per-frame (RAF) callers: writes interpolated
 * values into `out` (length ≥ dstXs.length) instead of allocating a result.
 */
export function akimaResampleInto(
  srcXs: ArrayLike<number>,
  srcValues: ArrayLike<number>,
  dstXs: ArrayLike<number>,
  out: Float32Array,
): void {
  const interp = buildModifiedAkima(srcXs, srcValues);
  for (let i = 0; i < dstXs.length; i++) {
    out[i] = interp.evaluate(dstXs[i]);
  }
}
