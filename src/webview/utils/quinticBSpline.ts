/**
 * Uniform quintic B-spline smoothing kernel.
 *
 * Treating the input array as B-spline control points, the curve evaluated at
 * the corresponding parameter positions is a linear combination of the five
 * nearest neighbours.  The weights come from evaluating the degree-5 uniform
 * B-spline basis B₅(t) = (b₋₂+b₋₁+b₀+b₁+b₂) at integer positions, giving
 * the symmetric 5-point kernel:
 *
 *   w = [1, 26, 66, 26, 1] / 120
 *
 * Derivation (Cox–de Boor, uniform knots):
 *   B₅(0) = 66/120, B₅(±1) = 26/120, B₅(±2) = 1/120, B₅(±k≥3) = 0.
 *
 * This equals a convolution with the above kernel — O(N) work.
 * For the spectrum visualizer the kernel provides gentle smoothing without
 * introducing per-frame interpolation complexity.
 *
 * Reference: Piegl & Tiller, "The NURBS Book", 2nd ed., §2.1.
 */

/** Symmetric 5-point uniform quintic B-spline kernel, sums to 1. */
const w0 = 66 / 120;
const w1 = 26 / 120;
const w2 =  1 / 120;

/**
 * Smooth an array of values with the uniform quintic B-spline kernel.
 *
 * Boundary values are handled by clamping (edge values are repeated),
 * so the output has the same length as the input.
 *
 * @param data  Input values (will not be mutated).
 * @returns     Smoothed values, same length as input.
 */
export function quinticBSplineSmooth(data: Float32Array | number[]): Float32Array {
  const n = data.length;
  if (n === 0) {return new Float32Array(0);}

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Clamp indices to [0, n-1] for boundary handling.
    const i0 = Math.max(0, i - 2);
    const i1 = Math.max(0, i - 1);
    const i2 = i;
    const i3 = Math.min(n - 1, i + 1);
    const i4 = Math.min(n - 1, i + 2);

    out[i] = w2 * data[i0] + w1 * data[i1] + w0 * data[i2] + w1 * data[i3] + w2 * data[i4];
  }
  return out;
}
