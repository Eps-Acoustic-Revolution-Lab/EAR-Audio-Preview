const fs = require('fs');
const ts = require(process.cwd() + '/node_modules/typescript');
const original = fs.readFileSync('src/sdk/core.ts','utf8');
const optimized = original.replace('function spectrum(samples: Float32Array): Float32Array {', `const fftTables = new Map<number, {window: Float64Array, cosine: Float64Array, sine: Float64Array}>();
function spectrum(samples: Float32Array): Float32Array {`).replace('  const real = new Float64Array(size);', `  let table = fftTables.get(size);
  if (!table) {
    const window = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const phase = (2 * Math.PI * i) / size;
      window[i] = 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
    }
    const cosine = new Float64Array(size), sine = new Float64Array(size);
    for (let span = 2; span <= size; span *= 2) {
      for(let j=0;j<span/2;j++) cosine[span/2-1+j] = Math.cos((-2 * Math.PI * j) / span);
      for(let j=0;j<span/2;j++) sine[span/2-1+j] = Math.sin((-2 * Math.PI * j) / span);
    }
    table = {window, cosine, sine}; fftTables.set(size, table);
  }
  const real = new Float64Array(size);`).replace('real[i] = samples[i] * window;', 'real[i] = samples[i] * table.window[i];').replace('real[b] * Math.cos(phase) - imaginary[b] * Math.sin(phase)', 'real[b] * table.cosine[span/2-1+j] - imaginary[b] * table.sine[span/2-1+j]').replace('real[b] * Math.sin(phase) + imaginary[b] * Math.cos(phase)', 'real[b] * table.sine[span/2-1+j] + imaginary[b] * table.cosine[span/2-1+j]');
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
