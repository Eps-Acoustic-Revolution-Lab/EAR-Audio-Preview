import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.EAR_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts/roadmap");
await fs.mkdir(output, { recursive: true });
const sr = 48000,
  frames = sr * 20;
const wav = Buffer.alloc(44 + frames * 4);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sr, 24);
wav.writeUInt32LE(sr * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(frames * 4, 40);
for (let i = 0; i < frames; i++) {
  const v = Math.round(32767 * 0.25 * Math.sin((2 * Math.PI * 440 * i) / sr));
  wav.writeInt16LE(v, 44 + 4 * i);
  wav.writeInt16LE(v, 46 + 4 * i);
}
const bridge = `window.hostErrors=[]; window.acquireVsCodeApi=()=>({getState:()=>({onboardingSeen:true}),setState(){},async postMessage(m){const d=m.data; const send=(x)=>window.postMessage(x,location.origin); if(m.type==='CONFIG')send({type:'CONFIG',data:{autoAnalyze:false,fileExt:'wav',fileName:'Synthetic 440 Hz stereo.wav',onboardingSeen:true,loudnessWorkletUri:'/dist/loudness.worklet.js',sequenceWorkerUri:location.origin+'/dist/sequenceWorker.js',essentiaWasmUri:location.origin+'/dist/essentia-wasm.web.wasm',playerDefault:{initialVolume:30,enableSpacekeyPlay:true},analyzeDefault:{}}}); else if(m.type==='DATA'){const r=await fetch('/audio');const samples=await r.arrayBuffer();send({type:'DATA',data:{samples,start:0,end:samples.byteLength,wholeLength:samples.byteLength}});} else if(m.type==='ANALYZE_SEQUENCE_FEATURES'){window.hostErrors.push('Unexpected host sequence fallback');send({type:'SEQUENCE_FEATURES',data:{requestId:d.requestId,error:'No host bridge in smoke fixture'}});} }});`;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/audio") {
      res.end(wav);
      return;
    }
    if (req.url === "/bridge.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bridge);
      return;
    }
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'wasm-unsafe-eval' 'nonce-roadmap' blob: 'self'; worker-src 'self' blob:; connect-src 'self' data:;"><style>:root{--vscode-editor-background:#19191b;--vscode-foreground:#e8e8ec;--vscode-font-size:13px;--vscode-font-family:system-ui;--vscode-focusBorder:#7bc38a}body{margin:12px;background:#19191b;color:#e8e8ec;font:13px system-ui}</style></head><body><div id="root"></div><script nonce="roadmap" src="/bridge.js"></script><script nonce="roadmap" src="/dist/audioPreview.js"></script></body></html>`,
      );
      return;
    }
    if (!/^\/dist\/[\w.-]+$/.test(req.url)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      req.url.endsWith(".wasm") ? "application/wasm" : "text/javascript",
    );
    res.end(await fs.readFile(path.join(root, req.url)));
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.EAR_CHROME_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(30000);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator("#settingsFab:not([disabled])").waitFor();
  await page.locator("#tabLiveSpec").click();
  if (
    (await page
      .locator(".js-toggleLevelMeter")
      .getAttribute("aria-pressed")) !== "true"
  )
    await page.locator(".js-toggleLevelMeter").click();
  await page.locator(".js-transportExpand").click();
  await page.locator(".js-transportPanelPlay[aria-label=Play]").click();
  await page.locator(".js-transportClose").click();
  await page.locator(".spectralDescriptors:visible summary").click();
  await page.locator(".levelMeter__weighting:visible").selectOption("A");
  await page.waitForFunction(() =>
    document
      .querySelector(".spectralDescriptors__rows")
      ?.textContent.includes("440 Hz"),
  );
  await page.waitForTimeout(500);
  await page.mouse.move(10, 10);
  await page.screenshot({
    path: path.join(output, "live-descriptors-weighted.png"),
    fullPage: true,
  });

  const evidence = {
    fixture:
      "Generated 20-second 48 kHz in-phase stereo 440 Hz sine, peak 0.25",
    descriptor: await page
      .locator(".spectralDescriptors__rows:visible")
      .innerText(),
    weighting: await page
      .locator(".levelMeter__weighting:visible")
      .inputValue(),
    rmsL: await page.locator(".js-meterRmsL:visible").innerText(),
    errors,
  };
  await page.setViewportSize({ width: 760, height: 900 });
  await page.screenshot({
    path: path.join(output, "live-narrow.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.locator("#tabLoudness").click();
  await page.locator(".harmonicTimeline:visible button").click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".harmonicTimeline canvas")].some(
        (e) => !e.hidden,
      ),
    null,
    { timeout: 90000 },
  );
  await page
    .locator(".harmonicTimeline:visible")
    .screenshot({ path: path.join(output, "harmonic-timeline.png") });
  evidence.harmonicStatus = await page
    .locator(".harmonicTimeline:visible [role=status]")
    .innerText();
  await page.locator(".harmonicTimeline:visible").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.locator(".harmonicTimeline:visible").screenshot({
    path: path.join(output, "harmonic-melody-scrolled.png"),
  });
  await page.locator(".loudnessHost__expandBtn").click();
  await page.locator(".harmonicTimeline:visible button").last().click();
  await page
    .locator(".harmonicTimeline:visible canvas:not([hidden])")
    .last()
    .waitFor();
  await page
    .locator(".harmonicTimeline:visible")
    .last()
    .screenshot({
      path: path.join(output, "harmonic-fullscreen.png"),
    });
  evidence.hostErrors = await page.evaluate(() => window.hostErrors);
  if (evidence.hostErrors.length)
    throw new Error(evidence.hostErrors.join("\n"));
  await fs.writeFile(
    path.join(output, "browser.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
  server.close();
}
