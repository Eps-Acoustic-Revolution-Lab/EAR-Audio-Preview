import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire('/tmp/ear-roadmap-browser/package.json');
const { chromium } = require('playwright');
const consumer = await fs.mkdtemp(path.join(os.tmpdir(), 'ear-sdk-audio-'));
const reportPath = path.join(root, 'artifacts/sdk-audio-acceptance.json');
await fs.writeFile(path.join(consumer, 'package.json'), '{"private":true,"type":"module"}');
const tarballDir = path.join(root, 'artifacts/sdk-tarballs');
const tarballs = (await fs.readdir(tarballDir)).filter(name => name.endsWith('.tgz')).map(name => path.join(tarballDir, name));
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], { cwd: consumer, stdio: 'pipe' });
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>SDK audio acceptance</title><script type="importmap">{"imports":{"@ear-audio/core":"/node_modules/@ear-audio/core/dist/index.js"}}</script>'); return; }
    const file = path.resolve(consumer, '.' + req.url);
    if (!file.startsWith(consumer + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async () => {
    const { createPcmSource } = await import('/node_modules/@ear-audio/core/dist/index.js');
    const { createAudioSource } = await import('/node_modules/@ear-audio/web-audio/dist/index.js');
    const check = (condition, message) => { if (!condition) { throw new Error(message); } };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const rms = samples => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    const context = new AudioContext({ sampleRate: 48000 });
    await context.resume();
    const oscillator = context.createOscillator(); oscillator.frequency.value = 440;
    // The host independently routes sound; SDK taps a second branch.
    const hostAnalyser = context.createAnalyser(); oscillator.connect(hostAnalyser); hostAnalyser.connect(context.destination);
    const source = createAudioSource({ context, node: oscillator, channelCount: 1, fftSize: 2048 });
    oscillator.start();
    const startDeadline = performance.now() + 3000;
    while (context.currentTime < 0.15 && performance.now() < startDeadline) { await wait(20); }
    const left = new Float32Array(2048), right = new Float32Array(2048);
    source.getAnalysers().left.getFloatTimeDomainData(left);
    source.getAnalysers().right.getFloatTimeDomainData(right);
    check(rms(left) > 0.3, `440Hz analysis branch did not capture live PCM: rms=${rms(left)} state=${context.state} time=${context.currentTime}`);
    check(left.every((value, i) => value === right[i]), 'mono taps differ');
    const monoRms = rms(left);
    const crossings = left.reduce((count, value, i) => count + (i > 0 && left[i - 1] <= 0 && value > 0 ? 1 : 0), 0);
    const measuredHz = crossings * 48000 / 2048;
    check(Math.abs(measuredHz - 440) < 30, 'captured PCM does not contain expected 440Hz');
    source.dispose();
    check(context.state === 'running', 'SDK disposed host AudioContext');
    await wait(50); hostAnalyser.getFloatTimeDomainData(left);
    check(rms(left) > 0.3, 'SDK disconnected host output');
    const detachedTap = createAudioSource({ context, node: oscillator, channelCount: 1 });
    oscillator.disconnect();
    detachedTap.dispose(); detachedTap.dispose();
    check(detachedTap.getAnalysers() === null && context.state === 'running', 'host-disconnected tap failed disposal');
    oscillator.stop();
    const merger = context.createChannelMerger(2);
    const a = context.createOscillator(), b = context.createOscillator();
    a.frequency.value = 750; b.frequency.value = 1500;
    a.connect(merger, 0, 0); b.connect(merger, 0, 1);
    const stereo = createAudioSource({ context, node: merger, channelCount: 2, fftSize: 2048 });
    a.start(); b.start();
    const stereoStart = context.currentTime;
    const stereoDeadline = performance.now() + 3000;
    while (context.currentTime < stereoStart + 0.15 && performance.now() < stereoDeadline) { await wait(20); }
    const frequencyLeft = new Float32Array(1024), frequencyRight = new Float32Array(1024);
    stereo.getAnalysers().left.getFloatFrequencyData(frequencyLeft);
    stereo.getAnalysers().right.getFloatFrequencyData(frequencyRight);
    const peak = data => data.reduce((best, value, i) => value > data[best] ? i : best, 0);
    check(peak(frequencyLeft) === 32 && peak(frequencyRight) === 64, 'stereo channels cross-contaminated');
    stereo.getAnalysers().left.getFloatTimeDomainData(left);
    const pcm = createPcmSource({ sampleRate: 48000, fftSize: 2048 });
    pcm.push({ left });
    const pcmFrequency = new Float32Array(1024); pcm.getAnalysers().left.getFloatFrequencyData(pcmFrequency);
    const amplitudeDeltaDb = Math.abs(pcmFrequency[32] - frequencyLeft[32]);
    check(amplitudeDeltaDb < 0.001, `PCM/native amplitude mismatch: ${amplitudeDeltaDb} dB`);
    const webAudioPeakDb = frequencyLeft[32];
    a.stop(); b.stop(); stereo.dispose(); pcm.dispose(); await context.close();
    async function render(mode) {
      const offline = new OfflineAudioContext(2, 8192, 48000);
      const buffer = offline.createBuffer(2, 8192, 48000);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) { data[i] = 0.4 * Math.sin(2 * Math.PI * (channel ? 1500 : 750) * i / 48000); }
      }
      const input = offline.createBufferSource(); input.buffer = buffer; input.connect(offline.destination);
      let tap;
      if (mode !== 'baseline') { tap = createAudioSource({ context: offline, node: input, channelCount: 2 }); }
      if (mode === 'dispose-during-render') {
        offline.suspend(0.03).then(() => { tap.dispose(); check(offline.state === 'suspended', 'dispose changed offline context state'); return offline.resume(); });
      }
      input.start(); const output = await offline.startRendering();
      tap?.dispose();
      return [Array.from(output.getChannelData(0)), Array.from(output.getChannelData(1))];
    }
    const baseline = await render('baseline');
    const attached = await render('attached');
    const disposed = await render('dispose-during-render');
    let maxDifference = 0;
    baseline.forEach((channel, c) => channel.forEach((value, i) => { maxDifference = Math.max(maxDifference, Math.abs(value - attached[c][i]), Math.abs(value - disposed[c][i])); }));
    check(maxDifference === 0, `analysis branch changed output by ${maxDifference}`);
    return { monoRms, measuredHz, stereoPeakBins: [32, 64], webAudioPeakDb, pcmPeakDb: pcmFrequency[32], amplitudeDeltaDb, offlineSamplesCompared: 32768, offlineMaxDifference: maxDifference, hostOutputSurvivedDispose: true, hostDisconnectedTapDisposed: true };
  });
  const report = { passed: true, checkedAt: new Date().toISOString(), browser: await browser.version(), source: 'isolated npm tarball consumer', result };
  await fs.mkdir(path.dirname(reportPath), { recursive: true }); await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(consumer, { recursive: true, force: true });
}
