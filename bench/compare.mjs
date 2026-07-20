/**
 * Compare a current bench JSON against the locked baseline.
 *
 * Gates (exit 1 on violation):
 *   - DSP: current meanMs > baseline meanMs * 1.10 + 0.0005 ms
 *     (speed regression >10%, with an absolute 0.5 µs slack so sub-µs cases
 *     are not failed by timer-resolution jitter)
 *   - Bundle: dist gzip total or .vsix size grows   > baseline * 1.01 (+1%)
 * Removed bundle files / bench cases are reported as info, never failures.
 *
 * Usage:
 *   node bench/compare.mjs [baseline.json] [current.json]
 *   (defaults: bench/baseline.json bench/current.json)
 */
import * as fs from "node:fs";
import * as path from "node:path";

const SPEED_TOLERANCE = 1.1;
const SPEED_ABS_SLACK_MS = 0.0005;
const SIZE_TOLERANCE = 1.01;

const args = process.argv.slice(2);
const basePath = path.resolve(process.cwd(), args[0] ?? "bench/baseline.json");
const curPath = path.resolve(process.cwd(), args[1] ?? "bench/current.json");

function load(p) {
  if (!fs.existsSync(p)) {
    console.error(`compare: missing file ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const base = load(basePath);
const cur = load(curPath);
let failures = 0;

// ── DSP speed gates ──────────────────────────────────────────────
if (base.dsp && cur.dsp) {
  for (const [name, b] of Object.entries(base.dsp)) {
    const c = cur.dsp[name];
    if (!c) {
      console.log(`[info] dsp case removed: ${name}`);
      continue;
    }
    const ratio = c.meanMs / b.meanMs;
    const line = `${name.padEnd(36)} ${b.meanMs.toFixed(4)} → ${c.meanMs.toFixed(4)} ms (${(ratio * 100).toFixed(1)}%)`;
    if (c.meanMs > b.meanMs * SPEED_TOLERANCE + SPEED_ABS_SLACK_MS) {
      console.error(`[FAIL] ${line}`);
      failures++;
    } else {
      console.log(`[ ok ] ${line}`);
    }
  }
}

// ── Bundle size gates ────────────────────────────────────────────
if (base.bundle && cur.bundle) {
  const pairs = [
    ["dist gzip total", base.bundle.distTotalGzip, cur.bundle.distTotalGzip],
    ["dist raw total", base.bundle.distTotalRaw, cur.bundle.distTotalRaw],
  ];
  if (base.bundle.vsix && cur.bundle.vsix) {
    pairs.push(["vsix size", base.bundle.vsix.size, cur.bundle.vsix.size]);
  }
  for (const [label, b, c] of pairs) {
    const ratio = c / b;
    const line = `${label.padEnd(36)} ${(b / 1024).toFixed(1)} → ${(c / 1024).toFixed(1)} KiB (${(ratio * 100).toFixed(1)}%)`;
    if (ratio > SIZE_TOLERANCE) {
      console.error(`[FAIL] ${line}`);
      failures++;
    } else {
      console.log(`[ ok ] ${line}`);
    }
  }
  for (const rel of Object.keys(base.bundle.files ?? {})) {
    if (!(rel in (cur.bundle.files ?? {}))) {
      console.log(`[info] dist file removed: ${rel}`);
    }
  }
  for (const rel of Object.keys(cur.bundle.files ?? {})) {
    if (!(rel in (base.bundle.files ?? {}))) {
      console.log(`[info] dist file added: ${rel}`);
    }
  }
}

if (failures > 0) {
  console.error(`\ncompare: ${failures} gate violation(s)`);
  process.exit(1);
}
console.log("\ncompare: all gates passed");
