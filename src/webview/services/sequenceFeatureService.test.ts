import { SequenceWorkerClient } from "./sequenceWorkerClient";
import { PageRpcClient } from "./pageRpcClient";
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
          rpc.handleResponse({
            type: ExtMessageType.SEQUENCE_FEATURES,
            data: { requestId: capturedRequestId },
          });
        });
      }
    };

    const rpc = new PageRpcClient(postMessage);
    const svc = new SequenceFeatureService(buffer, rpc);
    const profile = await svc.analyzeProfile(0.1);
    expect(profile).toBeNull();
  });

  test("caches profile after first analysis", async () => {
    const buffer = makeAudioBuffer(22050);
    const postMessage: PostMessage = (msg) => {
      if (WebviewMessageType.isAnalyzeSequenceFeatures(msg)) {
        const { requestId } = msg.data;
        queueMicrotask(() => {
          rpc.handleResponse({
            type: ExtMessageType.SEQUENCE_FEATURES,
            data: {
              requestId,
              payload: profileToWire({
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

    const rpc = new PageRpcClient(postMessage);
    const svc = new SequenceFeatureService(buffer, rpc);
    const first = await svc.analyzeProfile(0.1);
    const second = await svc.analyzeProfile(0.1);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });
});

test("disposal sends cancellation only for its own request and ignores late results", async () => {
  const post = jest.fn();
  const rpc = new PageRpcClient(post);
  const first = new SequenceFeatureService(makeAudioBuffer(44100), rpc);
  const second = new SequenceFeatureService(makeAudioBuffer(44100), rpc);
  const firstResult = first.analyzeProfile();
  const firstId = post.mock.calls[0][0].data.requestId;
  const secondResult = second.analyzeProfile();
  const secondId = post.mock.calls[1][0].data.requestId;
  first.dispose();
  expect(await firstResult).toBeNull();
  expect(post.mock.calls[2][0]).toEqual({
    type: WebviewMessageType.CANCEL_ANALYSIS,
    data: { requestId: firstId },
  });
  rpc.handleResponse({
    type: ExtMessageType.SEQUENCE_FEATURES,
    data: { requestId: firstId, error: "obsolete failure" },
  });
  rpc.handleResponse({
    type: ExtMessageType.SEQUENCE_FEATURES,
    data: { requestId: secondId },
  });
  expect(await secondResult).toBeNull();
  second.dispose();
  expect(post).toHaveBeenCalledTimes(3);
});

test("failed sends settle immediately and permit a fresh request", async () => {
  const post = jest.fn().mockImplementationOnce(() => {
    throw new Error("send failed");
  });
  const rpc = new PageRpcClient(post);
  const service = new SequenceFeatureService(makeAudioBuffer(44100), rpc);
  await expect(service.analyzeProfile()).rejects.toThrow("send failed");
  const result = service.analyzeProfile();
  const requestId = post.mock.calls[1][0].data.requestId;
  rpc.handleResponse({
    type: ExtMessageType.SEQUENCE_FEATURES,
    data: { requestId },
  });
  expect(await result).toBeNull();
  service.dispose();
  expect(post).toHaveBeenCalledTimes(2);
});

test("analysis timeout cancels host work and permits a retry", async () => {
  jest.useFakeTimers();
  try {
    const post = jest.fn();
    const rpc = new PageRpcClient(post);
    const service = new SequenceFeatureService(makeAudioBuffer(44100), rpc);
    const result = service.analyzeProfile();
    const failed = expect(result).rejects.toThrow("timed out");
    const oldId = post.mock.calls[0][0].data.requestId;
    jest.advanceTimersByTime(10 * 60 * 1000);
    await failed;
    expect(post.mock.calls[1][0]).toEqual({
      type: WebviewMessageType.CANCEL_ANALYSIS,
      data: { requestId: oldId },
    });
    expect(
      rpc.handleResponse({
        type: ExtMessageType.SEQUENCE_FEATURES,
        data: { requestId: oldId },
      }),
    ).toBe(false);
    const next = service.analyzeProfile();
    const requestId = post.mock.calls[2][0].data.requestId;
    rpc.handleResponse({
      type: ExtMessageType.SEQUENCE_FEATURES,
      data: { requestId },
    });
    expect(await next).toBeNull();
    service.dispose();
    rpc.dispose();
  } finally {
    jest.useRealTimers();
  }
});

test("harmonics require a worker and never fall back to the host", async () => {
  const post = jest.fn();
  const rpc = new PageRpcClient(post);
  const service = new SequenceFeatureService(makeAudioBuffer(44100), rpc);
  await expect(service.analyzeHarmonics()).rejects.toThrow(
    "requires the background worker",
  );
  expect(post).not.toHaveBeenCalled();
  service.dispose();
  rpc.dispose();
});

test("worker failure falls back once for F0 but not for harmonics", async () => {
  const analyze = jest
    .spyOn(SequenceWorkerClient.prototype, "analyze")
    .mockRejectedValue(new Error("worker failed"));
  const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
  const post = jest.fn();
  const rpc = new PageRpcClient(post);
  const service = new SequenceFeatureService(
    makeAudioBuffer(44100),
    rpc,
    undefined,
    { sequenceWorkerUri: "worker", essentiaWasmUri: "wasm" },
  );
  const pending = service.analyzeProfile();
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  expect(post).toHaveBeenCalledTimes(1);
  rpc.handleResponse({
    type: ExtMessageType.SEQUENCE_FEATURES,
    data: { requestId: post.mock.calls[0][0].data.requestId },
  });
  await expect(pending).resolves.toBeNull();
  await expect(service.analyzeHarmonics()).rejects.toThrow("worker failed");
  expect(post).toHaveBeenCalledTimes(1);
  service.dispose();
  rpc.dispose();
  analyze.mockRestore();
  warning.mockRestore();
});

test("worker harmonic requests deduplicate and preserve the normal profile cache", async () => {
  const profile: SequenceFeatureProfile = {
    timeSec: new Float32Array([0]),
    f0Hz: new Float32Array([440]),
    f0Confidence: new Float32Array([1]),
    onsetFlux: new Float32Array([0]),
    sampleRate: 44100,
    hopSec: 0.05,
  };
  const harmonic = {
    chroma: new Float32Array(12),
    chromaTimeSec: new Float32Array([0]),
    melodyHz: new Float32Array([440]),
    melodyConfidence: new Float32Array([1]),
    melodyHopSec: 128 / 44100,
  };
  const analyze = jest
    .spyOn(SequenceWorkerClient.prototype, "analyze")
    .mockResolvedValueOnce(profileToWire(profile))
    .mockResolvedValueOnce(profileToWire({ ...profile, harmonic }));
  const post = jest.fn();
  const rpc = new PageRpcClient(post);
  const service = new SequenceFeatureService(
    makeAudioBuffer(44100),
    rpc,
    undefined,
    { sequenceWorkerUri: "worker", essentiaWasmUri: "wasm" },
  );
  try {
    const normal = await service.analyzeProfile();
    const first = service.analyzeHarmonics();
    expect(service.analyzeHarmonics()).toBe(first);
    const result = await first;
    expect(result?.harmonic?.melodyHz[0]).toBe(440);
    expect(await service.analyzeHarmonics()).toBe(result);
    expect(await service.analyzeProfile()).toBe(normal);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[1][5]).toBe(true);
    expect(post).not.toHaveBeenCalled();
  } finally {
    service.dispose();
    rpc.dispose();
    analyze.mockRestore();
  }
});
