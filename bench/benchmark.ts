/**
 * Multi-dimension micro-benchmarks for EAR-Audio-Preview hot paths.
 *
 * Dimensions:
 *   dsp.*      — pure DSP kernels driven per animation frame
 *   anim.*     — per-RAF frame-preparation chains (data prep before canvas)
 *   pipeline.* — offline analysis loops (frame extraction / STFT framing)
 *   io.*       — serialization / encoding (WAV export, wire conversion)
 *
 * Metrics per case:
 *   - opsPerSec / meanMs / p95Ms   latency
 *   - frameBudgetPct               share of one 60 fps frame per call
 *   - allocKbPerOp                 approx heap allocated per call
 *                                  (needs node --expose-gc; -1 when unavailable)
 *
 * Inputs are deterministic (seeded PRNG) so runs are comparable.
 *
 * Usage:
 *   npm run bench                          # print table
 *   npm run bench -- --save bench/baseline.json
 */
import { performance } from "perf_hooks";
import * as fs from "fs";
import * as path from "path";

import {
  buildPazBandLayout,
  buildCqtCacheFromLayout,
  goertzelCqt,
} from "../src/webview/utils/goertzelCqt";
import { quinticBSplineSmooth, quinticBSplineSmoothInto } from "../src/webview/utils/quinticBSpline";
import { akimaResample, akimaResampleInto } from "../src/webview/utils/modifiedAkima";
import {
  emaDecayFromTimeConstant,
  releaseTimeConstantSec,
} from "../src/webview/utils/liveBallistics";
import { computeInstantPolarBins } from "../src/webview/utils/stereoPolarField";
import {
  stepSpectralPeakDisplay,
  smoothPeakDisplayAlongBinsInto,
} from "../src/webview/utils/spectralPeakDisplay";
import {
  computeListenMatchDb,
  getTotalEqResponseDb,
} from "../src/webview/utils/eqCanvasMath";
import { FrequencyPhaseCorrelationEngine } from "../src/webview/utils/frequencyPhaseCorrelation";
import { logFreqs } from "../src/webview/utils/liveLogSpectrumAxis";
import { spectrumTiltDbAboveFloor } from "../src/webview/utils/liveMonitoring";
import { encodeToWav } from "../src/webview/encoder";
import {
  computeEssentiaStftSpectrogram,
  stftWireToSpectrogram,
  StftSpectrogramWire,
} from "../src/shared/stftEssentiaCompute";
import { computeSequenceFeatures } from "../src/shared/sequenceFeatureCompute";
import { flattenSpectrogramForUpload } from "../src/webview/components/spectrogram/spectrogramRenderer";
import AnalyzeService from "../src/webview/services/analyzeService";
import type { EssentiaInstance } from "../src/shared/essentiaTypes";
import type { EqFilterBand } from "../src/webview/types/headphoneEq";

const FRAME_BUDGET_MS = 1000 / 60;

declare const global: { gc?: () => void };

/** mulberry32 — deterministic PRNG so benchmark inputs never vary. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededF32(n: number, seed: number, scale = 1): Float32Array {
  const rng = mulberry32(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (rng() * 2 - 1) * scale;
  }
  return out;
}

/** Minimal deterministic essentia stub — isolates framing/alloc overhead. */
function makeStubEssentia(spectrumSize: number): EssentiaInstance {
  const spectrum = seededF32(spectrumSize, 42, 0.5);
  return {
    arrayToVector: (arr: Float32Array) => arr,
    vectorToArray: (vec: unknown) => vec as Float32Array,
    Windowing: (frame: unknown) => ({ frame }),
    Spectrum: () => ({ spectrum }),
    PitchYinFFT: () => ({ pitch: 440, pitchConfidence: 0.8 }),
    Flux: () => ({ flux: 0.5 }),
    delete: () => undefined,
    shutdown: () => undefined,
  };
}

interface BenchResult {
  opsPerSec: number;
  meanMs: number;
  p95Ms: number;
  frameBudgetPct: number;
  allocKbPerOp: number;
}

interface BenchCase {
  name: string;
  warmup: number;
  samples: number;
  fn?: () => void;
  asyncFn?: () => Promise<void>;
}

async function runCase(c: BenchCase): Promise<BenchResult> {
  const run = c.asyncFn ?? (async () => c.fn!());
  for (let i = 0; i < c.warmup; i++) {
    await run();
  }
  const canGc = typeof global.gc === "function";
  if (canGc) {
    global.gc!();
  }
  const heap0 = process.memoryUsage().heapUsed;
  const times = new Float64Array(c.samples);
  for (let i = 0; i < c.samples; i++) {
    const t0 = performance.now();
    await run();
    times[i] = performance.now() - t0;
  }
  const heap1 = process.memoryUsage().heapUsed;
  const sorted = Array.from(times).sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / c.samples;
  const p95 = sorted[Math.min(c.samples - 1, Math.floor(c.samples * 0.95))];
  return {
    opsPerSec: Math.round(1000 / mean),
    meanMs: Number(mean.toFixed(4)),
    p95Ms: Number(p95.toFixed(4)),
    frameBudgetPct: Number(((mean / FRAME_BUDGET_MS) * 100).toFixed(2)),
    allocKbPerOp: canGc
      ? Number(Math.max(0, (heap1 - heap0) / 1024 / c.samples).toFixed(1))
      : -1,
  };
}

function buildCases(): BenchCase[] {
  const cases: BenchCase[] = [];
  const frame = { warmup: 50, samples: 200 };

  /* ── dsp.* — per-frame DSP kernels (names kept stable vs baseline) ── */

  {
    const layout = buildPazBandLayout(40, 20000);
    const cache = buildCqtCacheFromLayout(layout, 48000, 4096);
    const timeBuf = seededF32(4096, 1);
    const outDb = new Float32Array(layout.numBins);
    cases.push({
      name: "goertzelCqt.pazFrame4096",
      ...frame,
      fn: () => goertzelCqt(timeBuf, cache, outDb),
    });
  }

  {
    const data = seededF32(300, 2, 60);
    cases.push({
      name: "quinticBSplineSmooth.300",
      ...frame,
      fn: () => quinticBSplineSmooth(data),
    });
  }

  {
    const srcXs = new Float64Array(128);
    for (let i = 0; i < 128; i++) {
      srcXs[i] = 20 * Math.pow(1000, i / 127);
    }
    const srcYs = seededF32(128, 3, 60);
    cases.push({
      name: "akimaResample.128to300",
      ...frame,
      fn: () => akimaResample(srcXs, srcYs, logFreqs),
    });
  }

  {
    const cur = seededF32(300, 4, 60);
    const ema = new Float32Array(300);
    cases.push({
      name: "liveBallistics.emaFrame300",
      ...frame,
      fn: () => {
        const tau = releaseTimeConstantSec(15);
        const decay = emaDecayFromTimeConstant(tau, 1 / 60);
        for (let i = 0; i < 300; i++) {
          ema[i] = decay * ema[i] + (1 - decay) * cur[i];
        }
      },
    });
  }

  {
    const cur = seededF32(300, 5, 60);
    const peak = new Float32Array(300).fill(-120);
    const tmp = new Float32Array(300);
    cases.push({
      name: "spectralPeakDisplay.frame300",
      ...frame,
      fn: () => {
        for (let i = 0; i < 300; i++) {
          peak[i] = stepSpectralPeakDisplay(cur[i], peak[i], 0.25);
        }
        smoothPeakDisplayAlongBinsInto(peak, tmp, 300);
      },
    });
  }

  {
    const l = seededF32(4096, 6);
    const r = seededF32(4096, 7);
    const out = new Float32Array(64);
    cases.push({
      name: "stereoPolarField.instant4096x64",
      ...frame,
      fn: () => computeInstantPolarBins(l, r, out, 4, 0.18),
    });
  }

  {
    const rng = mulberry32(8);
    const bands: EqFilterBand[] = [];
    for (let i = 0; i < 10; i++) {
      bands.push({
        enabled: true,
        type: "peaking",
        frequency: 20 * Math.pow(1000, i / 9),
        gainDb: rng() * 12 - 6,
        q: 0.5 + rng() * 4,
      });
    }
    const curve = new Float32Array(logFreqs.length);
    cases.push({
      name: "eqCanvasMath.curve300plus10band",
      ...frame,
      fn: () => {
        for (let i = 0; i < logFreqs.length; i++) {
          curve[i] = getTotalEqResponseDb(logFreqs[i], -3, bands);
        }
        computeListenMatchDb(-3, bands);
      },
    });
  }

  {
    const engine = new FrequencyPhaseCorrelationEngine();
    const mixL = seededF32(2048, 9);
    const mixR = seededF32(2048, 10);
    cases.push({
      name: "phaseCorrelation.fft2048",
      ...frame,
      fn: () => engine.computeRhoPerBin(mixL, mixR, 48000),
    });
  }

  /* ── anim.* — RAF frame-preparation chains ────────────────────── */

  {
    // Mirrors spectralAnalyzerComponent._computeFftFrame data prep:
    // 1024 analyser bins → dB/tilt math → akima resample → B-spline smooth.
    const binCount = 1024;
    const binHz = 48000 / 2048;
    const dbFloor = -90;
    const dBL = seededF32(binCount, 11, 45);
    const dBR = seededF32(binCount, 12, 45);
    const srcXs = new Float64Array(binCount);
    const srcYs = new Float64Array(binCount);
    const resampleOut = new Float32Array(logFreqs.length);
    const smoothOut = new Float32Array(logFreqs.length);
    cases.push({
      name: "anim.fftFramePrep.1024to300",
      ...frame,
      fn: () => {
        for (let k = 0; k < binCount; k++) {
          const f = (k + 0.5) * binHz;
          srcXs[k] = f;
          const lLin = Math.pow(10, (dBL[k] - 45) / 20);
          const rLin = Math.pow(10, (dBR[k] - 45) / 20);
          const pLin = Math.sqrt(lLin * lLin + rLin * rLin) / Math.SQRT2 + 1e-15;
          let db = 20 * Math.log10(pLin);
          db += spectrumTiltDbAboveFloor(f, 3, db, dbFloor, 18);
          srcYs[k] = Math.max(dbFloor, db);
        }
        akimaResampleInto(srcXs, srcYs, logFreqs, resampleOut);
        quinticBSplineSmoothInto(resampleOut, smoothOut);
      },
    });
  }

  /* ── pipeline.* — offline analysis framing loops ──────────────── */

  {
    const sr = 48000;
    const audio = seededF32(sr * 3, 13, 0.8);
    const essentia = makeStubEssentia(2049);
    cases.push({
      name: "pipeline.stftFrames.3s.w4096h1024",
      warmup: 3,
      samples: 20,
      asyncFn: async () => {
        await computeEssentiaStftSpectrogram(essentia, audio, sr, {
          windowSize: 4096,
          windowType: "hann",
          hopSize: 1024,
          minTime: 0,
          maxTime: 3,
          minFrequency: 0,
          maxFrequency: sr / 2,
        });
      },
    });
  }

  {
    const sr = 48000;
    const audio = seededF32(sr * 3, 14, 0.8);
    const essentia = makeStubEssentia(1025);
    cases.push({
      name: "pipeline.sequenceFeatures.3s.hop20ms",
      warmup: 3,
      samples: 20,
      asyncFn: async () => {
        await computeSequenceFeatures(essentia, audio, sr, 0.02);
      },
    });
  }

  /* ── io.* — serialization / encoding ──────────────────────────── */

  {
    const sr = 48000;
    const ch0 = seededF32(sr * 5, 15, 0.9);
    const ch1 = seededF32(sr * 5, 16, 0.9);
    cases.push({
      name: "io.wavEncode.stereo5s48k",
      warmup: 5,
      samples: 30,
      fn: () => encodeToWav([ch0, ch1], sr, 2),
    });
  }

  {
    const frameCount = 500;
    const binCount = 1024;
    const db = seededF32(frameCount * binCount, 17, 90);
    const wire: StftSpectrogramWire = {
      frameCount,
      binCount,
      dbValues: db.buffer.slice(0) as ArrayBuffer,
    };
    cases.push({
      name: "io.stftWireToSpectrogram.500x1024",
      warmup: 5,
      samples: 30,
      fn: () => stftWireToSpectrogram(wire),
    });
  }

  /* ── render.* — spectrogram texture-upload data prep ──────────── */

  {
    // Full one-shot Ooura spectrogram: 3 s @ 48 kHz, W1024, hop 80
    // (≈ the hop heuristic for a full view on the 1800 px canvas).
    const sr = 48000;
    const audio = seededF32(sr * 3, 19, 0.8);
    const fakeBuffer = {
      sampleRate: sr,
      numberOfChannels: 1,
      duration: 3,
      length: audio.length,
      getChannelData: () => audio,
    } as unknown as AudioBuffer;
    const service = new AnalyzeService(fakeBuffer);
    const settings = {
      waveformVerticalScale: 1,
      spectrogramVerticalScale: 1,
      windowSize: 1024,
      hopSize: 80,
      minFrequency: 0,
      maxFrequency: sr / 2,
      minTime: 0,
      maxTime: 3,
      minAmplitude: -1,
      maxAmplitude: 1,
      spectrogramAmplitudeRange: -90,
      spectrogramAmplitudeLow: -90,
      spectrogramAmplitudeHigh: 0,
      frequencyScale: 0,
      frequencyScaleHybridRatio: 0.5,
      melFilterNum: 40,
      windowType: 0,
      fftBackend: 0,
    };
    cases.push({
      name: "render.oouraSpectrogram.3s.w1024h80",
      warmup: 2,
      samples: 10,
      fn: () => service.getSpectrogram(0, settings),
    });
  }

  {
    // Mirrors SpectrogramRenderer.render(): number[][] grid → Float32Array
    // upload buffer (1755 frames × 2048 bins ≈ 14 MB texture).
    const frameCount = 1755;
    const binCount = 2048;
    const rng = mulberry32(18);
    const grid: number[][] = new Array(frameCount);
    for (let f = 0; f < frameCount; f++) {
      const row = new Array<number>(binCount);
      for (let b = 0; b < binCount; b++) {
        row[b] = rng() * -90;
      }
      grid[f] = row;
    }
    cases.push({
      name: "render.spectrogramTexFlatten.1755x2048",
      warmup: 3,
      samples: 20,
      fn: () => flattenSpectrogramForUpload(grid, frameCount, binCount),
    });
  }

  return cases;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const saveIdx = args.indexOf("--save");
  const savePath = saveIdx >= 0 ? args[saveIdx + 1] : null;

  const dsp: Record<string, BenchResult> = {};
  for (const c of buildCases()) {
    const r = await runCase(c);
    dsp[c.name] = r;
    const alloc = r.allocKbPerOp >= 0 ? `${r.allocKbPerOp} KiB/op` : "n/a";
    console.log(
      `${c.name.padEnd(38)} ${String(r.opsPerSec).padStart(9)} ops/s  ` +
        `mean ${r.meanMs.toFixed(4)} ms  p95 ${r.p95Ms.toFixed(4)} ms  ` +
        `frame ${String(r.frameBudgetPct).padStart(6)}%  alloc ${alloc}`,
    );
  }

  if (savePath) {
    const abs = path.resolve(process.cwd(), savePath);
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(abs)) {
      try {
        existing = JSON.parse(fs.readFileSync(abs, "utf8"));
      } catch {
        existing = {};
      }
    }
    const merged = {
      ...existing,
      meta: {
        node: process.version,
        date: new Date().toISOString(),
        gcExposed: typeof global.gc === "function",
      },
      dsp,
    };
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(merged, null, 2) + "\n");
    console.log(`\nsaved: ${savePath}`);
  }
}

void main();
