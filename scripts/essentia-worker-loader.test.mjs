import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const loader = require("./essentia-worker-loader.cjs");
const source = fs.readFileSync(
  new URL(
    "../node_modules/essentia.js/dist/essentia-wasm.web.js",
    import.meta.url,
  ),
  "utf8",
);
test("pinned worker runtime has no dynamic code generation and compiles under CSP", () => {
  const result = loader(source);
  assert.ok(result.includes("ENVIRONMENT_IS_WORKER=true"));
  assert.ok(!/new Function|new_\(Function/.test(result));
  const context = vm.createContext(
    { module: { exports: {} }, exports: {} },
    { codeGeneration: { strings: false, wasm: true } },
  );
  vm.runInContext(result, context);
  assert.equal(typeof context.module.exports, "function");
});
test("changed runtime refuses unreviewed binding adaptation", () => {
  assert.throws(() => loader(source + "\n"), /runtime changed/);
});
test("CSP-safe runtime initializes real WASM and executes bound DSP", async () => {
  const context = vm.createContext(
    {
      module: { exports: {} },
      exports: {},
      self: { location: { href: "blob:worker" } },
      console,
      setTimeout,
      clearTimeout,
      importScripts() {},
    },
    { codeGeneration: { strings: false, wasm: true } },
  );
  vm.runInContext(loader(source), context);
  const wasmBinary = fs.readFileSync(
    new URL(
      "../node_modules/essentia.js/dist/essentia-wasm.web.wasm",
      import.meta.url,
    ),
  );
  const wasm = await context.module.exports({ wasmBinary });
  const Essentia = require("essentia.js/dist/essentia.js-core.umd.js");
  const essentia = new Essentia(wasm);
  const samples = Float32Array.from({ length: 2048 }, (_, i) =>
    Math.sin((2 * Math.PI * 440 * i) / 44100),
  );
  const input = essentia.arrayToVector(samples);
  const windowed = essentia.Windowing(input).frame;
  const spectrum = essentia.Spectrum(windowed).spectrum;
  try {
    assert.ok(
      Math.abs(
        essentia.PitchYinFFT(spectrum, 2048, true, 22050, 20, 44100).pitch -
          440,
      ) < 5,
    );
  } finally {
    spectrum.delete();
    windowed.delete();
    input.delete();
  }
});
