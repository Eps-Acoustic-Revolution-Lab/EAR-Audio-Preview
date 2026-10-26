/** Validate recorded round gates and derive the human-readable checkpoint view. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const checkpoint = read("checkpoint.pre-roadmap.json");
for (const round of checkpoint.rounds) {
  const dir = `round_${round.round}`;
  for (const file of ["findings.json", "refutations.json", "applied.json", "verify.json", "summary.md"]) {
    assert.ok(fs.statSync(path.join(root, dir, file)).size > 0, `${dir}/${file} is empty`);
  }
  const findings = read(`${dir}/findings.json`);
  const refutations = read(`${dir}/refutations.json`);
  const applied = read(`${dir}/applied.json`);
  const verify = read(`${dir}/verify.json`);
  assert.equal(applied.commit, null, "User requested no commits");
  assert.equal(verify.status, "passed");
  for (const fix of applied.fixes) {
    assert.ok(findings.findings.some(f => f.id === fix.id));
    assert.ok(refutations.verdicts.some(v => v.id === fix.id && v.verdict === "CONFIRMED"));
  }
  if (round.status === "dry") {
    assert.equal(findings.findings.length, 0);
    assert.equal(applied.fixes.length, 0);
  }
}
const performance = read("round_2/verify.json").efficiency;
assert.equal(performance.equivalence.byteIdentical, true);
assert.equal(performance.equivalence.frames, 4096);
for (const scenario of performance.acceptedScenarios) {
  assert.ok(scenario.rootSpeedup > 1.05 && scenario.independentSpeedup > 1.05);
}
assert.deepEqual(checkpoint.convergence, { correctness: 1, efficiency: 1, robustness: 1 });
if (checkpoint.prerelease?.status === "complete") {
  const verification = read("round_4/verify.json");
  assert.equal(verification.performance.originalCases, 15);
  assert.equal(verification.performance.originalSpeedAndSizeGates, "passed");
  assert.equal(verification.currentNumerical.energy.byteIdentical, true);
  assert.equal(verification.currentNumerical.energy.cases, 4096);
  assert.equal(verification.currentNumerical.smooth.byteIdentical, true);
  const decisions = read("round_4/refutations.json");
  for (const fix of read("round_4/applied.json").fixes) {
    const reviewers = new Set(decisions.verdicts.filter(v => v.id === fix.id && v.verdict === "CONFIRMED" && v.postFix === "VERIFIED").map(v => v.reviewer));
    assert.ok(reviewers.size >= 2, "Each pre-release fix needs two independent discriminators");
  }
}
if (checkpoint.architectureRefinement?.status === "complete") {
  const verification = read("round_7/verify.json");
  const findings = read("round_7/findings.json").findings;
  const decisions = read("round_7/refutations.json").verdicts;
  assert.equal(findings.length, 7);
  assert.equal(verification.tests.newRegressions,
    verification.tests.passed - verification.baseline.passed);
  assert.equal(verification.beforeFixFailures.existingAssertionsWeakened, false);
  for (const fix of read("round_7/applied.json").fixes) {
    const author = findings.find(f => f.id === fix.id).author;
    const verified = decisions.filter(v => v.id === fix.id && v.verdict === "CONFIRMED" && v.postFix === "VERIFIED");
    assert.ok(verified.every(v => v.reviewer.split(" ")[0] !== author), "Authors cannot independently approve their own fixes");
    assert.ok(new Set(verified.map(v => v.reviewer)).size >= 2, "Each refinement fix needs two non-author reviews");
    for (const decision of verified) assert.ok(fs.statSync(path.join(root, "round_7", decision.report)).size > 0);
  }
  assert.equal(verification.nativeBrowser.knownLimitation.status, "inherited-first-quantum-transient-recorded");
}
if (checkpoint.localAcceptance?.status === "complete") {
  const verification = read("round_8/verify.json");
  assert.equal(verification.startup.cases, 32);
  assert.equal(verification.startup.failures, 0);
  assert.equal(verification.startup.maximumError, 0);
  assert.equal(verification.native.fixes.length, 7);
  assert.ok(verification.native.fixes.every(f => f.status === "passed"));
  assert.ok(read("round_8/native-integrity.json").entries.every(e => e.installedIdentical && e.currentBuildIdentical));
  assert.equal(verification.package.sha256, read("round_8/native-integrity.json").vsixSha256);
  assert.equal(verification.package.sha256, read("round_8/native-host-integrity.json").vsixSha256);
  const reviewers = new Set(read("round_8/refutations.json").verdicts.filter(v => v.postFix === "VERIFIED").map(v => v.reviewer));
  assert.ok(reviewers.size >= 2);
}
const previousTitles = {
 C1: "Cancel reload reads on removal and release the serial loading queue",
 R1: "Clean up panels closed during initialization and failed initial opens",
 R2: "Settle requests after Worker failure/disposal; cancellation cannot block cleanup",
 C2: "Preserve literal filenames in Loudness hover with DOM text nodes",
 E1: "Cache stable frequency terms without changing numeric evaluation order"
};
const summary = [
  "# Branch review — 2026-10-16",
  "",
  "Generated from checkpoint.json; do not maintain a second manual state record.",
  "",
  `Status: ${checkpoint.status}`,
  `Reviewed branch: ${checkpoint.branch}; review head: ${checkpoint.reviewHead}; base: ${checkpoint.base}.`,
  "",
  "## Accepted changes",
  "",
  ...checkpoint.confirmed.map(f => `- ${f.id}: ${f.title || previousTitles[f.id] || f.status}.`),
  "",
  "## Verification",
  "",
  `${checkpoint.finalTests.suites} test suites passed; ${checkpoint.finalTests.passed} tests passed, ${checkpoint.finalTests.skipped} skipped. TypeScript, lint, format, webpack targets and VSIX packaging passed.`,
  "",
  ...(checkpoint.architectureRefinement?.status === "complete" ? ["Round 7 fixes the seven previously confirmed refinement findings with 56 additional regressions and two non-author reviews per fix. Its initial startup limitation and original failing results remain recorded as historical evidence. See round_7/summary.md and verify.json. This scoped repair does not claim a new whole-repository dry review or performance speedup.", ""] : []),
  ...(checkpoint.localAcceptance?.status === "complete" ? ["Round 8 resolves the inherited first-128-frame transient, confirmed in real-time playback. All 32 complete-frame PCM cases pass with zero measured error. The seven refinement fixes pass targeted acceptance against the final installed VSIX, with all runtime files matching the package. Background native runtime checks do not claim foreground display performance, physical output measurement or subjective listening. See round_8/summary.md and verify.json.", ""] : []),
  "Historical performance evidence: existing single-file gates passed on an uncontended rerun; the initial noise outlier is preserved in round_2. These benchmark figures were not remeasured by the refinement repair.",
  "",
  "The immutable native-rate comparison DSP check covers 4,096 byte-identical frames. Root and independent complete-call throughput results:",
  "",
  ...checkpoint.performance.filter(p => p.claimed).map(p => `- ${p.name}: ${p.rootSpeedup.toFixed(3)}x / ${p.independentSpeedup.toFixed(3)}x.`),
  "",
  "The unweighted 256-bin case is near measurement noise and is not counted as a meaningful speedup. The earlier pre-release follow-up converged dry; round 6 covers the subsequent capacity and measurement additions.",
  "",
  ...(checkpoint.prerelease?.status === "complete" ? ["Pre-release rounds 4–5 accepted four correctness/robustness fixes and converged dry. All 15 unchanged speed/size gates, 373 geometry cases, 132 spline cases and 4,096 strict energy cases passed. No new efficiency rewrite was accepted.", ""] : []),
  checkpoint.boundary,
  "",
  `Local integration: ${checkpoint.integration ? JSON.stringify(checkpoint.integration) : "pending"}. No new commits or pushes.`,
  "",
];
// Historical validation is read-only; the active validator owns summary.md.
console.log(`Validated ${checkpoint.rounds.length} rounds (historical archive)`);
