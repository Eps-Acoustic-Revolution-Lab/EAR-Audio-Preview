/** Validate the active review; historical rounds remain untouched. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)), root=path.dirname(dir);
const read=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
const cp=read('checkpoint.json');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [file,sha] of Object.entries(cp.immutable)) {
 const migration=cp.contractMigrations?.find(m=>m.file===file);
 if(migration){
  assert.equal(migration.originalSha256,sha);
  assert.equal(hash(path.join(dir,migration.originalCopy)),sha);
  assert.ok(new Set(migration.approvedBy).size>=2);
  assert.equal(hash(path.join(root,file)),migration.currentSha256);
 }else assert.equal(hash(path.join(root,file)),sha,`Existing test/baseline changed: ${file}`);
}
for(const r of cp.rounds){
 const prefix=`round_${r.round}/`;
 for(const file of ['findings.json','refutations.json','applied.json','verify.json','summary.md'])assert.ok(fs.statSync(path.join(dir,prefix,file)).size>0,`Missing ${prefix+file}`);
 const f=read(prefix+'findings.json'), d=read(prefix+'refutations.json'), a=read(prefix+'applied.json'), v=read(prefix+'verify.json');
 assert.equal(v.status,'passed');assert.equal(v.tests.exitCode,0);assert.ok(v.tests.passed>=cp.baseline.passed);assert.ok(v.tests.skipped<=cp.baseline.skipped);
 for(const c of f.candidates){const votes=d.verdicts.filter(x=>x.id===c.id);assert.ok(votes.length>=2,`Two independent votes required: ${c.id}`);assert.equal(new Set(votes.map(x=>x.agent)).size,votes.length);assert.ok(votes.every(x=>x.agent!==c.generator));}
 for(const fix of a.fixes){assert.ok(f.candidates.some(x=>x.id===fix.id));const votes=d.verdicts.filter(x=>x.id===fix.id);assert.ok(votes.filter(x=>x.verdict==='CONFIRMED').length>votes.length/2);assert.match(fix.commit,/^[a-f0-9]{7,40}$/);if(fix.dimension==='efficiency'){assert.equal(v.efficiency.byteIdentical,true);assert.ok(v.efficiency.speedup>1.1);}}
 if(r.status==='dry'){assert.equal(a.fixes.length,0);assert.ok(!d.verdicts.some(x=>x.verdict==='CONFIRMED'));}
}
const summary=['# Roadmap adversarial review', '',`Base: ${cp.base}`,`Reviewed initial head: ${cp.reviewHead}`,`Status: ${cp.status}`,`Immutable existing tests/baselines: ${Object.keys(cp.immutable).length}`,'',...cp.rounds.map(r=>`- Round ${r.round}: ${r.status}; see round_${r.round}/summary.md`),'',`Convergence: ${JSON.stringify(cp.convergence)}`,''];
if(cp.featureOutcomes)summary.push('## Feature outcomes','',...Object.entries(cp.featureOutcomes).map(([k,v])=>`- ${k}: ${v}`),'');
if(cp.finalVerification)summary.push('## Final verification','',`${cp.finalVerification.suites} suites; ${cp.finalVerification.passed} passing tests; ${cp.finalVerification.skipped} skipped. CI: ${cp.finalVerification.ci}.`,`${cp.finalVerification.native}; [native report](${cp.finalVerification.report}).`,'');
summary.push('## Deferred and Git policy','',...cp.deferred.map(x=>`- ${x.id}: ${x.reason}`),'','Local main merge only after review gates; preserve feature and fix commits with a merge commit. No push or release.','');
fs.writeFileSync(path.join(dir,'summary.md'),summary.join('\n'));
console.log(`Validated ${cp.rounds.length} rounds and immutable ground truth.`);
