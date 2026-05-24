/** Lazy loader for ebur128-wasm (webpack bundles it as an async WASM module). */

type TruePeakMonoFn = (sampleRate: number, samples: Float32Array) => number;
type TruePeakStereoFn = (
  sampleRate: number,
  left: Float32Array,
  right: Float32Array,
) => number;

interface Ebur128Api {
  truePeakMono: TruePeakMonoFn;
  truePeakStereo: TruePeakStereoFn;
}

let _api: Ebur128Api | null = null;
let _loading: Promise<void> | null = null;
let _warnedUnavailable = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function warnUnavailable(reason: string, mod?: unknown): void {
  if (_warnedUnavailable) {
    return;
  }
  _warnedUnavailable = true;
  const keys = isRecord(mod) ? Object.keys(mod).join(", ") : typeof mod;
  console.warn(
    `[ebur128-wasm] True Peak functions are unavailable: ${reason}. Module keys: ${keys}`,
  );
}

/**
 * Normalize bundler/runtime-specific import shapes.
 *
 * Webpack async WASM can expose the package exports at the top level, under a
 * default export, or behind another default wrapper depending on transform
 * order. Only cache a shape after verifying the callable functions exist.
 */
export function resolveEbur128Api(mod: unknown): Ebur128Api | null {
  const candidates: unknown[] = [mod];
  if (isRecord(mod)) {
    candidates.push(mod.default);
    if (isRecord(mod.default)) {
      candidates.push(mod.default.default);
    }
  }

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }
    const mono = candidate["ebur128_true_peak_mono"];
    const stereo = candidate["ebur128_true_peak_stereo"];
    if (typeof mono === "function" && typeof stereo === "function") {
      return {
        truePeakMono: mono as TruePeakMonoFn,
        truePeakStereo: stereo as TruePeakStereoFn,
      };
    }
  }

  return null;
}

export async function ensureEbur128Loaded(): Promise<void> {
  if (_api) {
    return;
  }
  if (!_loading) {
    _loading = import("ebur128-wasm")
      .then((mod) => {
        _api = resolveEbur128Api(mod);
        if (!_api) {
          warnUnavailable("missing expected exports", mod);
        }
      })
      .catch((err) => {
        warnUnavailable(err instanceof Error ? err.message : String(err));
      });
  }
  await _loading;
}

export function isEbur128Available(): boolean {
  return _api !== null;
}

export const isEbur128Loaded = isEbur128Available;

export function resetEbur128LoaderForTests(): void {
  _api = null;
  _loading = null;
  _warnedUnavailable = false;
}

export function ebur128TruePeakMono(
  sampleRate: number,
  samples: Float32Array,
): number {
  if (!_api) {
    warnUnavailable("called before successful load");
    return NaN;
  }
  return _api.truePeakMono(sampleRate, samples);
}

export function ebur128TruePeakStereo(
  sampleRate: number,
  left: Float32Array,
  right: Float32Array,
): number {
  if (!_api) {
    warnUnavailable("called before successful load");
    return NaN;
  }
  return _api.truePeakStereo(sampleRate, left, right);
}
