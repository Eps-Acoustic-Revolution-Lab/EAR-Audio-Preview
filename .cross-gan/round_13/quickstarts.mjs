// Validate the six README snippets against installed tarballs in a real browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.EAR_PLAYWRIGHT_MODULE || 'playwright');
const root=process.cwd(), temp=await fs.mkdtemp(path.join(os.tmpdir(),'ear-readme-'));
const names=['level-meter','spectrum','stereo-field','phase-correlation','descriptors','live-panel'];
let browser, server;
try {
 await fs.writeFile(path.join(temp,'package.json'),'{"private":true,"type":"module"}');
 const tarDir=path.join(root,'artifacts/sdk-tarballs');
 const tarballs=(await fs.readdir(tarDir)).filter(n=>n.endsWith('.tgz')).map(n=>path.join(tarDir,n));
 execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund',...tarballs],{cwd:temp,stdio:'pipe'});
 const imports={};
 for(const name of await fs.readdir(path.join(temp,'node_modules/@ear-audio'))){
  const p=JSON.parse(await fs.readFile(path.join(temp,'node_modules/@ear-audio',name,'package.json'),'utf8'));
  for(const [key,value] of Object.entries(p.exports))if(value.import)imports['@ear-audio/'+name+(key==='.'?'':key.slice(1))]='/node_modules/@ear-audio/'+name+'/'+value.import.replace(/^\.\//,'');
 }
 server=http.createServer(async(req,res)=>{try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(`<script type="importmap">${JSON.stringify({imports})}</script><link rel="stylesheet" href="/node_modules/@ear-audio/theme/dist/styles.css"><div id="visualization" style="width:900px;height:600px"></div>`);return;}
  const file=path.resolve(temp,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(temp+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.EAR_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const results=[];
 for(const name of names){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const readme=await fs.readFile(path.join(root,'packages',name,'README.md'),'utf8');
  const code=readme.match(/```js\n([\s\S]*?)```/)[1].replace(/import\s+(\{[^}]+\})\s+from\s+"([^"]+)";/g,'const $1 = await import("$2");').replace(/import "@ear-audio\/theme\/styles.css";/,'');
  const result=await page.evaluate(async code=>{
   const cleanup=await new Function('return (async()=>{'+code+';return cleanup;})()')();
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const mounted=document.querySelectorAll('.ear-sdk').length;cleanup();
   return {mounted,afterCleanup:document.querySelectorAll('.ear-sdk').length};
  },code);
  assert.equal(result.mounted,1);assert.equal(result.afterCleanup,0);assert.deepEqual(errors,[]);
  results.push({name,...result,errors});await page.close();
 }
 console.log(JSON.stringify({passed:true,results},null,2));
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.rm(temp,{recursive:true,force:true});}
