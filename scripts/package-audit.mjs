/** Inspect the actual ZIP directory without extracting or adding dependencies. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const args = process.argv.slice(2);
if (!args[0]) {
  const pkg = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  args.push(`${pkg.name}-${pkg.version}.vsix`);
}
const archive = fs.readFileSync(args[0]);
let end = archive.length - 22;
const lowerBound = Math.max(0, archive.length - 65557);
while (end >= lowerBound && archive.readUInt32LE(end) !== 0x06054b50) {
  end--;
}
assert.ok(end >= lowerBound, "Missing ZIP directory");
const count = archive.readUInt16LE(end + 10),
  offset = archive.readUInt32LE(end + 16);
assert.notEqual(count, 65535, "ZIP64 packages are unsupported");
let position = offset;
const files = [];
for (let i = 0; i < count; i++) {
  assert.equal(archive.readUInt32LE(position), 0x02014b50);
  const nameSize = archive.readUInt16LE(position + 28);
  const name = archive.toString(
    "utf8",
    position + 46,
    position + 46 + nameSize,
  );
  files.push({
    path: name,
    compressedBytes: archive.readUInt32LE(position + 20),
    installedBytes: archive.readUInt32LE(position + 24),
  });
  position +=
    46 +
    nameSize +
    archive.readUInt16LE(position + 30) +
    archive.readUInt16LE(position + 32);
}
for (const file of files) {
  assert.ok(
    !/^extension\/(?:node_modules|src|scripts|bench|assets|artifacts|canvases|doc|docs|\.tasks|\.cross-gan|\.github)\//.test(
      file.path,
    ),
    `Development asset shipped: ${file.path}`,
  );
  assert.ok(!/\.map$/.test(file.path), `Source map shipped: ${file.path}`);
  assert.ok(
    !/opus-ml/.test(file.path),
    "Unused Opus enhancement model shipped",
  );
}
for (const entry of [
  "package.json",
  "readme.md",
  "README.zh-CN.md",
  "ear_audio.png",
  "dist/extension.js",
  "dist/audioPreview.js",
  "dist/comparison.js",
  "dist/comparisonWorker.js",
  "dist/sequenceWorker.js",
  "dist/essentia-wasm.web.wasm",
  "dist/aacDecoderWorker.js",
  "dist/comparisonLoudnessWorker.js",
  "dist/loudness.worklet.js",
  "dist/web/extension.js",
  "third-party/aac/NOTICE.txt",
  "third-party/aac/ics.js",
  "third-party/aac/LGPL-3.0.txt",
  "third-party/aac/GPL-3.0.txt",
  "third-party/aac/aac-0.1.3.tgz",
  "third-party/aac/av-0.4.9.tgz",
]) {
  assert.ok(
    files.some((f) => f.path === `extension/${entry}`),
    `Missing runtime entry: ${entry}`,
  );
}
const report = {
  package: path.basename(args[0]),
  archiveBytes: archive.length,
  installedBytes: files.reduce((sum, f) => sum + f.installedBytes, 0),
  fileCount: files.length,
  files: files.sort((a, b) => b.compressedBytes - a.compressedBytes),
};
const saveIndex = args.indexOf("--save");
if (saveIndex >= 0) {
  assert.ok(args[saveIndex + 1], "Missing report path");
  fs.mkdirSync(path.dirname(args[saveIndex + 1]), { recursive: true });
  fs.writeFileSync(args[saveIndex + 1], JSON.stringify(report, null, 2) + "\n");
}
console.log(
  `${report.fileCount} files; ${(report.archiveBytes / 1048576).toFixed(2)} MiB download; ${(report.installedBytes / 1048576).toFixed(2)} MiB installed. Package contents passed.`,
);
