"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const supportedVersion = "1.6.9";

function parse(source, filename) {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  if (file.parseDiagnostics.length) {
    throw new Error(`Invalid loudness-worklet JavaScript in ${filename}`);
  }
  return file;
}

function validateProcessor(body) {
  const file = parse(body, "loudness.worklet.js");
  const processors = new Set();
  const registrations = [];
  function visit(node) {
    if (
      ts.isClassDeclaration(node) &&
      node.name &&
      node.heritageClauses?.some(
        (clause) =>
          clause.token === ts.SyntaxKind.ExtendsKeyword &&
          clause.types.some(
            (type) =>
              ts.isIdentifier(type.expression) &&
              type.expression.text === "AudioWorkletProcessor",
          ),
      )
    ) {
      processors.add(node.name.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "registerProcessor"
    ) {
      registrations.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  const registration = registrations[0];
  if (
    registrations.length !== 1 ||
    registration.arguments.length !== 2 ||
    !ts.isStringLiteral(registration.arguments[0]) ||
    registration.arguments[0].text !== "loudness-processor" ||
    !ts.isIdentifier(registration.arguments[1]) ||
    !processors.has(registration.arguments[1].text)
  ) {
    throw new Error("Invalid loudness-worklet processor registration or class");
  }
}

function extractLoudnessWorkletSource(source, version) {
  if (version !== supportedVersion) {
    throw new Error(
      `Unsupported loudness-worklet version ${version}; expected ${supportedVersion}`,
    );
  }
  const file = parse(source, "loudness-worklet bundle");
  const candidates = [];
  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      node.text.includes("registerProcessor") &&
      node.text.includes("AudioWorkletProcessor")
    ) {
      validateProcessor(node.text);
      // Preserve the established processor bytes for the pinned template bundle.
      const raw = source.slice(node.getStart(file) + 1, node.end - 1);
      const body =
        ts.isNoSubstitutionTemplateLiteral(node) && raw === node.text
          ? raw
          : node.text;
      candidates.push(body);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one loudness-worklet processor source; found ${candidates.length}`,
    );
  }
  return candidates[0];
}

function writeLoudnessWorkletAssets(root) {
  const outputs = [
    "loudness.worklet.js",
    "comparisonLoudnessWorker.js",
    "essentia-wasm.web.wasm",
  ].map((name) => path.join(root, "dist", name));
  // A failed extraction must never leave a previous successful processor behind.
  outputs.forEach((file) => fs.rmSync(file, { force: true }));
  try {
    const packageRoot = path.join(root, "node_modules/loudness-worklet");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    );
    if (manifest.name !== "loudness-worklet")
      throw new Error("Invalid loudness-worklet package manifest");
    const source = fs.readFileSync(
      path.join(packageRoot, "packages/lib/dist/index.js"),
      "utf8",
    );
    const body = extractLoudnessWorkletSource(source, manifest.version);
    const directory = path.join(root, "src/webview/comparison");
    const prelude = fs.readFileSync(
      path.join(directory, "loudnessWorkerPrelude.js"),
      "utf8",
    );
    const adapter = fs.readFileSync(
      path.join(directory, "loudnessWorkerAdapter.js"),
      "utf8",
    );
    fs.mkdirSync(path.join(root, "dist"), { recursive: true });
    fs.copyFileSync(
      path.join(root, "node_modules/essentia.js/dist/essentia-wasm.web.wasm"),
      path.join(root, "dist/essentia-wasm.web.wasm"),
    );
    fs.writeFileSync(outputs[0], body, "utf8");
    fs.writeFileSync(
      outputs[1],
      prelude + "\n" + body + "\n" + adapter,
      "utf8",
    );
  } catch (error) {
    outputs.forEach((file) => fs.rmSync(file, { force: true }));
    throw error;
  }
}

module.exports = {
  extractLoudnessWorkletSource,
  writeLoudnessWorkletAssets,
  supportedVersion,
};
