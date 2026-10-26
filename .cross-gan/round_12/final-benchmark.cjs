const fs = require('fs');
const ts = require(process.cwd() + '/node_modules/typescript');
const original = fs.readFileSync('.cross-gan/round_12/before/core.ts','utf8');
const optimized = fs.readFileSync('src/sdk/core.ts','utf8');
function load(source) {const module = {exports:{}};new Function('exports','module',ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}))(module.exports,module);return module.exports;}
const a=load(original), b=load(optimized);
let seed=1234; function random(){seed=(Math.imul(seed,1664525)+1013904223)|0;return seed/2147483648;}
let checked=0;
for (let power=5;power<=15;power++) {
 const size=2**power, sources=[a,b].map(m=>m.createPcmSource({sampleRate:48000,fftSize:size}));
 for(let frame=0;frame<12;frame++) {
  const length=[0,17,size,size+100][frame%4];
  const left=Float32Array.from({length},(_,i)=>frame===0?0:frame===1?(i===0?1:0):frame===2?Math.sin(2*Math.PI*440*i/48000):random());
  const right=Float32Array.from(left,v=>-v);
  const results=sources.map(source=>{source.push({left,right});const an=source.getAnalysers();return [an.left,an.right].map(channel=>{const out=new Float32Array(size/2);channel.getFloatFrequencyData(out);return Buffer.from(out.buffer);});});
  if(!results[0].every((out,i)=>out.equals(results[1][i])))throw Error('Mismatch '+size+' '+frame);
  checked+=2;
 }
}
console.log(JSON.stringify({equalityChecks:checked,allByteIdentical:true}));
for (const size of [2048,8192,32768]) {
 const channels=[Float32Array.from({length:size},random),Float32Array.from({length:size},random)];
 const sources=[a,b].map(m=>m.createPcmSource({sampleRate:48000,fftSize:size}));
 const out=sources.map(()=>[new Float32Array(size/2),new Float32Array(size/2)]);
 function run(which,count){const s=sources[which],d=out[which];const t=performance.now();for(let n=0;n<count;n++){s.push({left:channels[0],right:channels[1]});const x=s.getAnalysers();x.left.getFloatFrequencyData(d[0]);x.right.getFloatFrequencyData(d[1]);}return (performance.now()-t)/count;}
 run(0,10);run(1,10);
 const times=[[],[]];for(let n=0;n<12;n++){const order=n%2?[1,0]:[0,1];for(const which of order)times[which].push(run(which,20));}
 const same=out[0].every((arr,c)=>Buffer.from(arr.buffer).equals(Buffer.from(out[1][c].buffer)));
 console.log(JSON.stringify({size,byteIdentical:same,msStereoFrame:times.map(t=>t.sort((x,y)=>x-y)[6]),raw:times}));
}
