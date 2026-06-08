import { encodeToWav } from "../encoder";
import {
  EditExportSettingsProps,
  ExportChannelMode,
} from "./editExportSettingsService";
import PlayerSettingsService from "./playerSettingsService";

const filterQ = Math.SQRT1_2;

function createEmptyBuffer(
  numberOfChannels: number,
  length: number,
  sampleRate: number,
): AudioBuffer {
  if (typeof OfflineAudioContext !== "undefined") {
    const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    return ctx.createBuffer(numberOfChannels, length, sampleRate);
  }
  const audioContextCtor = globalThis.AudioContext;
  if (typeof audioContextCtor === "function") {
    const ctx = new audioContextCtor({ sampleRate });
    return ctx.createBuffer(numberOfChannels, length, sampleRate);
  }
  throw new Error("Web Audio API is not available");
}

export function extractRegion(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): AudioBuffer {
  const duration = buffer.duration;
  const start = Math.max(0, Math.min(startSec, duration));
  const end = Math.max(start, Math.min(endSec, duration));
  const sampleRate = buffer.sampleRate;
  const minIndex = Math.floor(start * sampleRate);
  const maxIndex = Math.min(
    buffer.length,
    Math.max(minIndex + 1, Math.floor(end * sampleRate)),
  );
  const length = Math.max(1, maxIndex - minIndex);
  const out = createEmptyBuffer(buffer.numberOfChannels, length, sampleRate);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(minIndex, maxIndex));
  }
  return out;
}

function createBufferLike(
  sampleRate: number,
  numberOfChannels: number,
  length: number,
): AudioBuffer {
  return createEmptyBuffer(numberOfChannels, length, sampleRate);
}

export function applyChannelMode(
  buffer: AudioBuffer,
  mode: ExportChannelMode,
): AudioBuffer {
  const { sampleRate, length } = buffer;
  const channels = buffer.numberOfChannels;

  if (mode === "as_is") {
    return buffer;
  }

  if (mode === "mono_mix") {
    const out = createBufferLike(sampleRate, 1, length);
    const dst = out.getChannelData(0);
    if (channels === 1) {
      dst.set(buffer.getChannelData(0));
      return out;
    }
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      dst[i] = (left[i] + right[i]) * 0.5;
    }
    return out;
  }

  if (mode === "mono_left") {
    const out = createBufferLike(sampleRate, 1, length);
    out.copyToChannel(buffer.getChannelData(0), 0);
    return out;
  }

  if (mode === "mono_right") {
    const out = createBufferLike(sampleRate, 1, length);
    const srcCh = channels > 1 ? 1 : 0;
    out.copyToChannel(buffer.getChannelData(srcCh), 0);
    return out;
  }

  if (mode === "fake_stereo") {
    const out = createBufferLike(sampleRate, 2, length);
    const mono =
      channels === 1
        ? buffer.getChannelData(0)
        : (() => {
            const mixed = new Float32Array(length);
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            for (let i = 0; i < length; i++) {
              mixed[i] = (left[i] + right[i]) * 0.5;
            }
            return mixed;
          })();
    out.copyToChannel(mono, 0);
    out.copyToChannel(mono, 1);
    return out;
  }

  return buffer;
}

export interface OfflineFilterOptions {
  enableHpf: boolean;
  hpfHz: number;
  enableLpf: boolean;
  lpfHz: number;
}

export async function applyOfflineFilters(
  buffer: AudioBuffer,
  options: OfflineFilterOptions,
): Promise<AudioBuffer> {
  if (!options.enableHpf && !options.enableLpf) {
    return buffer;
  }

  const { numberOfChannels, length, sampleRate } = buffer;
  const ctx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  let node: AudioNode = source;
  if (options.enableHpf) {
    const hpf = ctx.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = options.hpfHz;
    hpf.Q.value = filterQ;
    node.connect(hpf);
    node = hpf;
  }
  if (options.enableLpf) {
    const lpf = ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = options.lpfHz;
    lpf.Q.value = filterQ;
    node.connect(lpf);
    node = lpf;
  }
  node.connect(ctx.destination);
  source.start();
  return ctx.startRendering();
}

export async function renderExportBuffer(
  buffer: AudioBuffer,
  settings: EditExportSettingsProps,
): Promise<AudioBuffer> {
  const sliced = extractRegion(
    buffer,
    settings.regionStartSec,
    settings.regionEndSec,
  );
  const channeled = applyChannelMode(sliced, settings.channelMode);
  return applyOfflineFilters(channeled, {
    enableHpf: settings.enableHpf,
    hpfHz: settings.hpfHz,
    enableLpf: settings.enableLpf,
    lpfHz: settings.lpfHz,
  });
}

export async function renderExportWav(
  buffer: AudioBuffer,
  settings: EditExportSettingsProps,
): Promise<Uint8Array> {
  const rendered = await renderExportBuffer(buffer, settings);
  const audioData: Float32Array[] = [];
  for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
    audioData.push(rendered.getChannelData(ch));
  }
  return encodeToWav(audioData, rendered.sampleRate, rendered.numberOfChannels);
}

export function bufferRms(buffer: AudioBuffer, channel = 0): number {
  const data = buffer.getChannelData(channel);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / Math.max(1, data.length));
}

/** Resolve effective filter settings (respects player sync at render time). */
export function resolveExportSettings(
  settings: EditExportSettingsProps,
  player?: PlayerSettingsService,
): EditExportSettingsProps {
  if (!settings.syncFiltersFromPlayer || !player) {
    return settings;
  }
  return {
    ...settings,
    enableHpf: player.enableHpf,
    hpfHz: player.hpfFrequency,
    enableLpf: player.enableLpf,
    lpfHz: player.lpfFrequency,
  };
}
