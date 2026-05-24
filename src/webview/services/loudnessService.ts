import {
  LoudnessWorkletNode,
  type LoudnessMeasurements,
  type LoudnessSnapshot,
} from "loudness-worklet";
import {
  ensureEbur128Loaded,
  ebur128TruePeakMono,
  ebur128TruePeakStereo,
} from "../utils/ebur128Loader";
import { loadLoudnessWorkletModule } from "../utils/loudnessWorkletLoader";

export interface LoudnessProfile {
  timeSec: Float32Array;
  momentaryLufs: Float32Array;
  shortTermLufs: Float32Array;
  truePeakDbTp: Float32Array;
  integratedLufs: number;
  loudnessRangeLu: number;
  maxTruePeakDbTp: number;
  plrLu: number;
}

export interface TruePeakWindowResult {
  l: number;
  r: number;
  max: number;
}

const silenceLufs = -70;

function sanitizeLufs(v: number): number {
  if (!Number.isFinite(v) || v <= silenceLufs) {
    return NaN;
  }
  return v;
}

function primaryMeasurement(
  snap: LoudnessSnapshot | undefined,
): LoudnessMeasurements | null {
  if (!snap?.currentMeasurements?.length) {
    return null;
  }
  return snap.currentMeasurements[0];
}

function finiteMax(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length ? Math.max(...finite) : NaN;
}

export function mergeSnapshots(snapshots: LoudnessSnapshot[]): LoudnessProfile {
  const times: number[] = [];
  const momentary: number[] = [];
  const shortTerm: number[] = [];
  const truePeak: number[] = [];
  let previousMaximumTruePeak = Number.NEGATIVE_INFINITY;

  for (const snap of snapshots) {
    const m = primaryMeasurement(snap);
    if (!m) {continue;}
    times.push(snap.currentTime);
    momentary.push(sanitizeLufs(m.momentaryLoudness));
    shortTerm.push(sanitizeLufs(m.shortTermLoudness));
    const currentMaximumTruePeak = m.maximumTruePeakLevel;
    truePeak.push(
      Number.isFinite(currentMaximumTruePeak) &&
        currentMaximumTruePeak > previousMaximumTruePeak + 1e-6
        ? currentMaximumTruePeak
        : NaN,
    );
    if (
      Number.isFinite(currentMaximumTruePeak) &&
      currentMaximumTruePeak > previousMaximumTruePeak
    ) {
      previousMaximumTruePeak = currentMaximumTruePeak;
    }
  }

  const last = snapshots[snapshots.length - 1];
  const finalM = primaryMeasurement(last);
  const integratedLufs = finalM?.integratedLoudness ?? NaN;
  const loudnessRangeLu = finalM?.loudnessRange ?? NaN;
  const maxTruePeakDbTp = finalM?.maximumTruePeakLevel ?? NaN;
  const plrLu =
    Number.isFinite(integratedLufs) && Number.isFinite(maxTruePeakDbTp)
      ? maxTruePeakDbTp - integratedLufs
      : NaN;

  return {
    timeSec: Float32Array.from(times),
    momentaryLufs: Float32Array.from(momentary),
    shortTermLufs: Float32Array.from(shortTerm),
    truePeakDbTp: Float32Array.from(truePeak),
    integratedLufs,
    loudnessRangeLu,
    maxTruePeakDbTp,
    plrLu,
  };
}

export default class LoudnessService {
  private _audioBuffer: AudioBuffer;
  private _profileCache: LoudnessProfile | null = null;
  private _profilePromise: Promise<LoudnessProfile> | null = null;

  constructor(audioBuffer: AudioBuffer) {
    this._audioBuffer = audioBuffer;
  }

  /** Preload ebur128 WASM (webpack async chunk). Safe to call multiple times. */
  public async ensureReady(): Promise<void> {
    try {
      await ensureEbur128Loaded();
    } catch {
      // True Peak is optional for UI rendering; callers receive NaN fallbacks.
    }
  }

  public get cachedProfile(): LoudnessProfile | null {
    return this._profileCache;
  }

  /** Whole-file EBU R128 profile via OfflineAudioContext + loudness-worklet. */
  public analyzeFileProfile(hopSec = 0.1): Promise<LoudnessProfile> {
    if (this._profileCache) {
      return Promise.resolve(this._profileCache);
    }
    if (this._profilePromise) {
      return this._profilePromise;
    }
    this._profilePromise = this._runOfflineAnalysis(hopSec).then((profile) => {
      this._profileCache = profile;
      return profile;
    });
    return this._profilePromise;
  }

  private async _runOfflineAnalysis(hopSec: number): Promise<LoudnessProfile> {
    await this.ensureReady();
    const buffer = this._audioBuffer;
    const { numberOfChannels, length, sampleRate } = buffer;
    const duration = buffer.duration;
    const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    await loadLoudnessWorkletModule(ctx);

    const snapshots: LoudnessSnapshot[] = [];
    const worklet = new LoudnessWorkletNode(ctx, {
      processorOptions: {
        interval: hopSec,
        capacity: duration,
      },
    });
    worklet.port.onmessage = (e: MessageEvent<LoudnessSnapshot>) => {
      snapshots.push(e.data);
    };

    const source = new AudioBufferSourceNode(ctx, { buffer });
    source.connect(worklet).connect(ctx.destination);
    source.start();
    await ctx.startRendering();
    worklet.disconnect();

    let profile = mergeSnapshots(snapshots);

    const fileTp = this.truePeakFile();
    if (Number.isFinite(fileTp.max) && fileTp.max > profile.maxTruePeakDbTp) {
      profile = {
        ...profile,
        maxTruePeakDbTp: fileTp.max,
        plrLu: Number.isFinite(profile.integratedLufs)
          ? fileTp.max - profile.integratedLufs
          : profile.plrLu,
      };
    }

    return profile;
  }

  /** True peak (dBTP) for a window slice — used by waveform hover. */
  public truePeakWindow(
    left: Float32Array,
    right: Float32Array | null,
    sampleRate: number,
  ): TruePeakWindowResult {
    if (left.length < 1) {
      return { l: NaN, r: NaN, max: NaN };
    }
    if (right && right.length === left.length) {
      const lDb = this._safeTruePeakMono(sampleRate, left);
      const rDb = this._safeTruePeakMono(sampleRate, right);
      const linked = this._safeTruePeakStereo(sampleRate, left, right);
      return {
        l: lDb,
        r: rDb,
        max: finiteMax([lDb, rDb, linked]),
      };
    }
    const lDb = this._safeTruePeakMono(sampleRate, left);
    return { l: lDb, r: NaN, max: lDb };
  }

  /** Full-file true peak per channel (InfoTable summary). */
  public truePeakFile(): TruePeakWindowResult {
    const sr = this._audioBuffer.sampleRate;
    const ch0 = this._audioBuffer.getChannelData(0);
    if (this._audioBuffer.numberOfChannels >= 2) {
      const ch1 = this._audioBuffer.getChannelData(1);
      return this.truePeakWindow(ch0, ch1, sr);
    }
    return this.truePeakWindow(ch0, null, sr);
  }

  /** Per-buffer true peak for live meter (analyser time-domain chunk). */
  public truePeakBuffer(
    samples: Float32Array,
    sampleRate: number,
  ): number {
    if (samples.length < 1) {
      return NaN;
    }
    return this._safeTruePeakMono(sampleRate, samples);
  }

  private _safeTruePeakMono(
    sampleRate: number,
    samples: Float32Array,
  ): number {
    try {
      return ebur128TruePeakMono(sampleRate, samples);
    } catch {
      return NaN;
    }
  }

  private _safeTruePeakStereo(
    sampleRate: number,
    left: Float32Array,
    right: Float32Array,
  ): number {
    try {
      return ebur128TruePeakStereo(sampleRate, left, right);
    } catch {
      return NaN;
    }
  }
}

export function formatLufs(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {return "—";}
  return `${value.toFixed(digits)} LUFS`;
}

export function formatLu(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {return "—";}
  return `${value.toFixed(digits)} LU`;
}

export function formatDbTp(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {return "—";}
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} dBTP`;
}

export function formatDbFs(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {return "—";}
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} dBFS`;
}
