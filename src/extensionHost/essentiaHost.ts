/* eslint-disable @typescript-eslint/naming-convention */
import type { EssentiaInstance } from "../shared/essentiaTypes";

let _essentia: EssentiaInstance | null = null;
let _loading: Promise<EssentiaInstance | null> | null = null;

export async function loadEssentiaInNode(): Promise<EssentiaInstance | null> {
  if (_essentia) {
    return _essentia;
  }
  if (_loading) {
    return _loading;
  }
  _loading = (async () => {
    try {
      const pkg = await import("essentia.js");
      const Essentia = (
        pkg as {
          Essentia: new (wasm: unknown) => EssentiaInstance;
          EssentiaWASM: unknown;
        }
      ).Essentia;
      const wasm = (pkg as { EssentiaWASM: unknown }).EssentiaWASM;
      _essentia = new Essentia(wasm);
      return _essentia;
    } catch (err) {
      console.warn(
        "[essentiaHost] Essentia load failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    } finally {
      _loading = null;
    }
  })();
  return _loading;
}
