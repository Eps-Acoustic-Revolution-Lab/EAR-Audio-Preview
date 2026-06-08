import SequenceFeatureService from "./sequenceFeatureService";
import {
  computeSequenceFeatures,
  profileFromWire,
  profileToWire,
  type SequenceFeatureProfile,
} from "../../shared/sequenceFeatureCompute";
import type { EssentiaInstance } from "../../shared/essentiaTypes";
import {
  ExtMessageType,
  WebviewMessageType,
  type PostMessage,
} from "../../message";

function makeMockEssentia() {
  let prevSpecLen = 0;
  let frameIdx = 0;
  return {
    arrayToVector: (arr: Float32Array) => arr,
    vectorToArray: (vec: unknown) => vec as Float32Array,
    Windowing: (frame: unknown) => ({ frame }),
    Spectrum: (frame: unknown) => {
      const f = frame as Float32Array;
      const spectrum = new Float32Array(f.length / 2);
      for (let i = 0; i < spectrum.length; i++) {
        spectrum[i] = Math.abs(f[i] ?? 0);
      }
      return { spectrum };
    },
    PitchYinFFT: () => {
      frameIdx++;
      if (frameIdx % 3 === 0) {
        return { pitch: 0, pitchConfidence: 0.1 };
      }
      return { pitch: 220 + frameIdx, pitchConfidence: 0.9 };
    },
    Flux: () => {
      prevSpecLen++;
      return { flux: prevSpecLen <= 1 ? 0 : 0.5 + frameIdx * 0.01 };
    },
  };
}

function makeAudioBuffer(length: number, sampleRate = 44100): AudioBuffer {
  return {
    duration: length / sampleRate,
    sampleRate,
    numberOfChannels: 1,
    length,
    getChannelData: () => new Float32Array(length),
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe("computeSequenceFeatures", () => {
  test("produces aligned time stamps and marks unvoiced F0 as NaN", async () => {
    const sampleRate = 44100;
    const hopSec = 0.1;
    const hopSize = Math.round(hopSec * sampleRate);
    const data = new Float32Array(sampleRate * 2);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const essentia = makeMockEssentia();
    const profile = await computeSequenceFeatures(
      essentia as unknown as EssentiaInstance,
      data,
      sampleRate,
      hopSec,
    );

    expect(profile.timeSec.length).toBeGreaterThan(0);
    expect(profile.f0Hz.length).toBe(profile.timeSec.length);
    expect(profile.onsetFlux.length).toBe(profile.timeSec.length);
    expect(profile.onsetFlux[0]).toBe(0);

    const startCenter = 1024;
    expect(profile.timeSec[0]).toBeCloseTo(startCenter / sampleRate, 5);
    expect(profile.timeSec[1]).toBeCloseTo(
      (startCenter + hopSize) / sampleRate,
      5,
    );

    const unvoiced = profile.f0Hz.filter((v) => !Number.isFinite(v));
    const voiced = profile.f0Hz.filter((v) => Number.isFinite(v));
    expect(unvoiced.length).toBeGreaterThan(0);
    expect(voiced.length).toBeGreaterThan(0);
  });
});

describe("profile wire roundtrip", () => {
  test("preserves float arrays through ArrayBuffer transfer", () => {
    const profile: SequenceFeatureProfile = {
      timeSec: new Float32Array([0, 0.1, 0.2]),
      f0Hz: new Float32Array([220, NaN, 440]),
      f0Confidence: new Float32Array([0.9, 0.1, 0.8]),
      onsetFlux: new Float32Array([0, 0.5, 1.2]),
      sampleRate: 44100,
      hopSec: 0.1,
    };
    const restored = profileFromWire(profileToWire(profile));
    expect(Array.from(restored.timeSec)).toEqual(Array.from(profile.timeSec));
    expect(Array.from(restored.f0Hz)).toEqual(Array.from(profile.f0Hz));
    expect(Array.from(restored.onsetFlux)).toEqual(
      Array.from(profile.onsetFlux),
    );
  });
});

describe("SequenceFeatureService", () => {
  test("returns null when extension reports no profile", async () => {
    const buffer = makeAudioBuffer(44100);
    let capturedRequestId = "";
    const postMessage: PostMessage = (msg) => {
      if (WebviewMessageType.isAnalyzeSequenceFeatures(msg)) {
        capturedRequestId = msg.data.requestId;
        queueMicrotask(() => {
          SequenceFeatureService.handleExtensionResponse({
            type: ExtMessageType.SEQUENCE_FEATURES,
            data: { requestId: capturedRequestId },
          });
        });
      }
    };

    const svc = new SequenceFeatureService(buffer, postMessage);
    const profile = await svc.analyzeProfile(0.1);
    expect(profile).toBeNull();
  });

  test("caches profile after first analysis", async () => {
    const buffer = makeAudioBuffer(22050);
    const postMessage: PostMessage = (msg) => {
      if (WebviewMessageType.isAnalyzeSequenceFeatures(msg)) {
        const { requestId } = msg.data;
        queueMicrotask(() => {
          SequenceFeatureService.handleExtensionResponse({
            type: ExtMessageType.SEQUENCE_FEATURES,
            data: {
              requestId,
              profile: profileToWire({
                timeSec: new Float32Array([0, 0.1]),
                f0Hz: new Float32Array([220, 440]),
                f0Confidence: new Float32Array([0.9, 0.9]),
                onsetFlux: new Float32Array([0, 0.3]),
                sampleRate: 44100,
                hopSec: 0.1,
              }),
            },
          });
        });
      }
    };

    const svc = new SequenceFeatureService(buffer, postMessage);
    const first = await svc.analyzeProfile(0.1);
    const second = await svc.analyzeProfile(0.1);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });
});
