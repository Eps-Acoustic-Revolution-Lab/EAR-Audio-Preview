import type { EssentiaInstance } from "./essentiaTypes";

export interface SequenceFeatureProfile {
  timeSec: Float32Array;
  f0Hz: Float32Array;
  f0Confidence: Float32Array;
  onsetFlux: Float32Array;
  sampleRate: number;
  hopSec: number;
}

export interface SequenceFeatureProfileWire {
  timeSec: ArrayBuffer;
  f0Hz: ArrayBuffer;
  f0Confidence: ArrayBuffer;
  onsetFlux: ArrayBuffer;
  sampleRate: number;
  hopSec: number;
}

export type SequenceAnalysisProgress = (percent: number) => void;

const frameSize = 2048;
const f0MinHz = 80;
const f0MaxHz = 4000;
const f0ConfidenceThreshold = 0.5;
/** Yield to the event loop only after this much continuous compute time. */
const yieldIntervalMs = 12;

function extractFrame(
  data: Float32Array,
  center: number,
  size: number,
  out: Float32Array,
): Float32Array {
  const half = size / 2;
  for (let j = 0; j < size; j++) {
    const idx = center - half + j;
    out[j] = idx >= 0 && idx < data.length ? data[idx] : 0;
  }
  return out;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function profileToWire(
  profile: SequenceFeatureProfile,
): SequenceFeatureProfileWire {
  return {
    timeSec: profile.timeSec.buffer.slice(
      profile.timeSec.byteOffset,
      profile.timeSec.byteOffset + profile.timeSec.byteLength,
    ),
    f0Hz: profile.f0Hz.buffer.slice(
      profile.f0Hz.byteOffset,
      profile.f0Hz.byteOffset + profile.f0Hz.byteLength,
    ),
    f0Confidence: profile.f0Confidence.buffer.slice(
      profile.f0Confidence.byteOffset,
      profile.f0Confidence.byteOffset + profile.f0Confidence.byteLength,
    ),
    onsetFlux: profile.onsetFlux.buffer.slice(
      profile.onsetFlux.byteOffset,
      profile.onsetFlux.byteOffset + profile.onsetFlux.byteLength,
    ),
    sampleRate: profile.sampleRate,
    hopSec: profile.hopSec,
  };
}

export function profileFromWire(
  wire: SequenceFeatureProfileWire,
): SequenceFeatureProfile {
  return {
    timeSec: new Float32Array(wire.timeSec),
    f0Hz: new Float32Array(wire.f0Hz),
    f0Confidence: new Float32Array(wire.f0Confidence),
    onsetFlux: new Float32Array(wire.onsetFlux),
    sampleRate: wire.sampleRate,
    hopSec: wire.hopSec,
  };
}

/** Frame loop for F0 + spectral flux. Runs in Extension Host (Node) — not in webview. */
export async function computeSequenceFeatures(
  essentia: EssentiaInstance,
  data: Float32Array,
  sampleRate: number,
  hopSec: number,
  onProgress?: SequenceAnalysisProgress,
): Promise<SequenceFeatureProfile> {
  const hopSize = Math.max(1, Math.round(hopSec * sampleRate));
  const startCenter = Math.floor(frameSize / 2);
  const endCenter = data.length - Math.floor(frameSize / 2);
  const frameCount =
    endCenter > startCenter
      ? Math.floor((endCenter - startCenter) / hopSize) + 1
      : 0;

  const timeSec = new Float32Array(frameCount);
  const f0Hz = new Float32Array(frameCount);
  const f0Confidence = new Float32Array(frameCount);
  const onsetFlux = new Float32Array(frameCount);

  let frameIdx = 0;
  let lastYieldMs = Date.now();

  // Reused per-frame buffer — essentia copies it into a WASM vector each call.
  const frameBuf = new Float32Array(frameSize);

  for (let center = startCenter; center <= endCenter; center += hopSize) {
    if (frameIdx > 0 && Date.now() - lastYieldMs >= yieldIntervalMs) {
      onProgress?.(Math.min(99, (frameIdx / Math.max(1, frameCount)) * 100));
      await yieldToMain();
      lastYieldMs = Date.now();
    }

    timeSec[frameIdx] = center / sampleRate;

    const frame = extractFrame(data, center, frameSize, frameBuf);
    const frameVec = essentia.arrayToVector(frame);
    const windowed = essentia.Windowing(
      frameVec,
      false,
      frameSize,
      "hann",
      0,
      false,
    );
    const specOut = essentia.Spectrum(windowed.frame, frameSize);

    const pitchOut = essentia.PitchYinFFT(
      specOut.spectrum,
      frameSize,
      true,
      f0MaxHz,
      f0MinHz,
      sampleRate,
    );
    const pitch = pitchOut.pitch;
    const conf = pitchOut.pitchConfidence;
    f0Confidence[frameIdx] = conf;
    if (
      Number.isFinite(pitch) &&
      pitch > 0 &&
      Number.isFinite(conf) &&
      conf >= f0ConfidenceThreshold
    ) {
      f0Hz[frameIdx] = pitch;
    } else {
      f0Hz[frameIdx] = NaN;
    }

    if (frameIdx > 0) {
      const fluxOut = essentia.Flux(specOut.spectrum, true, "L2");
      onsetFlux[frameIdx] = Number.isFinite(fluxOut.flux) ? fluxOut.flux : 0;
    } else {
      onsetFlux[frameIdx] = 0;
    }
    frameIdx++;
  }

  onProgress?.(100);

  return {
    timeSec,
    f0Hz,
    f0Confidence,
    onsetFlux,
    sampleRate,
    hopSec,
  };
}
