import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
const require = createRequire(import.meta.url);
const {
  extractLoudnessWorkletSource,
  writeLoudnessWorkletAssets,
  supportedVersion,
} = require("./loudness-worklet-source.cjs");
const root = fileURLToPath(new URL("../", import.meta.url));
const processor =
  'class Meter extends AudioWorkletProcessor {}\nregisterProcessor("loudness-processor", Meter);';
const bundle = (body = processor) =>
  `const arbitraryRenamedVariable = ${JSON.stringify(body)};`;

test("pinned bundle produces byte-identical processor output", () => {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(root, "node_modules/loudness-worklet/package.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.version, supportedVersion);
  const source = fs.readFileSync(
    path.join(root, "node_modules/loudness-worklet/packages/lib/dist/index.js"),
    "utf8",
  );
  const start = source.indexOf("const i = `") + "const i = `".length;
  const expected = source.slice(
    start,
    source.indexOf('`, t = "loudness-processor"', start),
  );
  assert.ok(expected.length > 10000);
  assert.equal(
    extractLoudnessWorkletSource(source, manifest.version),
    expected,
  );
  assert.equal(
    extractLoudnessWorkletSource(
      source.replace("const i = `", "const renamedProcessor = `"),
      manifest.version,
    ),
    expected,
  );
});

test("extracts string and template sources without relying on variable names", () => {
  assert.equal(
    extractLoudnessWorkletSource(bundle(), supportedVersion),
    processor,
  );
  assert.equal(
    extractLoudnessWorkletSource(
      `const renamed = \`${processor}\`;`,
      supportedVersion,
    ),
    processor,
  );
});

test("rejects unsupported, absent, ambiguous and invalid processor sources", () => {
  assert.throws(
    () => extractLoudnessWorkletSource(bundle(), "1.7.0"),
    /Unsupported/,
  );
  assert.throws(
    () => extractLoudnessWorkletSource("const x = 3;", supportedVersion),
    /found 0/,
  );
  assert.throws(
    () =>
      extractLoudnessWorkletSource(
        bundle() + bundle().replace("arbitraryRenamedVariable", "second"),
        supportedVersion,
      ),
    /found 2/,
  );
  assert.throws(
    () =>
      extractLoudnessWorkletSource("const x = `unterminated", supportedVersion),
    /Invalid/,
  );
  assert.throws(
    () =>
      extractLoudnessWorkletSource(
        bundle(processor + "\nconst ="),
        supportedVersion,
      ),
    /Invalid/,
  );
  assert.throws(
    () =>
      extractLoudnessWorkletSource(
        bundle(processor.replace(", Meter", ", Missing")),
        supportedVersion,
      ),
    /registration/,
  );
  assert.throws(
    () =>
      extractLoudnessWorkletSource(
        bundle(processor.replace("loudness-processor", "another-processor")),
        supportedVersion,
      ),
    /registration/,
  );
});

test("asset emission fails without dependency and removes stale outputs", () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "ear-worklet-contract-"),
  );
  try {
    const dist = path.join(temporary, "dist");
    fs.mkdirSync(dist);
    for (const name of ["loudness.worklet.js", "comparisonLoudnessWorker.js"])
      fs.writeFileSync(path.join(dist, name), "stale");
    assert.throws(() => writeLoudnessWorkletAssets(temporary), /ENOENT/);
    assert.deepEqual(fs.readdirSync(dist), []);
    const dependency = path.join(
      temporary,
      "node_modules/loudness-worklet/packages/lib/dist",
    );
    fs.mkdirSync(dependency, { recursive: true });
    fs.writeFileSync(
      path.join(temporary, "node_modules/loudness-worklet/package.json"),
      JSON.stringify({ name: "loudness-worklet", version: supportedVersion }),
    );
    fs.writeFileSync(path.join(dependency, "index.js"), bundle());
    const comparison = path.join(temporary, "src/webview/comparison");
    fs.mkdirSync(comparison, { recursive: true });
    fs.writeFileSync(
      path.join(comparison, "loudnessWorkerPrelude.js"),
      "prelude",
    );
    fs.writeFileSync(
      path.join(comparison, "loudnessWorkerAdapter.js"),
      "adapter",
    );
    const wasmDirectory = path.join(temporary, "node_modules/essentia.js/dist");
    fs.mkdirSync(wasmDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(wasmDirectory, "essentia-wasm.web.wasm"),
      "wasm",
    );
    writeLoudnessWorkletAssets(temporary);
    assert.equal(
      fs.readFileSync(path.join(dist, "loudness.worklet.js"), "utf8"),
      processor,
    );
    assert.equal(
      fs.readFileSync(path.join(dist, "comparisonLoudnessWorker.js"), "utf8"),
      `prelude\n${processor}\nadapter`,
    );
    fs.writeFileSync(path.join(dependency, "index.js"), "const absent = 1;");
    assert.throws(() => writeLoudnessWorkletAssets(temporary), /found 0/);
    assert.deepEqual(fs.readdirSync(dist), []);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
