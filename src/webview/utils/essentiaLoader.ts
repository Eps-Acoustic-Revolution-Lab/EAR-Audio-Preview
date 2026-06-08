/**
 * Lazy loader for essentia.js in the VS Code webview.
 *
 * The package root (`essentia.js`) re-exports synchronous UMD builds which can
 * fail once webpack bundles them for the webview. Prefer explicit ES module
 * imports; fall back to the async `essentia-wasm.web.js` factory with a
 * webview-hosted `.wasm` URI (see extension CONFIG).
 */

/* eslint-disable @typescript-eslint/naming-convention */
export type EssentiaInstance = {
  arrayToVector(arr: Float32Array): unknown;
  vectorToArray(vec: unknown): Float32Array;
  Windowing(
    frame: unknown,
    normalized?: boolean,
    size?: number,
    type?: string,
    zeroPadding?: number,
    zeroPhase?: boolean,
  ): { frame: unknown };
  Spectrum(frame: unknown, size?: number): { spectrum: unknown };
  PitchYinFFT(
    spectrum: unknown,
    frameSize?: number,
    interpolate?: boolean,
    maxFrequency?: number,
    minFrequency?: number,
    sampleRate?: number,
    tolerance?: number,
  ): { pitch: number; pitchConfidence: number };
  Flux(
    spectrum: unknown,
    halfRectify?: boolean,
    norm?: string,
  ): { flux: number };
  LoudnessEBUR128(
    left: unknown,
    right: unknown,
    hopSize?: number,
    sampleRate?: number,
    startAtZero?: boolean,
  ): {
    momentaryLoudness: unknown;
    shortTermLoudness: unknown;
    integratedLoudness: number;
    loudnessRange: number;
  };
  delete(): void;
  shutdown(): void;
  version?: string;
};
/* eslint-enable @typescript-eslint/naming-convention */

let _instance: EssentiaInstance | null = null;
let _loading: Promise<EssentiaInstance | null> | null = null;
let _wasmUri: string | null = null;
let _warned = false;

export function setEssentiaWasmUri(uri: string): void {
  _wasmUri = uri;
}

export function getEssentiaWasmUri(): string | null {
  return _wasmUri;
}

function warnOnce(message: string, err?: unknown): void {
  if (_warned) {
    return;
  }
  _warned = true;
  const detail =
    err instanceof Error
      ? err.message
      : err !== null && err !== undefined
        ? String(err)
        : "";
  console.warn(
    `[essentia.js] ${message}${detail ? `: ${detail}` : ""}`,
    err ?? "",
  );
}

function resolveEssentiaCtor(
  mod: unknown,
): (new (wasm: unknown) => EssentiaInstance) | null {
  if (!mod || typeof mod !== "object") {
    return null;
  }
  const rec = mod as Record<string, unknown>;
  const ctor = rec.default ?? rec.Essentia;
  return typeof ctor === "function"
    ? (ctor as new (wasm: unknown) => EssentiaInstance)
    : null;
}

function resolveWasmModule(mod: unknown): unknown {
  if (!mod || typeof mod !== "object") {
    return null;
  }
  const rec = mod as Record<string, unknown>;
  return rec.EssentiaWASM ?? rec.default ?? null;
}

/** ES module path — sync WASM embedded, works with webpack (recommended). */
async function loadViaEsModules(): Promise<EssentiaInstance | null> {
  const [coreMod, wasmMod] = await Promise.all([
    import(
      /* webpackChunkName: "essentia-core" */
      "essentia.js/dist/essentia.js-core.es.js"
    ),
    import(
      /* webpackChunkName: "essentia-wasm" */
      "essentia.js/dist/essentia-wasm.es.js"
    ),
  ]);
  const essentiaCtor = resolveEssentiaCtor(coreMod);
  const wasm = resolveWasmModule(wasmMod);
  if (!essentiaCtor || !wasm) {
    throw new Error("Essentia or EssentiaWASM export missing from ES modules");
  }
  return new essentiaCtor(wasm);
}

/** Async web loader — needs hosted `essentia-wasm.web.wasm` in the webview. */
async function loadViaWebFactory(): Promise<EssentiaInstance | null> {
  if (typeof document === "undefined") {
    return null;
  }
  const [webMod, coreMod] = await Promise.all([
    import(
      /* webpackChunkName: "essentia-wasm-web" */
      "essentia.js/dist/essentia-wasm.web.js"
    ),
    import("essentia.js/dist/essentia.js-core.es.js"),
  ]);
  const factory = webMod.default ?? webMod.EssentiaWASM;
  if (typeof factory !== "function") {
    throw new Error("essentia-wasm.web.js did not export EssentiaWASM factory");
  }
  const essentiaCtor = resolveEssentiaCtor(coreMod);
  if (!essentiaCtor) {
    throw new Error("Essentia core export missing");
  }

  const moduleOverrides =
    _wasmUri !== null && _wasmUri !== undefined
      ? {
          locateFile: () => _wasmUri as string,
        }
      : undefined;

  const wasmModule = await factory(moduleOverrides);
  return new essentiaCtor(wasmModule);
}

/** Package index — Node / tests. */
async function loadViaPackageIndex(): Promise<EssentiaInstance | null> {
  const pkg = await import("essentia.js");
  const essentiaCtor = resolveEssentiaCtor(pkg);
  const wasm = resolveWasmModule(pkg);
  if (!essentiaCtor || !wasm) {
    throw new Error(
      "Essentia or EssentiaWASM export missing from package index",
    );
  }
  return new essentiaCtor(wasm);
}

async function tryLoadEssentia(): Promise<EssentiaInstance | null> {
  const strategies: Array<{
    name: string;
    run: () => Promise<EssentiaInstance | null>;
  }> = [
    { name: "ES modules", run: loadViaEsModules },
    { name: "web factory", run: loadViaWebFactory },
    { name: "package index", run: loadViaPackageIndex },
  ];

  const errors: string[] = [];
  for (const { name, run } of strategies) {
    try {
      const instance = await run();
      if (instance) {
        return instance;
      }
    } catch (err) {
      errors.push(
        `${name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  warnOnce("All load strategies failed", errors.join(" | "));
  return null;
}

export async function loadEssentia(): Promise<EssentiaInstance | null> {
  if (_instance) {
    return _instance;
  }
  if (!_loading) {
    _loading = tryLoadEssentia()
      .then((inst) => {
        _instance = inst;
        return inst;
      })
      .finally(() => {
        _loading = null;
      });
  }
  return _loading;
}

export function isEssentiaLoaded(): boolean {
  return _instance !== null;
}

export function resetEssentiaLoaderForTests(): void {
  if (_instance) {
    try {
      _instance.shutdown();
    } catch {
      /* ignore */
    }
    try {
      _instance.delete();
    } catch {
      /* ignore */
    }
  }
  _instance = null;
  _loading = null;
  _wasmUri = null;
  _warned = false;
}
