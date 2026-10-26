/** Independent browser acceptance against installed SDK tarballs, never source aliases. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.EAR_PLAYWRIGHT_MODULE || 'playwright');
const root=process.cwd(), out=path.join(root,'artifacts/sdk-acceptance');
await fs.mkdir(out,{recursive:true});
const consumer=await fs.mkdtemp(path.join(os.tmpdir(),'ear-sdk-browser-'));
const tarDir=path.join(root,'artifacts/sdk-tarballs');
const tarballs=(await fs.readdir(tarDir)).filter(x=>x.endsWith('.tgz')).map(x=>path.join(tarDir,x));
assert.equal(tarballs.length,10);
await fs.writeFile(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund',...tarballs],{cwd:consumer,stdio:'pipe'});
const names=['core','web-audio','dsp','theme','level-meter','spectrum','stereo-field','phase-correlation','descriptors','live-panel'];
const imports=Object.fromEntries(names.map(n=>['@ear-audio/'+n,'/node_modules/@ear-audio/'+n+'/dist/index.js']));
for(const name of names){const p=JSON.parse(await fs.readFile(path.join(consumer,'node_modules/@ear-audio',name,'package.json'),'utf8'));for(const [key,value] of Object.entries(p.exports)){if(typeof value==='object' && value.import)imports['@ear-audio/'+name+(key==='.'?'':key.slice(1))]='/node_modules/@ear-audio/'+name+'/'+value.import.replace(/^\.\//,'');}}
const html=`<!doctype html><html><head><link rel="stylesheet" href="/node_modules/@ear-audio/theme/dist/styles.css"><style>body{margin:20px;background:#202124;color:white;font:14px system-ui}.mount{height:300px;width:640px;margin-bottom:20px;border:1px solid #555}#meter{width:160px}#panel{height:600px;width:1000px}</style><script type="importmap">${JSON.stringify({imports})}</script></head><body><p id="outside">Host content</p>${['meter','spectrum','stereo','phase','descriptors','panel'].map(id=>`<div id="${id}" class="mount"></div>`).join('')}</body></html>`;
const server=http.createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(consumer,'.'+name);if(!file.startsWith(consumer+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.EAR_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--mute-audio']});
const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.evaluate(async()=>{
 const core=await import('@ear-audio/core'), meter=await import('@ear-audio/level-meter'), spectrum=await import('@ear-audio/spectrum'),stereo=await import('@ear-audio/stereo-field'),phase=await import('@ear-audio/phase-correlation'),descriptors=await import('@ear-audio/descriptors'),panel=await import('@ear-audio/live-panel');
 const source=core.createPcmSource({sampleRate:48000,fftSize:2048});
 const pcm=Float32Array.from({length:32768},(_,i)=>0.25*Math.sin(2*Math.PI*1500*i/48000));
 const views=[meter.createLevelMeter(document.querySelector('#meter'),{source}),spectrum.createSpectrum(document.querySelector('#spectrum'),{source}),stereo.createStereoField(document.querySelector('#stereo'),{source}),phase.createPhaseCorrelation(document.querySelector('#phase'),{source}),descriptors.createDescriptors(document.querySelector('#descriptors'),{source}),panel.createLivePanel(document.querySelector('#panel'),{source})];
 source.push({left:pcm,right:pcm});
 window.fixture={source,pcm,views};
 });
 await page.waitForFunction(()=>document.querySelector('#descriptors').textContent.includes('1.50 kHz')||document.querySelector('#descriptors').textContent.includes('1500'));
 await page.waitForTimeout(500);
 const initial=await page.evaluate(()=>({rms:document.querySelector('#meter .js-meterRmsL').textContent,peak:document.querySelector('#meter .js-meterPeakL').textContent,descriptors:document.querySelector('#descriptors').textContent,canvases:[...document.querySelectorAll('canvas')].map(c=>({width:c.width,height:c.height})),outsideFont:getComputedStyle(document.querySelector('#outside')).fontSize}));
 assert.match(initial.rms,/-15\.1/);assert.match(initial.peak,/-12\.0/);assert.equal(initial.outsideFont,'14px');
 const geometry = await page.evaluate(() => ['#meter .levelMeter__canvas', '#stereo canvas', '#spectrum canvas', '#phase canvas'].map(selector => { const c=document.querySelector(selector);return {selector,w:c.width,h:c.height}; }));
 assert.ok(geometry.every(c=>c.w>20&&c.h>50), JSON.stringify(geometry));
 await page.screenshot({path:path.join(out,'six-modules.png'),fullPage:true});
 await page.locator('#panel #liveAnalysisInner').click({button:'right',position:{x:120,y:60}});
 assert.equal(await page.locator('#panel .earContextMenu').count(),1);
 await page.getByRole('menuitem',{name:'Fullscreen',exact:false}).click();
 await page.waitForFunction(()=>!document.querySelector('#panel #liveOverlay').classList.contains('hidden'));
 await page.screenshot({path:path.join(out,'fullscreen.png')});
 await page.keyboard.press('Escape');
 assert.ok(await page.locator('#panel #liveOverlay').evaluate(e=>e.classList.contains('hidden')));
 const weighting=await page.evaluate(async()=>{const f=window.fixture,rows=[];for(const weighting of ['Z','A','B','C']){f.views[0].setOptions({weighting});await new Promise(r=>setTimeout(r,500));rows.push({weighting,rms:document.querySelector('#meter .js-meterRmsL').textContent,peak:document.querySelector('#meter .js-meterPeakL').textContent});}return rows;});
 assert.ok(weighting.every(x=>x.peak===initial.peak));
 // All stereo modes and the CQT path retain the original renderers.
 for(const mode of ['lissajous','polarSample','polarLevel']){await page.evaluate(mode=>window.fixture.views[2].setOptions({liveSoundFieldMode:mode}),mode);await page.waitForTimeout(70);}
 await page.evaluate(()=>window.fixture.views[1].setOptions({liveSpectrumMode:'cqt'}));
 await page.waitForTimeout(150);
 const lifecycle=await page.evaluate(async()=>{const f=window.fixture;f.views.forEach(v=>v.suspend());const before=[...document.querySelectorAll('canvas')].map(c=>c.toDataURL());f.source.push({left:new Float32Array(32768)});await new Promise(r=>setTimeout(r,150));const after=[...document.querySelectorAll('canvas')].map(c=>c.toDataURL());const unchanged=before.every((x,i)=>x===after[i]);f.views.forEach(v=>{v.reset();v.resume();v.resize();});f.source.push({left:f.pcm,right:f.pcm});await new Promise(r=>setTimeout(r,100));f.views.forEach(v=>{v.dispose();v.dispose();});const rootCount=document.querySelectorAll('.ear-sdk').length;const sourceAlive=f.source.getAnalysers()!==null;f.source.dispose();return{unchanged,rootCount,sourceAlive};});
 assert.equal(lifecycle.unchanged,true);assert.equal(lifecycle.rootCount,0);assert.equal(lifecycle.sourceAlive,true);assert.deepEqual(errors,[]);
 const result={passed:true,initial,weighting,lifecycle,errors,consumer,packages:tarballs.map(x=>path.basename(x))};
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
