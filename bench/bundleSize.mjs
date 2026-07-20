/**
 * Bundle-size measurement: raw + gzip size of every dist/ artifact and the
 * newest .vsix in the workspace root. Merges results into a bench JSON
 * (key "bundle") so DSP and size metrics live in one baseline file.
 *
 * Usage:
 *   node bench/bundleSize.mjs                       # print table
 *   node bench/bundleSize.mjs --save bench/baseline.json
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const root = process.cwd();
const distDir = path.join(root, "dist");

function walk(dir, base = "") {
  const out = [];
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(abs, rel));
    } else if (entry.isFile()) {
      out.push({ rel, abs });
    }
  }
  return out;
}

function measure() {
  const files = {};
  let distTotalRaw = 0;
  let distTotalGzip = 0;
  for (const { rel, abs } of walk(distDir)) {
    // Source maps never ship in the .vsix (.vscodeignore excludes **/*.map).
    if (rel.endsWith(".map")) {
      continue;
    }
    const buf = fs.readFileSync(abs);
    const gz = zlib.gzipSync(buf, { level: 9 }).length;
    files[rel] = { raw: buf.length, gzip: gz };
    distTotalRaw += buf.length;
    distTotalGzip += gz;
  }

  let vsix = null;
  const vsixFiles = fs
    .readdirSync(root)
    .filter((f) => f.endsWith(".vsix"))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(root, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (vsixFiles.length > 0) {
    const name = vsixFiles[0].name;
    vsix = { name, size: fs.statSync(path.join(root, name)).size };
  }

  return { files, distTotalRaw, distTotalGzip, vsix };
}

function fmt(n) {
  return `${(n / 1024).toFixed(1)} KiB`;
}

function main() {
  const args = process.argv.slice(2);
  const saveIdx = args.indexOf("--save");
  const savePath = saveIdx >= 0 ? args[saveIdx + 1] : null;

  const bundle = measure();
  for (const [rel, { raw, gzip }] of Object.entries(bundle.files)) {
    console.log(`${rel.padEnd(40)} raw ${fmt(raw).padStart(11)}  gzip ${fmt(gzip).padStart(11)}`);
  }
  console.log(`${"dist total".padEnd(40)} raw ${fmt(bundle.distTotalRaw).padStart(11)}  gzip ${fmt(bundle.distTotalGzip).padStart(11)}`);
  if (bundle.vsix) {
    console.log(`vsix ${bundle.vsix.name}: ${fmt(bundle.vsix.size)}`);
  } else {
    console.log("vsix: (none found)");
  }

  if (savePath) {
    const abs = path.resolve(root, savePath);
    let existing = {};
    if (fs.existsSync(abs)) {
      try {
        existing = JSON.parse(fs.readFileSync(abs, "utf8"));
      } catch {
        existing = {};
      }
    }
    const merged = { ...existing, bundle };
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(merged, null, 2) + "\n");
    console.log(`\nsaved: ${savePath}`);
  }
}

main();
