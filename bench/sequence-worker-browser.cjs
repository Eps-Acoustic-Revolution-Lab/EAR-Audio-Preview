/** Run after production webpack build; requires Playwright and its Chromium, or CHROME_PATH.
 * node bench/sequence-worker-browser.cjs [long|harmonic|cancel]
 * Uses the webview CSP without unsafe-eval and real packaged worker/WASM assets.
 */
const fs = require('fs'), http = require('http');
const {chromium} = require('playwright');
(async () => {
 const root=process.cwd();
 const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'wasm-unsafe-eval' 'nonce-test' blob: 'self'; worker-src 'self' blob:; connect-src 'self' data:;");res.end('<html><body>worker probe</body></html>');return;}try {res.end(fs.readFileSync(root+req.url));} catch {res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try {
 const page=await browser.newPage(); await page.goto('http://127.0.0.1:'+server.address().port);
 const mode = process.argv[2] || "long";
 const result=await page.evaluate(async(mode)=>{
 const source=await (await fetch('/dist/sequenceWorker.js')).text();const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const worker=new Worker(url);
 const started=performance.now();let ticks=0;const interval=setInterval(()=>ticks++,10);
 return await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(new Error('timeout')),120000);
 worker.onerror=e=>reject(new Error(e.message));
 worker.onmessage=e=>{
 if(e.data.kind==='progress') { if(mode === 'cancel') { worker.terminate(); clearTimeout(timer); clearInterval(interval); setTimeout(()=>resolve({cancelledAtProgress:e.data.percent,ticks}),200); } return; }clearTimeout(timer);clearInterval(interval);worker.terminate();
 const p=e.data.profile;if(!p)return reject(new Error(e.data.error));
 const voiced=Array.from(new Float32Array(mode === "harmonic" ? p.harmonic.melodyHz : p.f0Hz)).filter(x=>x>0);
 resolve({elapsedMs:performance.now()-started,ticks,frames:new Float32Array(p.timeSec).length,melodyFrames:voiced.length,meanHz:voiced.reduce((s,x)=>s+x,0)/voiced.length});
 };
 const samples=new Float32Array(mode === "harmonic" ? 44100*3 : 16000*600);for(let i=0;i<samples.length;i++)samples[i]=0.5*Math.sin(2*Math.PI*440*i/(mode === "harmonic" ? 44100 : 16000));
 worker.postMessage({samples:samples.buffer,sampleRate:mode === "harmonic" ? 44100 : 16000,hopSec:mode === "harmonic" ? .05 : 600/7200,harmonic:mode === "harmonic",wasmUri:location.origin+'/dist/essentia-wasm.web.wasm'},[samples.buffer]);
 });
 }, mode);
 if (mode !== "cancel" && (!(result.meanHz > 435 && result.meanHz < 445) || result.ticks < 2)) throw new Error("DSP or responsiveness probe failed: " + JSON.stringify(result));
 console.log(JSON.stringify({mode,...result}));
 } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
