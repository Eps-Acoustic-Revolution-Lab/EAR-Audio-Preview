import fs from "node:fs/promises";
import CDP from "../../../bench/plugins/cdp.mjs";
const s = JSON.parse(
    await fs.readFile(new URL("./session.json", import.meta.url)),
  ),
  out = s.out;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, t = 90000) {
  let e;
  const end = Date.now() + t;
  while (Date.now() < end) {
    try {
      let v = await fn();
      if (v) return v;
    } catch (x) {
      e = x;
    }
    await pause(200);
  }
  throw e || Error("timeout");
}
async function post(route, data = {}) {
  const r = await fetch("http://127.0.0.1:9477" + route, {
    method: "POST",
    headers: { authorization: `Bearer ${s.token}` },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const targets = () =>
  fetch("http://127.0.0.1:9476/json/list").then((r) => r.json());
let clients = [];
const instrument = `(()=>{window.__workerEvidence=[];const orig=Worker.prototype.postMessage;Worker.prototype.postMessage=function(msg,...args){const entry={harmonic:msg.harmonic,rate:msg.sampleRate,bytes:msg.samples?.byteLength,wasmUri:msg.wasmUri,wasmBytes:msg.wasmBinary?.byteLength,replies:[]};window.__workerEvidence.push(entry);this.addEventListener('message',e=>{const d=e.data,p=d.profile;entry.replies.push({kind:d.kind,error:d.error,frames:p?.timeSec?new Float32Array(p.timeSec).length:undefined,f0:p?.f0Hz?Array.from(new Float32Array(p.f0Hz).filter(v=>v>0).slice(0,8)):undefined,harmonic:p?.harmonic?{chromaFrames:p.harmonic.chromaTimeSec?new Float32Array(p.harmonic.chromaTimeSec).length:0,melodyFrames:new Float32Array(p.harmonic.melodyHz).length,voicedMelody:Array.from(new Float32Array(p.harmonic.melodyHz).filter(v=>v>0).slice(0,8)),melodyKeys:Object.keys(p.harmonic)}:undefined});});return orig.call(this,msg,...args);};return true;})()`;
async function attach(selector) {
  const target = await wait(async () =>
    (await targets()).find(
      (t) => t.type === "iframe" && t.url.includes("ear-audio-preview"),
    ),
  );
  const c = await CDP.connect(target.webSocketDebuggerUrl);
  clients.push(c);
  await c.send("Runtime.enable");
  await c.send("Log.enable");
  await c.send("Network.enable");
  const context = await wait(async () => {
    for (const e of c.events.filter(
      (e) =>
        e.method === "Runtime.executionContextCreated" &&
        e.params.context.auxData?.isDefault,
    )) {
      try {
        if (
          await c.evaluate(
            `!!document.querySelector(${JSON.stringify(selector)})`,
            e.params.context.id,
          )
        )
          return e.params.context.id;
      } catch {}
    }
  });
  await c.evaluate(instrument, context);
  return { c, context };
}
const result = {};
try {
  result.editor = await wait(() => post("/status"));
  const main = (await targets()).find((t) => t.type === "page");
  const outer = await CDP.connect(main.webSocketDebuggerUrl);
  clients.push(outer);
  await outer.send("Page.bringToFront");
  await post("/command", { command: "workbench.action.closeSidebar" });
  await post("/command", { command: "workbench.action.closeAuxiliaryBar" });
  await post("/open", {
    file: out + "/tone440.wav",
    viewType: "earAudioPreview.audioPreview",
  });
  let { c, context } = await attach(".js-paneSelect-loudness");
  const ev = (x) => c.evaluate(x, context);
  await ev(
    `document.querySelector('.js-tourSkip')?.click();document.querySelector('.js-paneSelect-loudness').click()`,
  );
  await wait(() => ev(`!!document.querySelector('.harmonicTimeline button')`));
  await ev(`document.querySelector('.harmonicTimeline button').click()`);
  await wait(
    () =>
      ev(
        `/analyzed|unavailable/.test(document.querySelector('.harmonicTimeline').innerText)`,
      ),
    120000,
  );
  result.single = await ev(
    `({workers:window.__workerEvidence,harmonic:document.querySelector('.harmonicTimeline').innerText,f0Placeholder:document.querySelector('.js-f0Placeholder').className})`,
  );
  await ev(
    `document.querySelector(".js-tourSkip")?.click();document.querySelector(".harmonicTimeline").scrollIntoView({block:"center"})`,
  );
  await post("/command", { command: "notifications.clearAll" });
  await pause(400);
  await fs.writeFile(
    out + "/single-harmonic-after-fix.png",
    Buffer.from((await outer.send("Page.captureScreenshot")).data, "base64"),
  );
  await ev(`document.querySelector('.js-paneSelect-liveSpec').click()`);
  await wait(() => ev(`!!document.querySelector('.spectralDescriptors')`));
  await ev(
    `document.querySelector('.spectralDescriptors').open=true;document.querySelector('.js-transportPanelPlay').click()`,
  );
  await pause(1800);
  result.live = {};
  for (const weight of ["Z", "A", "B", "C"]) {
    await ev(
      `(()=>{const e=document.querySelector('.levelMeter__weighting');e.value='${weight}';e.dispatchEvent(new Event('change'));})()`,
    );
    await pause(500);
    result.live[weight] = await ev(
      `({descriptors:document.querySelector('.spectralDescriptors').innerText,meter:document.querySelector('.levelMeterComponent').innerText})`,
    );
  }
  await ev(
    `document.querySelector(".js-tourSkip")?.click();document.querySelector(".spectralDescriptors").scrollIntoView({block:"center"})`,
  );
  await pause(300);
  await fs.writeFile(
    out + "/single-live-after-fix.png",
    Buffer.from((await outer.send("Page.captureScreenshot")).data, "base64"),
  );
  result.singleErrors = c.events.filter(
    (e) =>
      e.method === "Runtime.exceptionThrown" || e.method === "Log.entryAdded",
  );
  await post("/close");
  await post("/command", {
    command: "earAudioPreview.compare",
    args: [
      null,
      [{ file: out + "/tone440.wav" }, { file: out + "/tone440-copy.wav" }],
    ],
  });
  ({ c, context } = await attach("#root.comparisonApp"));
  await wait(() =>
    ev(`document.querySelectorAll('.comparisonTrack').length===2`),
  );
  await ev(
    `document.querySelector('.js-tourSkip')?.click();document.querySelector('[data-pane="loudness"]').click()`,
  );
  await wait(
    () =>
      ev(
        `window.__workerEvidence.filter(e=>(e.wasmUri||e.wasmBytes)&&e.replies.some(r=>r.kind==='result'||r.kind==='error')).length===2`,
      ),
    120000,
  );
  result.comparison = await ev(
    `({workers:window.__workerEvidence,text:document.querySelector('[data-deck]').innerText})`,
  );
  await fs.writeFile(
    out + "/comparison-loudness-after-fix.png",
    Buffer.from((await outer.send("Page.captureScreenshot")).data, "base64"),
  );
  result.comparisonErrors = c.events.filter(
    (e) =>
      e.method === "Runtime.exceptionThrown" || e.method === "Log.entryAdded",
  );
  const sequences = result.single.workers.filter((w) => w.wasmBytes);
  const comparisons = result.comparison.workers.filter((w) => w.wasmBytes);
  result.passed =
    sequences.some(
      (w) =>
        w.harmonic &&
        w.replies.some(
          (r) =>
            r.kind === "result" &&
            r.harmonic?.chromaFrames > 0 &&
            r.harmonic?.melodyFrames > 0 &&
            r.harmonic?.voicedMelody?.length,
        ),
    ) &&
    sequences.some(
      (w) =>
        !w.harmonic &&
        w.replies.some(
          (r) => r.kind === "result" && r.frames > 0 && r.f0?.length,
        ),
    ) &&
    comparisons.length === 2 &&
    comparisons.every((w) =>
      w.replies.some(
        (r) => r.kind === "result" && r.frames > 0 && r.f0?.length,
      ),
    ) &&
    Object.values(result.live).every((v) =>
      v.descriptors.includes("Centroid 440 Hz"),
    ) &&
    !result.singleErrors.some((e) => e.method === "Runtime.exceptionThrown") &&
    !result.comparisonErrors.some(
      (e) => e.method === "Runtime.exceptionThrown",
    );
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  result.error = String(e);
  console.error(e);
} finally {
  await fs.writeFile(out + "/result.json", JSON.stringify(result, null, 2));
  clients.forEach((c) => c.close());
}
