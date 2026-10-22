/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-var-requires */
import { computeHarmonicFeatures } from "../../shared/harmonicFeatureCompute";
import {
  computeSequenceFeatures,
  profileToWire,
} from "../../shared/sequenceFeatureCompute";
import type { EssentiaInstance } from "../../shared/essentiaTypes";
// Use the asynchronous browser build, never the synchronous Node/asm.js runtime.
const createWasm =
  require("essentia.js/dist/essentia-wasm.web.js") as (options: {
    wasmBinary: ArrayBuffer;
  }) => Promise<unknown>;
const Essentia = require("essentia.js/dist/essentia.js-core.umd.js") as new (
  wasm: unknown,
) => EssentiaInstance;
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (message: unknown) => void;
};
scope.onmessage = async (event) => {
  try {
    const { samples, sampleRate, hopSec, wasmUri, harmonic } = event.data;
    const response = await fetch(wasmUri);
    if (!response.ok) {
      throw new Error(`Cannot load analysis WASM: ${response.status}`);
    }
    const wasm = await createWasm({ wasmBinary: await response.arrayBuffer() });
    const essentia = new Essentia(wasm);
    const profile = await computeSequenceFeatures(
      essentia,
      new Float32Array(samples),
      sampleRate,
      hopSec,
      (percent) => scope.postMessage({ kind: "progress", percent }),
    );
    if (harmonic) {
      profile.harmonic = await computeHarmonicFeatures(
        essentia,
        new Float32Array(samples),
        sampleRate,
      );
    }
    scope.postMessage({ kind: "result", profile: profileToWire(profile) });
  } catch (error) {
    scope.postMessage({
      kind: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
