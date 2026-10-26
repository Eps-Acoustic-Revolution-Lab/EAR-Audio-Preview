import fs from 'node:fs/promises';
import CDP from '../../../bench/plugins/cdp.mjs';
const s=JSON.parse(await fs.readFile(new URL('./session.json',import.meta.url)));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn){let last;for(let i=0;i<300;i++){try{const x=await fn();if(x)return x;}catch(e){last=e;}await pause(200);}throw last||Error('timeout');}
async function post(route,data={}){const r=await fetch('http://127.0.0.1:9497'+route,{method:'POST',headers:{authorization:`Bearer ${s.token}`},body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();}
const clients=[],result={};
try{
result.editor=await wait(()=>post('/status'));
await post('/command',{command:'workbench.action.closeSidebar'});
await post('/open',{file:s.out+'/tone440.wav',viewType:'earAudioPreview.audioPreview'});
const targets=()=>fetch('http://127.0.0.1:9496/json/list').then(r=>r.json());
const target=await wait(async()=>(await targets()).find(t=>t.type==='iframe'&&t.url.includes('ear-audio-preview')));
const c=await CDP.connect(target.webSocketDebuggerUrl);clients.push(c);await c.send('Runtime.enable');
const context=await wait(async()=>{for(const e of c.events.filter(e=>e.method==='Runtime.executionContextCreated'&&e.params.context.auxData?.isDefault)){if(await c.evaluate(`!!document.querySelector('.js-paneSelect-liveSpec')`,e.params.context.id))return e.params.context.id;}});
const ev=x=>c.evaluate(x,context);
await ev(`document.querySelector('.js-tourSkip')?.click();document.querySelector('.js-paneSelect-liveSpec').click()`);
await wait(()=>ev(`!!document.querySelector('.spectralDescriptors')`));
await ev(`document.querySelector('.spectralDescriptors').open=true;document.querySelector('.js-transportPanelPlay').click()`);await pause(1300);
const state=()=>ev(`({descriptors:document.querySelector('.spectralDescriptors').innerText,meter:document.querySelector('.levelMeterComponent').innerText,canvases:Array.from(document.querySelectorAll('#liveAnalysisInner canvas')).map(c=>({w:c.width,h:c.height,cssW:c.getBoundingClientRect().width,cssH:c.getBoundingClientRect().height})),row:document.querySelector('#gonioWrap').style.flex,col:document.querySelector('[data-gonio-polar-mount]').style.flex})`);
result.playing=await state();
await ev(`document.querySelector('.js-transportPanelPlay').click()`);await pause(350);result.paused=await state();
await ev(`document.querySelector('.js-transportPanelPlay').click()`);await pause(700);result.resumed=await state();
result.drag=await ev(`(()=>{const row=document.querySelector('#liveResizeHandle'),parent=row.parentElement,rect=parent.getBoundingClientRect();const before=document.querySelector('#gonioWrap').getBoundingClientRect().height;row.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:rect.left+50,clientY:rect.top+100}));document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:rect.left+50,clientY:rect.top+rect.height*.65}));document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));const after=document.querySelector('#gonioWrap').getBoundingClientRect().height;const col=document.querySelector('#gonioWrap [data-gonio-col-handle]'),r=col.parentElement.getBoundingClientRect(),polar=document.querySelector('#gonioWrap [data-gonio-polar-mount]'),cb=polar.style.flex;col.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.left+100,clientY:r.top+30}));document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.left+r.width*.13,clientY:r.top+30}));document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));return {rowBefore:before,rowAfter:after,colBefore:cb,colAfter:polar.style.flex};})()`);
result.suspend=await ev(`(()=>{const h=document.querySelector('#liveResizeHandle'),r=h.parentElement.getBoundingClientRect();h.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:r.left+50,clientY:r.top+100}));document.querySelector('.js-paneSelect-loudness').click();document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.left+50,clientY:r.top+250}));document.querySelector('.js-paneSelect-liveSpec').click();return true;})()`);await pause(700);result.afterSuspend=await state();
const outer=await CDP.connect((await targets()).find(t=>t.type==='page').webSocketDebuggerUrl);clients.push(outer);
await fs.writeFile(s.out+'/single-live.png',Buffer.from((await outer.send('Page.captureScreenshot')).data,'base64'));
result.exceptions=c.events.filter(e=>e.method==='Runtime.exceptionThrown');
result.passed=[result.playing,result.resumed,result.afterSuspend].every(x=>x.descriptors.includes('Centroid 440 Hz')&&x.canvases.length===3&&x.canvases.every(y=>y.w>0&&y.h>0&&y.cssW>0&&y.cssH>0))&&result.drag.rowBefore!==result.drag.rowAfter&&result.drag.colBefore!==result.drag.colAfter&&!result.exceptions.length;
}catch(e){result.error=String(e);}finally{await fs.writeFile(s.out+'/result.json',JSON.stringify(result,null,2));clients.forEach(c=>c.close());}
console.log(JSON.stringify(result,null,2));
